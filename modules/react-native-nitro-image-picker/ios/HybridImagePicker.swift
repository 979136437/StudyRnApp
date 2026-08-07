import AVFoundation
import NitroModules
import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

private func pickerError(_ code: String, _ message: String) -> Error {
  RuntimeError.error(withMessage: "[\(code)] \(message)")
}

private func topViewController() -> UIViewController? {
  let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  let root = scenes.flatMap(\.windows).first(where: { $0.isKeyWindow })?.rootViewController
  func visible(_ controller: UIViewController?) -> UIViewController? {
    if let presented = controller?.presentedViewController { return visible(presented) }
    if let navigation = controller as? UINavigationController { return visible(navigation.visibleViewController) }
    if let tabs = controller as? UITabBarController { return visible(tabs.selectedViewController) }
    return controller
  }
  return visible(root)
}

private struct CursorPayload: Codable {
  let version: Int
  let offset: Int
  let query: String
  let generation: Int
}

private func encodedCursor(_ offset: Int, query: String, generation: Int) throws -> String {
  let payload = CursorPayload(version: 1, offset: offset, query: query, generation: generation)
  return try JSONEncoder().encode(payload).base64EncodedString()
}

private func decodedCursor(_ cursor: String?, query: String, generation: Int) throws -> Int {
  guard let cursor else { return 0 }
  guard
    let data = Data(base64Encoded: cursor),
    let payload = try? JSONDecoder().decode(CursorPayload.self, from: data),
    payload.version == 1,
    payload.query == query,
    payload.generation == generation,
    payload.offset >= 0
  else {
    throw pickerError("E_INVALID_CURSOR", "分页游标无效或媒体库已变化")
  }
  return payload.offset
}

private func mediaPredicate(_ mediaTypes: [MediaTypeOption]) -> NSPredicate? {
  let values = Set(mediaTypes)
  if values.count == 2 {
    return NSPredicate(
      format: "mediaType == %d OR mediaType == %d",
      PHAssetMediaType.image.rawValue,
      PHAssetMediaType.video.rawValue
    )
  }
  if values.contains(.videos) {
    return NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue)
  }
  return NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
}

private func fetchOptions(_ mediaTypes: [MediaTypeOption]) -> PHFetchOptions {
  let options = PHFetchOptions()
  options.predicate = mediaPredicate(mediaTypes)
  options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
  return options
}

private func permissionResponse(_ status: PHAuthorizationStatus) -> MediaPermissionResponse {
  switch status {
  case .authorized:
    return MediaPermissionResponse(status: .granted, granted: true, canAskAgain: true, accessPrivileges: .all)
  case .limited:
    return MediaPermissionResponse(status: .granted, granted: true, canAskAgain: true, accessPrivileges: .limited)
  case .notDetermined:
    return MediaPermissionResponse(status: .undetermined, granted: false, canAskAgain: true, accessPrivileges: .none)
  case .denied, .restricted:
    return MediaPermissionResponse(status: .denied, granted: false, canAskAgain: false, accessPrivileges: .none)
  @unknown default:
    return MediaPermissionResponse(status: .denied, granted: false, canAskAgain: false, accessPrivileges: .none)
  }
}

private func capturePermissionResponse(_ status: AVAuthorizationStatus) -> MediaPermissionResponse {
  switch status {
  case .authorized:
    return MediaPermissionResponse(status: .granted, granted: true, canAskAgain: true, accessPrivileges: .all)
  case .notDetermined:
    return MediaPermissionResponse(status: .undetermined, granted: false, canAskAgain: true, accessPrivileges: .none)
  case .denied, .restricted:
    return MediaPermissionResponse(status: .denied, granted: false, canAskAgain: false, accessPrivileges: .none)
  @unknown default:
    return MediaPermissionResponse(status: .denied, granted: false, canAskAgain: false, accessPrivileges: .none)
  }
}

private func mimeType(for resource: PHAssetResource) -> String? {
  UTType(resource.uniformTypeIdentifier)?.preferredMIMEType
}

private final class PhotoChangeObserver: NSObject, PHPhotoLibraryChangeObserver {
  var listener: ((MediaLibraryChangeEvent) -> Void)?
  var onChange: (() -> Void)?

