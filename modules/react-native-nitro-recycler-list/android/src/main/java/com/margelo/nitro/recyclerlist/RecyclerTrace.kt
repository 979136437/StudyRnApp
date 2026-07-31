package com.margelo.nitro.recyclerlist

import android.util.Log

internal object RecyclerTrace {
  const val TAG = "NitroRecyclerTrace"

  fun objectId(value: Any): String = Integer.toHexString(System.identityHashCode(value))

  fun log(source: Any, event: String, details: String = "") {
    val suffix = if (details.isEmpty()) "" else " $details"
    Log.d(TAG, "${source.javaClass.simpleName}@${objectId(source)} event=$event$suffix")
  }
}
