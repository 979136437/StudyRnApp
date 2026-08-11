package com.margelo.nitro.compressor

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

internal class MediaSourceAccess(private val context: Context, private val source: String) {
  private val uri = Uri.parse(source)

  fun openStream(): InputStream = when (uri.scheme?.lowercase()) {
    "content" -> context.contentResolver.openInputStream(uri)
      ?: error("Unable to open content URI")
    "file" -> FileInputStream(requireNotNull(uri.path))
    null, "" -> FileInputStream(source)
    else -> error("Unsupported media URI scheme")
  }

  fun configure(retriever: MediaMetadataRetriever) {
    when (uri.scheme?.lowercase()) {
      "content" -> retriever.setDataSource(context, uri)
      "file" -> retriever.setDataSource(requireNotNull(uri.path))
      null, "" -> retriever.setDataSource(source)
      else -> error("Unsupported media URI scheme")
    }
  }

  fun configure(extractor: MediaExtractor) {
    when (uri.scheme?.lowercase()) {
      "content" -> context.contentResolver.openAssetFileDescriptor(uri, "r")!!.use { descriptor ->
        if (descriptor.declaredLength >= 0) {
          extractor.setDataSource(
            descriptor.fileDescriptor,
            descriptor.startOffset,
            descriptor.declaredLength,
          )
        } else {
          extractor.setDataSource(descriptor.fileDescriptor)
        }
      }
      "file" -> extractor.setDataSource(requireNotNull(uri.path))
      null, "" -> extractor.setDataSource(source)
      else -> error("Unsupported media URI scheme")
    }
  }

  fun size(): Long {
    return when (uri.scheme?.lowercase()) {
      "content" -> context.contentResolver.openAssetFileDescriptor(uri, "r")?.use {
        if (it.length >= 0) it.length else 0L
      } ?: 0L
      "file" -> File(requireNotNull(uri.path)).length()
      null, "" -> File(source).length()
      else -> 0L
    }
  }
}