  func photoLibraryDidChange(_ changeInstance: PHChange) {
    DispatchQueue.main.async { [weak self] in
      self?.onChange?()
      self?.listener?(MediaLibraryChangeEvent(
        hasIncrementalChanges: false,
        insertedAssetIds: [],
        updatedAssetIds: [],
        deletedAssetIds: []
      ))
    }
  }
}

private final class PickerCoordinator: NSObject,
  PHPickerViewControllerDelegate,
  UINavigationControllerDelegate,
  UIImagePickerControllerDelegate
{
  private var libraryContinuation: CheckedContinuation<[PHPickerResult], Error>?
  private var cameraContinuation: CheckedContinuation<[UIImagePickerController.InfoKey: Any]?, Error>?

  var busy: Bool { libraryContinuation != nil || cameraContinuation != nil }

  @MainActor
  func presentLibrary(configuration: PHPickerConfiguration) async throws -> [PHPickerResult] {
    guard !busy else { throw pickerError("E_PICKER_BUSY", "已有选择器正在显示") }
    guard let presenter = topViewController() else {
      throw pickerError("E_UNAVAILABLE", "找不到可用于显示选择器的界面")
    }
    return try await withCheckedThrowingContinuation { continuation in
      libraryContinuation = continuation
      let picker = PHPickerViewController(configuration: configuration)
      picker.delegate = self
      presenter.present(picker, animated: true)
    }
  }

  @MainActor
  func presentCamera(options: CameraOptions) async throws -> [UIImagePickerController.InfoKey: Any]? {
    guard !busy else { throw pickerError("E_PICKER_BUSY", "已有选择器正在显示") }
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      throw pickerError("E_CAMERA_UNAVAILABLE", "当前设备没有可用相机")
    }
    guard let presenter = topViewController() else {
      throw pickerError("E_UNAVAILABLE", "找不到可用于显示相机的界面")
    }
    return try await withCheckedThrowingContinuation { continuation in
      cameraContinuation = continuation
      let picker = UIImagePickerController()
      picker.delegate = self
      picker.sourceType = .camera
      picker.cameraDevice = options.cameraType == .front ? .front : .rear
      if options.mediaType == .video {
        picker.mediaTypes = [UTType.movie.identifier]
        picker.cameraCaptureMode = .video
        picker.videoMaximumDuration = options.videoMaxDuration > 0
          ? options.videoMaxDuration
          : TimeInterval.greatestFiniteMagnitude
      } else {
        picker.mediaTypes = [UTType.image.identifier]
        picker.cameraCaptureMode = .photo
      }
      presenter.present(picker, animated: true)
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    let continuation = libraryContinuation
    libraryContinuation = nil
    continuation?.resume(returning: results)
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true)
    let continuation = cameraContinuation
    cameraContinuation = nil
    continuation?.resume(returning: info)
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    let continuation = cameraContinuation
    cameraContinuation = nil
    continuation?.resume(returning: nil)
  }
}

final class HybridImagePicker: HybridImagePickerSpec {
  private let coordinator = PickerCoordinator()
  private let changeObserver = PhotoChangeObserver()
  private let fileManager = FileManager.default
  private let cursorSession = UUID().uuidString
  private let cursorLock = NSLock()
  private var cursorGeneration = 0

  override init() {
    super.init()
    changeObserver.onChange = { [weak self] in self?.advanceCursorGeneration() }
    PHPhotoLibrary.shared().register(changeObserver)
  }

  deinit {
    PHPhotoLibrary.shared().unregisterChangeObserver(changeObserver)
  }

  func getMediaLibraryPermissionsAsync(options: MediaTypeOptions) throws -> Promise<MediaPermissionResponse> {
    Promise.resolved(withResult: permissionResponse(PHPhotoLibrary.authorizationStatus(for: .readWrite)))
  }

  func requestMediaLibraryPermissionsAsync(options: MediaTypeOptions) throws -> Promise<MediaPermissionResponse> {
    Promise.async {
      let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
      return permissionResponse(status)
    }
  }

  func getCameraPermissionsAsync() throws -> Promise<MediaPermissionResponse> {
    Promise.resolved(withResult: capturePermissionResponse(AVCaptureDevice.authorizationStatus(for: .video)))
  }

  func requestCameraPermissionsAsync() throws -> Promise<MediaPermissionResponse> {
    Promise.async {
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      return capturePermissionResponse(granted ? .authorized : .denied)
    }
  }

