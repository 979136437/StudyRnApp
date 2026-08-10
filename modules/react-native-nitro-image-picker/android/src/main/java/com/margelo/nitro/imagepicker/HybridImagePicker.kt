package com.margelo.nitro.imagepicker

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

private fun pickerError(code: String, message: String): Error = Error("[$code] $message")

private fun encodeCursor(
  dateAdded: Long,
  id: Long,
  query: String,
  generation: Long,
): String = Base64.encodeToString(
  JSONObject()
    .put("version", 1)
    .put("dateAdded", dateAdded)
    .put("id", id)
    .put("query", query)
    .put("generation", generation)
    .toString()
    .toByteArray(),
  Base64.NO_WRAP,
)

private fun decodeCursor(cursor: String?, query: String, generation: Long): Pair<Long, Long>? {
  if (cursor == null) return null
  val payload = runCatching {
    JSONObject(String(Base64.decode(cursor, Base64.NO_WRAP)))
  }.getOrNull()
    ?: throw pickerError("E_INVALID_CURSOR", "分页游标无效")
  if (payload.optInt("version") != 1 ||
    payload.optString("query") != query ||
    payload.optLong("generation", -1) != generation
  ) {
    throw pickerError("E_INVALID_CURSOR", "分页游标无效或媒体库已变化")
  }
  return Pair(
    payload.optLong("dateAdded", -1).takeIf { it >= 0 }
      ?: throw pickerError("E_INVALID_CURSOR", "分页游标无效"),
    payload.optLong("id", -1).takeIf { it >= 0 }
      ?: throw pickerError("E_INVALID_CURSOR", "分页游标无效"),
  )
}

