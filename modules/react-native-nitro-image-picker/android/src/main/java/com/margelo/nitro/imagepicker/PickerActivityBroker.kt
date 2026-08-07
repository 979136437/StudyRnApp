package com.margelo.nitro.imagepicker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.margelo.nitro.core.Promise
import org.json.JSONArray
import org.json.JSONObject

internal data class PickerActivityResult(
  val resultCode: Int,
  val source: String,
  val mediaType: String,
  val uris: List<Uri>,
)

/**
 * Activity 结果必须脱离 HybridObject 生命周期保存，否则 Android 重建 MainActivity 后
 * JavaScript Promise 会丢失。这里只持久化 URI 和请求元数据，不保存媒体内容。
 */
internal object PickerActivityBroker {
  private const val REQUEST_ACTIVITY = 58120
  private const val REQUEST_PERMISSION = 58121
  private const val PREFS = "nitro_image_picker_pending"
  private const val PAYLOAD = "payload"

  private val mainHandler = Handler(Looper.getMainLooper())
  private var context: ReactApplicationContext? = null
  private var activityPromise: Promise<PickerActivityResult>? = null
  private var permissionPromise: Promise<Boolean>? = null

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_ACTIVITY) return
      val request = readPayload() ?: JSONObject()
      val uris = mutableListOf<Uri>()
      data?.clipData?.let { clip ->
        for (index in 0 until clip.itemCount) uris += clip.getItemAt(index).uri
      }
      data?.data?.let(uris::add)
      if (uris.isEmpty()) request.optString("fallbackUri").takeIf(String::isNotBlank)?.let {
        uris += Uri.parse(it)
      }
      val grantFlags = data?.flags?.and(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      ) ?: 0
      if (grantFlags != 0) {
        uris.forEach { uri ->
          runCatching {
            context?.contentResolver?.takePersistableUriPermission(uri, grantFlags)
          }
        }
      }
      val result = PickerActivityResult(
        resultCode = resultCode,
        source = request.optString("source", "library"),
        mediaType = request.optString("mediaType", "image"),
        uris = uris.distinct(),
      )
      persistCompleted(result)
      activityPromise?.resolve(result)
      activityPromise = null
    }
  }

  private val permissionListener = PermissionListener { requestCode, _, grantResults ->
    if (requestCode != REQUEST_PERMISSION) return@PermissionListener false
    val granted = grantResults.isNotEmpty() && grantResults.all { it == android.content.pm.PackageManager.PERMISSION_GRANTED }
    permissionPromise?.resolve(granted)
    permissionPromise = null
    true
  }

  @Synchronized
  fun attach(reactContext: ReactApplicationContext) {
    if (context === reactContext) return
    context?.removeActivityEventListener(activityListener)
    context = reactContext
    reactContext.addActivityEventListener(activityListener)
  }

  @Synchronized
  fun launch(intent: Intent, source: String, mediaType: String, fallbackUri: Uri? = null): Promise<PickerActivityResult> {
    if (activityPromise != null) return Promise.rejected(Error("[E_PICKER_BUSY] 已有选择器正在显示"))
    val reactContext = context ?: return Promise.rejected(Error("[E_UNAVAILABLE] React 上下文不可用"))
    val activity = reactContext.currentActivity
      ?: return Promise.rejected(Error("[E_UNAVAILABLE] 当前没有可用 Activity"))
    val promise = Promise<PickerActivityResult>()
    activityPromise = promise
    writePayload(JSONObject().apply {
      put("state", "pending")
      put("source", source)
      put("mediaType", mediaType)
      put("fallbackUri", fallbackUri?.toString() ?: "")
    })
    mainHandler.post {
      try {
        activity.startActivityForResult(intent, REQUEST_ACTIVITY)
      } catch (error: Throwable) {
        activityPromise = null
        clearPending()
        promise.reject(error)
      }
    }
    return promise
  }

  @Synchronized
  fun requestPermissions(permissions: Array<String>): Promise<Boolean> {
    if (permissions.isEmpty()) return Promise.resolved(true)
    if (permissionPromise != null) return Promise.rejected(Error("[E_PICKER_BUSY] 已有权限请求正在显示"))
    val activity = context?.currentActivity as? PermissionAwareActivity
      ?: return Promise.rejected(Error("[E_UNAVAILABLE] 当前 Activity 不支持权限请求"))
    val promise = Promise<Boolean>()
    permissionPromise = promise
    markPermissionsRequested(permissions)
    mainHandler.post {
      try {
        activity.requestPermissions(permissions, REQUEST_PERMISSION, permissionListener)
      } catch (error: Throwable) {
        permissionPromise = null
        promise.reject(error)
      }
    }
    return promise
  }

  fun wasPermissionRequested(permission: String): Boolean =
    context?.getSharedPreferences(PREFS, 0)?.getBoolean("permission:$permission", false) == true

  fun consumeCompleted(): PickerActivityResult? {
    val payload = readPayload() ?: return null
    if (payload.optString("state") != "completed") return null
    val uriArray = payload.optJSONArray("uris") ?: JSONArray()
    val uris = buildList {
      for (index in 0 until uriArray.length()) add(Uri.parse(uriArray.getString(index)))
    }
    val result = PickerActivityResult(
      resultCode = payload.optInt("resultCode", Activity.RESULT_CANCELED),
      source = payload.optString("source", "library"),
      mediaType = payload.optString("mediaType", "image"),
      uris = uris,
    )
    clearPending()
    return result
  }

  fun clearPending() {
    context?.getSharedPreferences(PREFS, 0)?.edit()?.remove(PAYLOAD)?.apply()
  }

  fun clearCompleted() {
    if (readPayload()?.optString("state") == "completed") clearPending()
  }

  private fun persistCompleted(result: PickerActivityResult) {
    writePayload(JSONObject().apply {
      put("state", "completed")
      put("source", result.source)
      put("mediaType", result.mediaType)
      put("resultCode", result.resultCode)
      put("uris", JSONArray(result.uris.map(Uri::toString)))
    })
  }

  private fun readPayload(): JSONObject? {
    val raw = context?.getSharedPreferences(PREFS, 0)?.getString(PAYLOAD, null) ?: return null
    return runCatching { JSONObject(raw) }.getOrNull()
  }

  private fun writePayload(payload: JSONObject) {
    context?.getSharedPreferences(PREFS, 0)?.edit()?.putString(PAYLOAD, payload.toString())?.apply()
  }

  private fun markPermissionsRequested(permissions: Array<String>) {
    val editor = context?.getSharedPreferences(PREFS, 0)?.edit() ?: return
    permissions.forEach { editor.putBoolean("permission:$it", true) }
    editor.apply()
  }
}