  func getMicrophonePermissionsAsync() throws -> Promise<MediaPermissionResponse> {
    Promise.resolved(withResult: capturePermissionResponse(AVCaptureDevice.authorizationStatus(for: .audio)))
  }

  func requestMicrophonePermissionsAsync() throws -> Promise<MediaPermissionResponse> {
    Promise.async {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      return capturePermissionResponse(granted ? .authorized : .denied)
    }
  }

  func presentLimitedLibraryPickerAsync(options: MediaTypeOptions) throws -> Promise<Void> {
    Promise.async {
      guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .limited else { return }
      try await MainActor.run {
        guard let presenter = topViewController() else {
          throw pickerError("E_UNAVAILABLE", "找不到可用于显示权限管理器的界面")
        }
        PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: presenter)
      }
    }
  }

  func getAlbumsAsync(options: AlbumQueryOptions) throws -> Promise<[MediaAlbum]> {
    Promise.async {
      guard permissionResponse(PHPhotoLibrary.authorizationStatus(for: .readWrite)).granted else {
        throw pickerError("E_PERMISSION_DENIED", "没有媒体库读取权限")
      }
      let assetOptions = fetchOptions(options.mediaTypes)
      var albums: [MediaAlbum] = []
      func appendCollections(_ collections: PHFetchResult<PHAssetCollection>, smart: Bool) {
        collections.enumerateObjects { collection, _, _ in
          let assets = PHAsset.fetchAssets(in: collection, options: assetOptions)
          guard assets.count > 0 else { return }
          albums.append(MediaAlbum(
            id: collection.localIdentifier,
            title: collection.localizedTitle ?? "",
            assetCount: Double(assets.count),
            coverAssetId: assets.firstObject?.localIdentifier,
            isSmartAlbum: smart
          ))
        }
      }
      appendCollections(PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil), smart: false)
      if options.includeSmartAlbums {
        appendCollections(PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil), smart: true)
      }
      return albums
    }
  }

  func getAssetsAsync(options: AssetQueryOptions) throws -> Promise<MediaAssetPage> {
    Promise.async {
      guard permissionResponse(PHPhotoLibrary.authorizationStatus(for: .readWrite)).granted else {
        throw pickerError("E_PERMISSION_DENIED", "没有媒体库读取权限")
      }
      let query = self.cursorQuery(albumId: options.albumId, mediaTypes: options.mediaTypes)
      let generation = self.currentCursorGeneration()
      let offset = try decodedCursor(options.after, query: query, generation: generation)
      let fetch: PHFetchResult<PHAsset>
      if let albumId = options.albumId {
        let collections = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [albumId], options: nil)
        guard let collection = collections.firstObject else {
          throw pickerError("E_ASSET_NOT_FOUND", "指定相册不存在或当前权限不可访问")
        }
        fetch = PHAsset.fetchAssets(in: collection, options: fetchOptions(options.mediaTypes))
      } else {
        fetch = PHAsset.fetchAssets(with: fetchOptions(options.mediaTypes))
      }
      guard offset <= fetch.count else { throw pickerError("E_INVALID_CURSOR", "分页游标已失效") }
      let end = min(fetch.count, offset + Int(options.first))
      var assets: [MediaAsset] = []
      if offset < end {
        for index in offset..<end {
          let asset = fetch.object(at: index)
          let resource = PHAssetResource.assetResources(for: asset).first
          assets.append(MediaAsset(
            assetId: asset.localIdentifier,
            type: asset.mediaType == .video ? .video : .image,
            fileName: resource?.originalFilename,
            mimeType: resource.flatMap { mimeType(for: $0) },
            fileSize: nil,
            width: Double(asset.pixelWidth),
            height: Double(asset.pixelHeight),
            duration: asset.mediaType == .video ? asset.duration * 1000 : nil,
            creationTime: (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000,
            modificationTime: (asset.modificationDate?.timeIntervalSince1970 ?? 0) * 1000
          ))
        }
      }
      return MediaAssetPage(
        assets: assets,
        endCursor: end < fetch.count
          ? try encodedCursor(end, query: query, generation: generation)
          : nil,
        hasNextPage: end < fetch.count,
        totalCount: Double(fetch.count)
      )
    }
  }

  func resolveAssetsAsync(assetIds: [String], options: ResolveAssetsOptions) throws -> Promise<[ImagePickerAsset]> {
    Promise.async { [weak self] in
      guard let self else { throw pickerError("E_UNAVAILABLE", "相册模块已释放") }
      return try await self.resolveAssets(assetIds, allowNetwork: options.shouldDownloadFromNetwork)
    }
  }

  func launchImageLibraryAsync(options: ImageLibraryOptions) throws -> Promise<ImagePickerResult> {
    Promise.async { [weak self] in
      guard let self else { throw pickerError("E_UNAVAILABLE", "相册模块已释放") }
      var configuration = PHPickerConfiguration(photoLibrary: .shared())
      let filters = options.mediaTypes.map { $0 == .videos ? PHPickerFilter.videos : PHPickerFilter.images }
      configuration.filter = filters.count == 1 ? filters[0] : .any(of: filters)
      configuration.selectionLimit = options.allowsMultipleSelection ? Int(options.selectionLimit) : 1
      if #available(iOS 15, *), options.orderedSelection {
        configuration.selection = .ordered
      }
      let results = try await self.coordinator.presentLibrary(configuration: configuration)
      if results.isEmpty { return ImagePickerResult(canceled: true, assets: nil) }
      let identifiers = results.compactMap(\.assetIdentifier)
      guard identifiers.count == results.count else {
        throw pickerError("E_EXPORT_FAILED", "系统选择器未返回可解析的媒体标识")
      }
      let assets = try await self.resolveAssets(
        identifiers,
        allowNetwork: options.shouldDownloadFromNetwork
      )
      return ImagePickerResult(canceled: false, assets: assets)
    }
  }

  func launchCameraAsync(options: CameraOptions) throws -> Promise<ImagePickerResult> {
    Promise.async { [weak self] in
      guard let self else { throw pickerError("E_UNAVAILABLE", "相册模块已释放") }
      guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
        throw pickerError("E_PERMISSION_DENIED", "没有相机权限")
      }
      if options.mediaType == .video,
         AVCaptureDevice.authorizationStatus(for: .audio) != .authorized
      {
        throw pickerError("E_PERMISSION_DENIED", "录像需要麦克风权限")
      }
      let info = try await self.coordinator.presentCamera(options: options)
      guard let info else { return ImagePickerResult(canceled: true, assets: nil) }
      do {
        let asset = try self.persistCapture(info: info, mediaType: options.mediaType)
        return ImagePickerResult(canceled: false, assets: [asset])
      } catch {
        throw pickerError("E_EXPORT_FAILED", error.localizedDescription)
      }
    }
  }

  func getPendingResultAsync() throws -> Promise<Variant_ImagePickerResult_ImagePickerErrorResult?> {
    Promise<Variant_ImagePickerResult_ImagePickerErrorResult?>.resolved(withResult: nil)
  }

  func clearCacheAsync() throws -> Promise<Void> {
    Promise.async { [weak self] in
      guard let self else { return }
      try self.clearCache()
    }
  }

  func setOnLibraryChange(callback: @escaping (MediaLibraryChangeEvent) -> Void) throws {
    changeObserver.listener = callback
  }

  func clearOnLibraryChange() throws {
    changeObserver.listener = nil
  }

  private func cacheDirectory() throws -> URL {
    let root = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("nitro-image-picker", isDirectory: true)
    try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  private func cursorQuery(albumId: String?, mediaTypes: [MediaTypeOption]) -> String {
    let types = mediaTypes.map(\.stringValue).sorted().joined(separator: ",")
    return "\(cursorSession)|\(albumId ?? "all")|\(types)"
  }

  private func currentCursorGeneration() -> Int {
    cursorLock.lock()
    defer { cursorLock.unlock() }
    return cursorGeneration
  }

  private func advanceCursorGeneration() {
    cursorLock.lock()
    cursorGeneration += 1
    cursorLock.unlock()
  }

  private func sanitizedFileName(_ name: String) -> String {
    let safe = name.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
    return safe.isEmpty ? "asset" : safe
  }

  private func resolveAssets(_ assetIds: [String], allowNetwork: Bool) async throws -> [ImagePickerAsset] {
    let fetch = PHAsset.fetchAssets(withLocalIdentifiers: assetIds, options: nil)
    var byId: [String: PHAsset] = [:]
    fetch.enumerateObjects { asset, _, _ in byId[asset.localIdentifier] = asset }
    var created: [URL] = []
    do {
      var output: [ImagePickerAsset] = []
      for assetId in assetIds {
        guard let asset = byId[assetId] else {
          throw pickerError("E_ASSET_NOT_FOUND", "资源不存在或当前权限不可访问")
        }
        let resources = PHAssetResource.assetResources(for: asset)
        let resource = resources.first(where: {
          asset.mediaType == .video
            ? $0.type == .video || $0.type == .fullSizeVideo
            : $0.type == .photo || $0.type == .fullSizePhoto
        }) ?? resources.first
        guard let resource else { throw pickerError("E_EXPORT_FAILED", "资源没有可导出的原始数据") }
        let destination = try cacheDirectory().appendingPathComponent(
          "\(UUID().uuidString)-\(sanitizedFileName(resource.originalFilename))"
        )
        do {
          try await write(resource: resource, to: destination, allowNetwork: allowNetwork)
        } catch {
          throw pickerError("E_EXPORT_FAILED", error.localizedDescription)
        }
        created.append(destination)
        let values: URLResourceValues
        do {
          values = try destination.resourceValues(forKeys: [.fileSizeKey])
        } catch {
          throw pickerError("E_EXPORT_FAILED", error.localizedDescription)
        }
        output.append(ImagePickerAsset(
          assetId: asset.localIdentifier,
          uri: destination.absoluteString,
          type: asset.mediaType == .video ? .video : .image,
          fileName: resource.originalFilename,
          fileSize: values.fileSize.map(Double.init),
          mimeType: mimeType(for: resource),
          width: Double(asset.pixelWidth),
          height: Double(asset.pixelHeight),
          duration: asset.mediaType == .video ? asset.duration * 1000 : nil
        ))
      }
      return output
    } catch {
      created.forEach { try? fileManager.removeItem(at: $0) }
      throw error
    }
  }

  private func write(resource: PHAssetResource, to destination: URL, allowNetwork: Bool) async throws {
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = allowNetwork
    try await withCheckedThrowingContinuation { continuation in
      PHAssetResourceManager.default().writeData(for: resource, toFile: destination, options: options) {
        if let error = $0 { continuation.resume(throwing: error) }
        else { continuation.resume() }
      }
    }
  }

  private func persistCapture(
    info: [UIImagePickerController.InfoKey: Any],
    mediaType: MediaType
  ) throws -> ImagePickerAsset {
    let directory = try cacheDirectory()
    if mediaType == .video, let source = info[.mediaURL] as? URL {
      let destination = directory.appendingPathComponent("\(UUID().uuidString)-capture.mov")
      try fileManager.copyItem(at: source, to: destination)
      let asset = AVURLAsset(url: destination)
      let size = asset.tracks(withMediaType: .video).first?.naturalSize ?? .zero
      let values = try destination.resourceValues(forKeys: [.fileSizeKey])
      return ImagePickerAsset(
        assetId: nil,
        uri: destination.absoluteString,
        type: .video,
        fileName: destination.lastPathComponent,
        fileSize: values.fileSize.map(Double.init),
        mimeType: "video/quicktime",
        width: Double(abs(size.width)),
        height: Double(abs(size.height)),
        duration: CMTimeGetSeconds(asset.duration) * 1000
      )
    }
    guard let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 1) else {
      throw pickerError("E_EXPORT_FAILED", "无法读取相机结果")
    }
    let destination = directory.appendingPathComponent("\(UUID().uuidString)-capture.jpg")
    try data.write(to: destination, options: .atomic)
    return ImagePickerAsset(
      assetId: nil,
      uri: destination.absoluteString,
      type: .image,
      fileName: destination.lastPathComponent,
      fileSize: Double(data.count),
      mimeType: "image/jpeg",
      width: Double(image.size.width * image.scale),
      height: Double(image.size.height * image.scale),
      duration: nil
    )
  }

  private func clearCache() throws {
    do {
      let directory = try cacheDirectory()
      for url in try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
        try fileManager.removeItem(at: url)
      }
    } catch {
      throw pickerError("E_EXPORT_FAILED", "无法清理模块缓存：\(error.localizedDescription)")
    }
  }
}
