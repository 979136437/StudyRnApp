import NitroModules
import Photos
import UIKit

private final class ThumbnailImageView: UIImageView {
  var onLayout: (() -> Void)?

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }
}

final class HybridMediaThumbnail: HybridMediaThumbnailSpec, RecyclableView {
  private static let placeholderCache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.totalCostLimit = 8 * 1024 * 1024
    return cache
  }()

  private let imageView = ThumbnailImageView(frame: .zero)
  private let imageManager = PHCachingImageManager()
  private var requestId: PHImageRequestID = PHInvalidImageRequestID
  private var requestedKey = ""

  var view: UIView { imageView }
  var assetId = ""
  var resizeMode: ThumbnailResizeMode = .cover
  var shouldDownloadFromNetwork = true
  var onLoad: (ThumbnailLoadEvent) -> Void = { _ in }
  var onError: (ThumbnailErrorEvent) -> Void = { _ in }

  override init() {
    super.init()
    imageView.clipsToBounds = true
    imageView.backgroundColor = .clear
    imageView.onLayout = { [weak self] in self?.loadIfNeeded() }
  }

  func afterUpdate() {
    imageView.contentMode = resizeMode == .contain ? .scaleAspectFit : .scaleAspectFill
    loadIfNeeded()
  }

  func prepareForRecycle() {
    cancelRequest()
    requestedKey = ""
    assetId = ""
    imageView.image = nil
  }

  func onDropView() {
    prepareForRecycle()
    imageView.onLayout = nil
    onLoad = { _ in }
    onError = { _ in }
  }

  private func loadIfNeeded() {
    let size = imageView.bounds.size
    guard !assetId.isEmpty, size.width > 0, size.height > 0 else { return }
    let scale = imageView.window?.screen.scale ?? UIScreen.main.scale
    let target = CGSize(width: size.width * scale, height: size.height * scale)
    let key = "\(assetId):\(Int(target.width))x\(Int(target.height)):\(resizeMode.stringValue):\(shouldDownloadFromNetwork)"
    guard key != requestedKey else { return }

    cancelRequest()
    requestedKey = key
    // 全屏请求完成前沿用网格阶段的小图，避免切换到预览时出现空白帧。
    imageView.image = Self.placeholderCache.object(forKey: assetId as NSString)
    let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let asset = fetch.firstObject else {
      onError(ThumbnailErrorEvent(assetId: assetId, message: "资源不存在或当前权限不可访问"))
      return
    }

    let options = PHImageRequestOptions()
    options.deliveryMode = .opportunistic
    options.resizeMode = .fast
    options.isNetworkAccessAllowed = shouldDownloadFromNetwork
    let contentMode: PHImageContentMode = resizeMode == .contain ? .aspectFit : .aspectFill
    let expectedAssetId = assetId
    requestId = imageManager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: contentMode,
      options: options
    ) { [weak self] image, info in
      guard let self, self.assetId == expectedAssetId else { return }
      if let image {
        self.cachePlaceholder(image, assetId: expectedAssetId)
        self.imageView.image = image
        let degraded = info?[PHImageResultIsDegradedKey] as? Bool ?? false
        if !degraded {
          self.onLoad(ThumbnailLoadEvent(
            assetId: expectedAssetId,
            width: Double(image.size.width),
            height: Double(image.size.height)
          ))
        }
      } else if let error = info?[PHImageErrorKey] as? Error {
        self.onError(ThumbnailErrorEvent(assetId: expectedAssetId, message: error.localizedDescription))
      }
    }
  }

  private func cancelRequest() {
    if requestId != PHInvalidImageRequestID {
      imageManager.cancelImageRequest(requestId)
      requestId = PHInvalidImageRequestID
    }
  }

  private func cachePlaceholder(_ image: UIImage, assetId: String) {
    let key = assetId as NSString
    let cached = Self.placeholderCache.object(forKey: key)
    let imageCost = pixelCost(of: image)
    let cachedCost = cached.map { pixelCost(of: $0) } ?? Int.max
    if cached == nil || imageCost < cachedCost {
      Self.placeholderCache.setObject(image, forKey: key, cost: imageCost)
    }
  }

  private func pixelCost(of image: UIImage) -> Int {
    if let cgImage = image.cgImage {
      return cgImage.bytesPerRow * cgImage.height
    }
    let width = Int(image.size.width * image.scale)
    let height = Int(image.size.height * image.scale)
    return max(1, width * height * 4)
  }
}
