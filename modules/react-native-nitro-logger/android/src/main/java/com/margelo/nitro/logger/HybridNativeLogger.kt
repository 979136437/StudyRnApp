package com.margelo.nitro.logger

import android.util.Log
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

private const val FALLBACK_TAG = "App"
private const val LOGGER_TAG = "NitroLogger"
private const val MAX_ANDROID_TAG_LENGTH = 23
private const val MAX_PENDING_BATCHES = 32

/**
 * Android 系统日志写入器。
 *
 * Nitro 调用线程只复制当前批次并投递任务，Logcat 写入始终发生在专用后台线程。
 */
class HybridNativeLogger : HybridNativeLoggerSpec() {
  private val droppedBatches = AtomicInteger(0)
  private val executor = ThreadPoolExecutor(
    1,
    1,
    0L,
    TimeUnit.MILLISECONDS,
    ArrayBlockingQueue(MAX_PENDING_BATCHES),
    ThreadFactory { runnable ->
      Thread(runnable, "NitroLogger").apply { isDaemon = true }
    },
  ) { task, pool ->
    pool.queue.poll()
    droppedBatches.incrementAndGet()
    pool.queue.offer(task)
  }

  override fun enqueue(entries: Array<NativeLogEntry>) {
    if (entries.isEmpty()) return
    val batch = entries.toList()
    executor.execute {
      val dropped = droppedBatches.getAndSet(0)
      if (dropped > 0) {
        Log.w(LOGGER_TAG, "native.dropped batches=$dropped")
      }
      batch.forEach(::writeEntry)
    }
  }

  private fun writeEntry(entry: NativeLogEntry) {
    val tag = entry.tag
      .replace(Regex("[\\r\\n]+"), " ")
      .trim()
      .ifEmpty { FALLBACK_TAG }
      .take(MAX_ANDROID_TAG_LENGTH)
    when (entry.level) {
      LogLevel.DEBUG -> Log.d(tag, entry.message)
      LogLevel.INFO -> Log.i(tag, entry.message)
      LogLevel.WARN -> Log.w(tag, entry.message)
      LogLevel.ERROR -> Log.e(tag, entry.message)
    }
  }
}
