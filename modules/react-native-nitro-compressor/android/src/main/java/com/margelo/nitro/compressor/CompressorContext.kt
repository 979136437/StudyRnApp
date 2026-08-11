package com.margelo.nitro.compressor

import android.content.Context

internal object CompressorContext {
  @Volatile private var applicationContext: Context? = null

  fun install(context: Context) {
    applicationContext = context.applicationContext
  }

  fun require(): Context = applicationContext
    ?: error("NitroCompressor has not received an Android application context")
}