class HybridImagePicker : HybridImagePickerSpec() {
  private val context = NitroModules.applicationContext
    ?: throw pickerError("E_UNAVAILABLE", "React 上下文不可用")
  private val resolver = context.contentResolver
  @Volatile private var libraryChangeCallback: ((MediaLibraryChangeEvent) -> Unit)? = null
  @Volatile private var isObservingMediaLibrary = false
  private val cursorSession = UUID.randomUUID().toString()
  private val cursorGeneration = AtomicLong(0)
  private val mediaObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
    override fun onChange(selfChange: Boolean) {
      cursorGeneration.incrementAndGet()
      libraryChangeCallback?.invoke(
        MediaLibraryChangeEvent(false, emptyArray(), emptyArray(), emptyArray()),
      )
    }
  }

  init {
    PickerActivityBroker.attach(context)
  }

  override fun getMediaLibraryPermissionsAsync(options: MediaTypeOptions): Promise<MediaPermissionResponse> =
    Promise.resolved(mediaPermission(options.mediaTypes))

  override fun requestMediaLibraryPermissionsAsync(options: MediaTypeOptions): Promise<MediaPermissionResponse> =
    Promise.async {
      PickerActivityBroker.requestPermissions(mediaPermissions(options.mediaTypes)).await()
      mediaPermission(options.mediaTypes)
    }

  override fun getCameraPermissionsAsync(): Promise<MediaPermissionResponse> =
    Promise.resolved(permission(Manifest.permission.CAMERA))

  override fun requestCameraPermissionsAsync(): Promise<MediaPermissionResponse> = Promise.async {
    PickerActivityBroker.requestPermissions(arrayOf(Manifest.permission.CAMERA)).await()
    permission(Manifest.permission.CAMERA)
  }

  override fun getMicrophonePermissionsAsync(): Promise<MediaPermissionResponse> =
    Promise.resolved(permission(Manifest.permission.RECORD_AUDIO))

  override fun requestMicrophonePermissionsAsync(): Promise<MediaPermissionResponse> = Promise.async {
    PickerActivityBroker.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)).await()
    permission(Manifest.permission.RECORD_AUDIO)
  }

  override fun presentLimitedLibraryPickerAsync(options: MediaTypeOptions): Promise<Unit> = Promise.async {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
      mediaPermission(options.mediaTypes).accessPrivileges == AccessPrivileges.LIMITED
    ) {
      PickerActivityBroker.requestPermissions(mediaPermissions(options.mediaTypes)).await()
    }
  }

  override fun getAlbumsAsync(options: AlbumQueryOptions): Promise<Array<MediaAlbum>> = Promise.parallel {
    ensureMediaPermission(options.mediaTypes)
    val projection = arrayOf(
      MediaStore.MediaColumns.BUCKET_ID,
      MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
    )
    val (selection, args) = mediaSelection(options.mediaTypes)
    val albums = linkedMapOf<String, Triple<String, Int, String>>()
    resolver.query(
      mediaCollection(),
      projection,
      selection,
      args,
      "${MediaStore.Files.FileColumns.DATE_ADDED} DESC, ${MediaStore.Files.FileColumns._ID} DESC",
    )?.use { cursor ->
      val bucketIdColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.BUCKET_ID)
      val titleColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.BUCKET_DISPLAY_NAME)
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
      val typeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
      while (cursor.moveToNext()) {
        val bucketId = cursor.getLong(bucketIdColumn).toString()
        val title = cursor.getString(titleColumn).orEmpty()
        val assetUri = assetUri(cursor.getInt(typeColumn), cursor.getLong(idColumn)).toString()
        val current = albums[bucketId]
        albums[bucketId] = Triple(title, (current?.second ?: 0) + 1, current?.third ?: assetUri)
      }
    }
    albums.map { (id, value) ->
      MediaAlbum(id, value.first, value.second.toDouble(), value.third, false)
    }.toTypedArray()
  }

  override fun getAssetsAsync(options: AssetQueryOptions): Promise<MediaAssetPage> = Promise.parallel {
    ensureMediaPermission(options.mediaTypes)
    val query = cursorQuery(options.albumId, options.mediaTypes)
    val generation = cursorGeneration.get()
    val cursorValue = decodeCursor(options.after, query, generation)
    val filters = mutableListOf<String>()
    val args = mutableListOf<String>()
    val (mediaClause, mediaArgs) = mediaSelection(options.mediaTypes)
    filters += mediaClause
    args += mediaArgs
    options.albumId?.let {
      filters += "${MediaStore.MediaColumns.BUCKET_ID} = ?"
      args += it
    }
    cursorValue?.let { (date, id) ->
      filters += "(${MediaStore.Files.FileColumns.DATE_ADDED} < ? OR (${MediaStore.Files.FileColumns.DATE_ADDED} = ? AND ${MediaStore.Files.FileColumns._ID} < ?))"
      args += listOf(date.toString(), date.toString(), id.toString())
    }
    val selection = filters.joinToString(" AND ")
    val projection = assetProjection()
    val loaded = mutableListOf<Pair<MediaAsset, Pair<Long, Long>>>()
    val pageSize = options.first.toInt() + 1
    val resultCursor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val queryArgs = Bundle().apply {
        putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
        putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args.toTypedArray())
        putStringArray(
          ContentResolver.QUERY_ARG_SORT_COLUMNS,
          arrayOf(MediaStore.Files.FileColumns.DATE_ADDED, MediaStore.Files.FileColumns._ID),
        )
        putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
        putInt(ContentResolver.QUERY_ARG_LIMIT, pageSize)
      }
      resolver.query(mediaCollection(), projection, queryArgs, null)
    } else {
      // Android 7.x 没有 Bundle 查询重载，只在受控数字参数上拼接 LIMIT。
      resolver.query(
        mediaCollection(),
        projection,
        selection,
        args.toTypedArray(),
        "${MediaStore.Files.FileColumns.DATE_ADDED} DESC, ${MediaStore.Files.FileColumns._ID} DESC LIMIT $pageSize",
      )
    }
    resultCursor?.use { cursor ->
      while (cursor.moveToNext()) loaded += readAsset(cursor)
    }
    val hasNext = loaded.size > options.first.toInt()
    val pageItems = loaded.take(options.first.toInt())
    val totalCount = countAssets(options.mediaTypes, options.albumId)
    val endCursor = if (hasNext && pageItems.isNotEmpty()) {
      pageItems.last().second.let { encodeCursor(it.first, it.second, query, generation) }
    } else null
    MediaAssetPage(pageItems.map { it.first }.toTypedArray(), endCursor, hasNext, totalCount.toDouble())
  }

  override fun resolveAssetsAsync(
    assetIds: Array<String>,
    options: ResolveAssetsOptions,
  ): Promise<Array<ImagePickerAsset>> = Promise.parallel {
    val created = mutableListOf<File>()
    try {
      assetIds.map { id -> copyToCache(Uri.parse(id)).also { created += File(Uri.parse(it.uri).path!!) } }
        .toTypedArray()
    } catch (error: FileNotFoundException) {
      created.forEach(File::delete)
      throw pickerError("E_ASSET_NOT_FOUND", "资源不存在或当前权限不可访问")
    } catch (error: SecurityException) {
      created.forEach(File::delete)
      throw pickerError("E_PERMISSION_DENIED", "没有读取该媒体资源的权限")
    } catch (error: Throwable) {
      created.forEach(File::delete)
      throw error
    }
  }

  override fun launchImageLibraryAsync(options: ImageLibraryOptions): Promise<ImagePickerResult> {
    val intent = createLibraryIntent(options)
    return Promise.async {
      val result = PickerActivityBroker.launch(intent, "library", "mixed").await()
      try {
        parseActivityResult(result)
      } finally {
        PickerActivityBroker.clearCompleted()
      }
    }
  }

  override fun launchCameraAsync(options: CameraOptions): Promise<ImagePickerResult> {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      return Promise.rejected(pickerError("E_PERMISSION_DENIED", "没有相机权限"))
    }
    if (options.mediaType == MediaType.VIDEO &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
    ) {
      return Promise.rejected(pickerError("E_PERMISSION_DENIED", "录像需要麦克风权限"))
    }
    val extension = if (options.mediaType == MediaType.VIDEO) ".mp4" else ".jpg"
    val output = File(cacheDirectory(), "${UUID.randomUUID()}-capture$extension")
    val outputUri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.nitroimagepicker.fileprovider",
      output,
    )
    val intent = Intent(
      if (options.mediaType == MediaType.VIDEO) MediaStore.ACTION_VIDEO_CAPTURE
      else MediaStore.ACTION_IMAGE_CAPTURE,
    ).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      putExtra("android.intent.extras.CAMERA_FACING", if (options.cameraType == CameraType.FRONT) 1 else 0)
      if (options.mediaType == MediaType.VIDEO && options.videoMaxDuration > 0) {
        putExtra(MediaStore.EXTRA_DURATION_LIMIT, options.videoMaxDuration.toInt())
      }
    }
    if (intent.resolveActivity(context.packageManager) == null) {
      output.delete()
      return Promise.rejected(pickerError("E_CAMERA_UNAVAILABLE", "当前设备没有可用相机"))
    }
    return Promise.async {
      try {
        val result = PickerActivityBroker.launch(
          intent,
          "camera",
          if (options.mediaType == MediaType.VIDEO) "video" else "image",
          outputUri,
        ).await()
        parseActivityResult(result)
      } catch (error: Throwable) {
        output.delete()
        throw error
      } finally {
        PickerActivityBroker.clearCompleted()
      }
    }
  }

  override fun getPendingResultAsync(): Promise<Variant_ImagePickerResult_ImagePickerErrorResult?> = Promise.parallel {
    val pending = PickerActivityBroker.consumeCompleted() ?: return@parallel null
    try {
      Variant_ImagePickerResult_ImagePickerErrorResult.create(parseActivityResult(pending))
    } catch (error: Throwable) {
      Variant_ImagePickerResult_ImagePickerErrorResult.create(
        ImagePickerErrorResult("E_EXPORT_FAILED", error.message ?: "无法恢复选择结果"),
      )
    }
  }

  override fun clearCacheAsync(): Promise<Unit> = Promise.parallel {
    cacheDirectory().listFiles()?.forEach { file ->
      if (!file.delete()) throw pickerError("E_EXPORT_FAILED", "无法清理缓存文件")
    }
  }

  override fun setOnLibraryChange(callback: (event: MediaLibraryChangeEvent) -> Unit) {
    libraryChangeCallback = callback
    if (!isObservingMediaLibrary) {
      resolver.registerContentObserver(mediaCollection(), true, mediaObserver)
      isObservingMediaLibrary = true
    }
  }

  override fun clearOnLibraryChange() {
    libraryChangeCallback = null
    if (isObservingMediaLibrary) {
      resolver.unregisterContentObserver(mediaObserver)
      isObservingMediaLibrary = false
    }
  }

  private fun permission(permission: String): MediaPermissionResponse {
    val granted = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    if (granted) return MediaPermissionResponse(PermissionStatus.GRANTED, true, true, AccessPrivileges.ALL)
    val requested = PickerActivityBroker.wasPermissionRequested(permission)
    val canAskAgain = !requested || context.currentActivity?.let {
      ActivityCompat.shouldShowRequestPermissionRationale(it, permission)
    } == true
    return MediaPermissionResponse(
      if (requested) PermissionStatus.DENIED else PermissionStatus.UNDETERMINED,
      false,
      canAskAgain,
      AccessPrivileges.NONE,
    )
  }

  private fun mediaPermission(mediaTypes: Array<MediaTypeOption>): MediaPermissionResponse {
    val permissions = mediaPermissions(mediaTypes).filter {
      it != Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
    }
    if (permissions.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }) {
      return MediaPermissionResponse(PermissionStatus.GRANTED, true, true, AccessPrivileges.ALL)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
      ) == PackageManager.PERMISSION_GRANTED
    ) {
      return MediaPermissionResponse(PermissionStatus.GRANTED, true, true, AccessPrivileges.LIMITED)
    }
    val requested = permissions.any(PickerActivityBroker::wasPermissionRequested)
    val canAskAgain = permissions.any { permission ->
      !PickerActivityBroker.wasPermissionRequested(permission) || context.currentActivity?.let {
        ActivityCompat.shouldShowRequestPermissionRationale(it, permission)
      } == true
    }
    return MediaPermissionResponse(
      if (requested) PermissionStatus.DENIED else PermissionStatus.UNDETERMINED,
      false,
      canAskAgain,
      AccessPrivileges.NONE,
    )
  }

  private fun mediaPermissions(mediaTypes: Array<MediaTypeOption>): Array<String> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    return buildList {
      if (mediaTypes.contains(MediaTypeOption.IMAGES)) add(Manifest.permission.READ_MEDIA_IMAGES)
      if (mediaTypes.contains(MediaTypeOption.VIDEOS)) add(Manifest.permission.READ_MEDIA_VIDEO)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
      }
    }.toTypedArray()
  }

  private fun ensureMediaPermission(mediaTypes: Array<MediaTypeOption>) {
    if (!mediaPermission(mediaTypes).granted) throw pickerError("E_PERMISSION_DENIED", "没有媒体库读取权限")
  }

  private fun mediaCollection(): Uri = MediaStore.Files.getContentUri("external")

  private fun cursorQuery(albumId: String?, mediaTypes: Array<MediaTypeOption>): String =
    "$cursorSession|${albumId ?: "all"}|${mediaTypes.map { it.name }.sorted().joinToString(",")}" 

  private fun mediaSelection(mediaTypes: Array<MediaTypeOption>): Pair<String, Array<String>> {
    val values = buildList {
      if (mediaTypes.contains(MediaTypeOption.IMAGES)) add(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString())
      if (mediaTypes.contains(MediaTypeOption.VIDEOS)) add(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString())
    }
    val placeholders = values.joinToString(",") { "?" }
    return "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN ($placeholders)" to values.toTypedArray()
  }

  private fun assetProjection(): Array<String> = arrayOf(
    MediaStore.Files.FileColumns._ID,
    MediaStore.Files.FileColumns.MEDIA_TYPE,
    MediaStore.Files.FileColumns.DISPLAY_NAME,
    MediaStore.Files.FileColumns.MIME_TYPE,
    MediaStore.Files.FileColumns.SIZE,
    MediaStore.Files.FileColumns.WIDTH,
    MediaStore.Files.FileColumns.HEIGHT,
    MediaStore.Video.VideoColumns.DURATION,
    MediaStore.Files.FileColumns.DATE_ADDED,
    MediaStore.Files.FileColumns.DATE_MODIFIED,
  )

  private fun readAsset(cursor: android.database.Cursor): Pair<MediaAsset, Pair<Long, Long>> {
    fun index(name: String) = cursor.getColumnIndexOrThrow(name)
    val id = cursor.getLong(index(MediaStore.Files.FileColumns._ID))
    val nativeType = cursor.getInt(index(MediaStore.Files.FileColumns.MEDIA_TYPE))
    val type = if (nativeType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) MediaType.VIDEO else MediaType.IMAGE
    val dateAdded = cursor.getLong(index(MediaStore.Files.FileColumns.DATE_ADDED))
    val durationIndex = cursor.getColumnIndex(MediaStore.Video.VideoColumns.DURATION)
    val asset = MediaAsset(
      assetUri(nativeType, id).toString(),
      type,
      cursor.getString(index(MediaStore.Files.FileColumns.DISPLAY_NAME)),
      cursor.getString(index(MediaStore.Files.FileColumns.MIME_TYPE)),
      cursor.getLong(index(MediaStore.Files.FileColumns.SIZE)).takeIf { it >= 0 }?.toDouble(),
      cursor.getInt(index(MediaStore.Files.FileColumns.WIDTH)).toDouble(),
      cursor.getInt(index(MediaStore.Files.FileColumns.HEIGHT)).toDouble(),
      if (type == MediaType.VIDEO && durationIndex >= 0 && !cursor.isNull(durationIndex)) cursor.getLong(durationIndex).toDouble() else null,
      dateAdded * 1000.0,
      cursor.getLong(index(MediaStore.Files.FileColumns.DATE_MODIFIED)) * 1000.0,
    )
    return asset to (dateAdded to id)
  }

  private fun assetUri(nativeType: Int, id: Long): Uri = ContentUris.withAppendedId(
    if (nativeType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    },
    id,
  )

  private fun countAssets(mediaTypes: Array<MediaTypeOption>, albumId: String?): Int {
    val (mediaClause, mediaArgs) = mediaSelection(mediaTypes)
    val selection = if (albumId == null) mediaClause else "$mediaClause AND ${MediaStore.MediaColumns.BUCKET_ID} = ?"
    val args = if (albumId == null) mediaArgs else mediaArgs + albumId
    return resolver.query(mediaCollection(), arrayOf(MediaStore.Files.FileColumns._ID), selection, args, null)
      ?.use { it.count } ?: 0
  }

  private fun createLibraryIntent(options: ImageLibraryOptions): Intent {
    val both = options.mediaTypes.size > 1
    val mimeType = when (options.mediaTypes.firstOrNull()) {
      MediaTypeOption.VIDEOS -> "video/*"
      else -> if (both) "*/*" else "image/*"
    }
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Intent(MediaStore.ACTION_PICK_IMAGES)
    } else {
      Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
    }
    intent.type = mimeType
    if (both) intent.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
    if (options.allowsMultipleSelection) {
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && options.selectionLimit > 0) {
        intent.putExtra(
          MediaStore.EXTRA_PICK_IMAGES_MAX,
          options.selectionLimit.toInt().coerceAtMost(MediaStore.getPickImagesMaxLimit()),
        )
      }
    }
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    return intent
  }

  private fun parseActivityResult(result: PickerActivityResult): ImagePickerResult {
    if (result.resultCode != Activity.RESULT_OK) {
      deleteCameraSource(result)
      return ImagePickerResult(true, null)
    }
    if (result.uris.isEmpty()) throw pickerError("E_EXPORT_FAILED", "系统选择器没有返回媒体资源")
    return try {
      ImagePickerResult(false, result.uris.map(::copyToCache).toTypedArray())
    } finally {
      deleteCameraSource(result)
    }
  }

  private fun deleteCameraSource(result: PickerActivityResult) {
    if (result.source != "camera") return
    result.uris.forEach { uri -> runCatching { resolver.delete(uri, null, null) } }
  }

  private fun copyToCache(source: Uri): ImagePickerAsset {
    val metadata = queryOpenableMetadata(source)
    val mimeType = resolver.getType(source)
    val extension = metadata.first.substringAfterLast('.', "").takeIf(String::isNotBlank)
      ?: android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
      ?: "bin"
    val baseName = metadata.first.substringBeforeLast('.', metadata.first)
    val destination = File(cacheDirectory(), "${UUID.randomUUID()}-${sanitize(baseName)}.$extension")
    try {
      resolver.openInputStream(source).use { input ->
        requireNotNull(input) { "无法打开媒体资源" }
        destination.outputStream().use(input::copyTo)
      }
      val type = if (mimeType?.startsWith("video/") == true) MediaType.VIDEO else MediaType.IMAGE
      val dimensions = readDimensions(destination, type)
      return ImagePickerAsset(
        source.toString(),
        Uri.fromFile(destination).toString(),
        type,
        metadata.first,
        destination.length().toDouble(),
        mimeType,
        dimensions.first.toDouble(),
        dimensions.second.toDouble(),
        if (type == MediaType.VIDEO) dimensions.third?.toDouble() else null,
      )
    } catch (error: FileNotFoundException) {
      destination.delete()
      throw error
    } catch (error: SecurityException) {
      destination.delete()
      throw error
    } catch (error: Throwable) {
      destination.delete()
      throw pickerError("E_EXPORT_FAILED", error.message ?: "媒体导出失败")
    }
  }

  private fun queryOpenableMetadata(uri: Uri): Pair<String, Long?> {
    var name = uri.lastPathSegment ?: "asset"
    var size: Long? = null
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 && !cursor.isNull(it) }?.let {
          name = cursor.getString(it)
        }
        cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !cursor.isNull(it) }?.let {
          size = cursor.getLong(it)
        }
      }
    }
    return name to size
  }

  private fun readDimensions(file: File, type: MediaType): Triple<Int, Int, Long?> {
    if (type == MediaType.IMAGE) {
      val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, options)
      return Triple(options.outWidth.coerceAtLeast(0), options.outHeight.coerceAtLeast(0), null)
    }
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.path)
      Triple(
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0,
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0,
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull(),
      )
    } finally {
      retriever.release()
    }
  }

  private fun cacheDirectory(): File = File(context.cacheDir, "nitro-image-picker").apply {
    if (!exists() && !mkdirs()) throw pickerError("E_EXPORT_FAILED", "无法创建媒体缓存目录")
  }

  private fun sanitize(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
    .trim('_')
    .ifBlank { "asset" }
}
