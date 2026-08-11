package com.margelo.nitro.compressor

import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

internal class CompressionCancelledException : RuntimeException("Compression cancelled")

internal object CompressionTasks {
  private val tasks = ConcurrentHashMap<String, AtomicBoolean>()

  fun register(id: String): AtomicBoolean {
    val state = AtomicBoolean(false)
    check(tasks.putIfAbsent(id, state) == null) { "Duplicate compression operation id" }
    return state
  }

  fun cancel(id: String): Boolean = tasks[id]?.let {
    it.set(true)
    true
  } ?: false

  fun check(state: AtomicBoolean) {
    if (state.get() || Thread.currentThread().isInterrupted) {
      throw CompressionCancelledException()
    }
  }

  fun finish(id: String) {
    tasks.remove(id)
  }

  fun deleteQuietly(file: File?) {
    if (file?.exists() == true) file.delete()
  }
}
