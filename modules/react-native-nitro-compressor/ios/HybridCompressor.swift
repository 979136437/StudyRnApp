import AVFoundation
import CoreImage
import Foundation
import ImageIO
import NitroModules
import UniformTypeIdentifiers

final class CancellationState: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false

  func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
  }

  func check() throws {
    lock.lock()
    let value = cancelled
    lock.unlock()
    if value { throw CompressorNativeError.cancelled }
  }
}

enum CompressorNativeError: LocalizedError {
  case cancelled
  case invalidSource
  case processing(String)

  var errorDescription: String? {
    switch self {
    case .cancelled: return "Compression cancelled"
    case .invalidSource: return "Unsupported local media path"
    case .processing(let message): return message
    }
  }
}

private final class TaskRegistry: @unchecked Sendable {
  static let shared = TaskRegistry()
  private let lock = NSLock()
  private var tasks: [String: CancellationState] = [:]

  func register(_ id: String) throws -> CancellationState {
    lock.lock()
    defer { lock.unlock() }
    guard tasks[id] == nil else {
      throw CompressorNativeError.processing("Duplicate compression operation id")
    }
    let state = CancellationState()
    tasks[id] = state
    return state
  }

  func cancel(_ id: String) -> Bool {
    lock.lock()
    let state = tasks[id]
    lock.unlock()
    state?.cancel()
    return state != nil
  }

  func finish(_ id: String) {
    lock.lock()
    tasks.removeValue(forKey: id)
    lock.unlock()
  }
}

enum MediaPaths {
  static func sourceURL(_ source: String) throws -> URL {
    if source.hasPrefix("file://"), let url = URL(string: source), url.isFileURL {
      return url
    }
    guard !source.contains("://") else { throw CompressorNativeError.invalidSource }
    return URL(fileURLWithPath: source)
  }

  static func output(_ id: String, extension fileExtension: String) throws -> URL {
    let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("nitro-compressor", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root.appendingPathComponent(id).appendingPathExtension(fileExtension)
  }

  static func size(_ url: URL) -> Double {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attributes?[.size] as? NSNumber)?.doubleValue ?? 0
  }

  static func remove(_ url: URL?) {
    if let url { try? FileManager.default.removeItem(at: url) }
  }
}

final class HybridCompressor: HybridCompressorSpec {
  private static let videoQueue = DispatchQueue(label: "NitroVideoCompressor")

  func createOperationId() throws -> String {
    UUID().uuidString
  }

  func compressImage(
    operationId: String,
    source: String,
    options: ImageCompressionOptions
  ) throws -> Promise<CompressionResult> {
    Promise.parallel {
      try Self.withTask(id: operationId, extension: "jpg") { state, output in
        try ImageCompressor.compress(
          source: MediaPaths.sourceURL(source),
          output: output,
          options: options,
          state: state
        )
      }
    }
  }

  func compressVideo(
    operationId: String,
    source: String,
    options: VideoCompressionOptions
  ) throws -> Promise<CompressionResult> {
    let promise = Promise<CompressionResult>()
    let state: CancellationState
    do {
      state = try TaskRegistry.shared.register(operationId)
    } catch {
      promise.reject(withError: error)
      return promise
    }
    Self.videoQueue.async {
      var output: URL?
      do {
        output = try MediaPaths.output(operationId, extension: "mp4")
        MediaPaths.remove(output)
        let result = try VideoCompressor.compress(
          source: MediaPaths.sourceURL(source),
          output: output!,
          options: options,
          state: state
        )
        promise.resolve(withResult: result)
      } catch {
        MediaPaths.remove(output)
        promise.reject(withError: error)
      }
      TaskRegistry.shared.finish(operationId)
    }
    return promise
  }

  func getImageMetadata(source: String) throws -> Promise<ImageMetadata> {
    Promise.parallel {
      try ImageCompressor.metadata(source: MediaPaths.sourceURL(source))
    }
  }

  func getVideoMetadata(source: String) throws -> Promise<VideoMetadata> {
    Promise.parallel {
      try VideoCompressor.metadata(source: MediaPaths.sourceURL(source))
    }
  }

  func createVideoThumbnail(
    operationId: String,
    source: String,
    options: ThumbnailOptions
  ) throws -> Promise<ThumbnailResult> {
    Promise.parallel {
      try Self.withTask(id: operationId, extension: "jpg") { state, output in
        try VideoCompressor.thumbnail(
          source: MediaPaths.sourceURL(source),
          output: output,
          options: options,
          state: state
        )
      }
    }
  }

  func cancel(operationId: String) throws -> Bool {
    TaskRegistry.shared.cancel(operationId)
  }

  private static func withTask<T>(
    id: String,
    extension fileExtension: String,
    run: (CancellationState, URL) throws -> T
  ) throws -> T {
    let state = try TaskRegistry.shared.register(id)
    let output = try MediaPaths.output(id, extension: fileExtension)
    MediaPaths.remove(output)
    defer { TaskRegistry.shared.finish(id) }
    do {
      try state.check()
      return try run(state, output)
    } catch {
      MediaPaths.remove(output)
      throw error
    }
  }
}

private enum ImageCompressor {
  static func metadata(source: URL) throws -> ImageMetadata {
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
          let rawWidth = properties[kCGImagePropertyPixelWidth] as? NSNumber,
          let rawHeight = properties[kCGImagePropertyPixelHeight] as? NSNumber else {
      throw CompressorNativeError.processing("Unable to read image metadata")
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    let rotated = [5, 6, 7, 8].contains(orientation)
    return ImageMetadata(
      size: MediaPaths.size(source),
      width: rotated ? rawHeight.doubleValue : rawWidth.doubleValue,
      height: rotated ? rawWidth.doubleValue : rawHeight.doubleValue
    )
  }

  static func compress(
    source: URL,
    output: URL,
    options: ImageCompressionOptions,
    state: CancellationState
  ) throws -> CompressionResult {
    let info = try metadata(source: source)
    let widthScale = options.maxWidth.map { $0 / info.width } ?? 1
    let heightScale = options.maxHeight.map { $0 / info.height } ?? 1
    let scale = min(1, min(widthScale, heightScale))
    let width = max(1, Int((info.width * scale).rounded()))
    let height = max(1, Int((info.height * scale).rounded()))
    try state.check()
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
          let image = CGImageSourceCreateThumbnailAtIndex(
            imageSource,
            0,
            [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: max(width, height),
            ] as CFDictionary
          ) else {
      throw CompressorNativeError.processing("Unable to decode image")
    }
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      throw CompressorNativeError.processing("Unable to create image context")
    }
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let flattened = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(
            output as CFURL,
            UTType.jpeg.identifier as CFString,
            1,
            nil
          ) else {
      throw CompressorNativeError.processing("Unable to create JPEG output")
    }
    try state.check()
    CGImageDestinationAddImage(
      destination,
      flattened,
      [kCGImageDestinationLossyCompressionQuality: options.quality / 100] as CFDictionary
    )
    guard CGImageDestinationFinalize(destination) else {
      throw CompressorNativeError.processing("Unable to encode JPEG")
    }
    try state.check()
    return CompressionResult(
      path: output.absoluteString,
      size: MediaPaths.size(output),
      width: Double(width),
      height: Double(height),
      duration: 0,
      fps: 0,
      bitrate: 0
    )
  }
}
