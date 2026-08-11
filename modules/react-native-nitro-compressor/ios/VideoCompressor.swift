import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum VideoCompressor {
  private struct Info {
    let displaySize: CGSize
    let duration: Double
    let fps: Double
    let bitrate: Double
  }

  static func metadata(source: URL) throws -> VideoMetadata {
    let info = try readInfo(source: source)
    return VideoMetadata(
      size: MediaPaths.size(source),
      width: Double(info.displaySize.width),
      height: Double(info.displaySize.height),
      duration: info.duration,
      fps: info.fps,
      bitrate: info.bitrate
    )
  }

  static func thumbnail(
    source: URL,
    output: URL,
    options: ThumbnailOptions,
    state: CancellationState
  ) throws -> ThumbnailResult {
    let asset = AVURLAsset(url: source)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    if let maxWidth = options.maxWidth {
      generator.maximumSize = CGSize(width: maxWidth, height: maxWidth)
    }
    try state.check()
    let image = try generator.copyCGImage(
      at: CMTime(seconds: options.time, preferredTimescale: 600),
      actualTime: nil
    )
    guard let destination = CGImageDestinationCreateWithURL(
      output as CFURL,
      UTType.jpeg.identifier as CFString,
      1,
      nil
    ) else {
      throw CompressorNativeError.processing("Unable to create thumbnail output")
    }
    CGImageDestinationAddImage(
      destination,
      image,
      [kCGImageDestinationLossyCompressionQuality: options.quality / 100] as CFDictionary
    )
    guard CGImageDestinationFinalize(destination) else {
      throw CompressorNativeError.processing("Unable to encode thumbnail")
    }
    try state.check()
    return ThumbnailResult(
      path: output.absoluteString,
      size: MediaPaths.size(output),
      width: Double(image.width),
      height: Double(image.height)
    )
  }

  static func compress(
    source: URL,
    output: URL,
    options: VideoCompressionOptions,
    state: CancellationState
  ) throws -> CompressionResult {
    let asset = AVURLAsset(url: source)
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      throw CompressorNativeError.processing("Video track is missing")
    }
    let info = try readInfo(source: source)
    let scale = min(1, options.maxDimension / max(info.displaySize.width, info.displaySize.height))
    let width = even(info.displaySize.width * scale)
    let height = even(info.displaySize.height * scale)
    let requestedFps = options.fps ?? min(info.fps > 0 ? info.fps : 30, 30)
    let fps = commonFps(min(requestedFps, info.fps > 0 ? info.fps : requestedFps))
    let pixelRatio = width * height / (info.displaySize.width * info.displaySize.height)
    let fpsRatio = info.fps > 0 ? min(1, fps / info.fps) : 1
    let derivedBitrate = info.bitrate > 0
      ? info.bitrate * pixelRatio * fpsRatio
      : width * height * fps * 0.1
    let bitrate = max(250_000, min(options.bitrate ?? derivedBitrate, 50_000_000))

    let reader = try AVAssetReader(asset: asset)
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    let videoOutput = AVAssetReaderTrackOutput(
      track: videoTrack,
      outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      ]
    )
    videoOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(videoOutput) else {
      throw CompressorNativeError.processing("Unable to create video reader")
    }
    reader.add(videoOutput)

    let videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: Int(width),
        AVVideoHeightKey: Int(height),
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: Int(bitrate),
          AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
          AVVideoMaxKeyFrameIntervalDurationKey: 2,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
      ]
    )
    videoInput.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: Int(width),
        kCVPixelBufferHeightKey as String: Int(height),
      ]
    )
    guard writer.canAdd(videoInput) else {
      throw CompressorNativeError.processing("Unable to create video writer")
    }
    writer.add(videoInput)

    var audioOutput: AVAssetReaderTrackOutput?
    var audioInput: AVAssetWriterInput?
    if let audioTrack = asset.tracks(withMediaType: .audio).first {
      let output = AVAssetReaderTrackOutput(
        track: audioTrack,
        outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]
      )
      let input = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: 44_100,
          AVNumberOfChannelsKey: min(2, max(1, channelCount(track: audioTrack))),
          AVEncoderBitRateKey: 128_000,
        ]
      )
      if reader.canAdd(output), writer.canAdd(input) {
        reader.add(output)
        writer.add(input)
        audioOutput = output
        audioInput = input
      }
    }

    guard writer.startWriting(), reader.startReading() else {
      throw writer.error ?? reader.error ?? CompressorNativeError.processing("Unable to start video compression")
    }
    writer.startSession(atSourceTime: .zero)
    let renderContext = CIContext(options: [.cacheIntermediates: false])
    let transform = normalizedTransform(videoTrack.preferredTransform, naturalSize: videoTrack.naturalSize)
    let transformedBounds = CGRect(origin: .zero, size: videoTrack.naturalSize).applying(transform)
    let renderScale = min(width / abs(transformedBounds.width), height / abs(transformedBounds.height))
    let finalTransform = transform.concatenating(CGAffineTransform(scaleX: renderScale, y: renderScale))
    let frameInterval = CMTime(seconds: 1 / fps, preferredTimescale: 600_000)
    var nextFrame = CMTime.zero

    do {
      while let sample = videoOutput.copyNextSampleBuffer() {
        try state.check()
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sample)
        if presentationTime < nextFrame { continue }
        while !videoInput.isReadyForMoreMediaData {
          try state.check()
          Thread.sleep(forTimeInterval: 0.002)
        }
        guard let sourceBuffer = CMSampleBufferGetImageBuffer(sample),
              let pool = adaptor.pixelBufferPool else {
          throw CompressorNativeError.processing("Unable to access video pixel buffer")
        }
        var targetBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &targetBuffer) == kCVReturnSuccess,
              let targetBuffer else {
          throw CompressorNativeError.processing("Unable to allocate output video frame")
        }
        let image = CIImage(cvPixelBuffer: sourceBuffer).transformed(by: finalTransform)
        renderContext.render(
          image,
          to: targetBuffer,
          bounds: CGRect(x: 0, y: 0, width: width, height: height),
          colorSpace: CGColorSpaceCreateDeviceRGB()
        )
        guard adaptor.append(targetBuffer, withPresentationTime: presentationTime) else {
          throw writer.error ?? CompressorNativeError.processing("Unable to append video frame")
        }
        nextFrame = CMTimeAdd(presentationTime, frameInterval)
      }
      videoInput.markAsFinished()

      if let audioOutput, let audioInput {
        while let sample = audioOutput.copyNextSampleBuffer() {
          try state.check()
          while !audioInput.isReadyForMoreMediaData {
            try state.check()
            Thread.sleep(forTimeInterval: 0.002)
          }
          guard audioInput.append(sample) else {
            throw writer.error ?? CompressorNativeError.processing("Unable to append audio sample")
          }
        }
        audioInput.markAsFinished()
      }
      guard reader.status == .completed else {
        throw reader.error ?? CompressorNativeError.processing("Video reader failed")
      }

      let semaphore = DispatchSemaphore(value: 0)
      writer.finishWriting { semaphore.signal() }
      while semaphore.wait(timeout: .now() + 0.05) == .timedOut {
        try state.check()
      }
      guard writer.status == .completed else {
        throw writer.error ?? CompressorNativeError.processing("Video writer failed")
      }
    } catch {
      reader.cancelReading()
      writer.cancelWriting()
      throw error
    }

    try state.check()
    let result = try metadata(source: output)
    return CompressionResult(
      path: output.absoluteString,
      size: MediaPaths.size(output),
      width: result.width,
      height: result.height,
      duration: result.duration,
      fps: result.fps > 0 ? result.fps : fps,
      bitrate: result.bitrate > 0 ? result.bitrate : bitrate
    )
  }

  private static func readInfo(source: URL) throws -> Info {
    let asset = AVURLAsset(url: source)
    guard let track = asset.tracks(withMediaType: .video).first else {
      throw CompressorNativeError.processing("Unable to read video metadata")
    }
    let bounds = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    return Info(
      displaySize: CGSize(width: abs(bounds.width), height: abs(bounds.height)),
      duration: max(0, CMTimeGetSeconds(asset.duration)),
      fps: Double(track.nominalFrameRate),
      bitrate: Double(track.estimatedDataRate)
    )
  }

  private static func normalizedTransform(_ transform: CGAffineTransform, naturalSize: CGSize) -> CGAffineTransform {
    let bounds = CGRect(origin: .zero, size: naturalSize).applying(transform)
    return transform.concatenating(
      CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY)
    )
  }

  private static func channelCount(track: AVAssetTrack) -> Int {
    guard let description = track.formatDescriptions.first,
          let basic = CMAudioFormatDescriptionGetStreamBasicDescription(description) else {
      return 2
    }
    return Int(basic.pointee.mChannelsPerFrame)
  }

  private static func even(_ value: Double) -> Double {
    Double(max(2, (Int(value.rounded()) / 2) * 2))
  }

  private static func commonFps(_ value: Double) -> Double {
    [60, 50, 30, 25, 24, 15].first(where: { Double($0) <= value + 0.01 }).map(Double.init)
      ?? max(1, value)
  }
}
