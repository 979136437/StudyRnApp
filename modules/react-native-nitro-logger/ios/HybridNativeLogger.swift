import Foundation
import NitroModules
import OSLog

private let fallbackTag = "App"
private let maxPendingBatches = 32

private enum PendingLogLevel: Sendable {
  case debug
  case info
  case warn
  case error
}

private struct PendingLogEntry: Sendable {
  let level: PendingLogLevel
  let message: String
  let tag: String
}

/// Nitro 调用只把值类型快照放入有界队列，Apple unified logging 始终在专用串行队列执行。
final class HybridNativeLogger: HybridNativeLoggerSpec, @unchecked Sendable {
  private let lock = NSLock()
  private let logQueue = DispatchQueue(
    label: "com.margelo.nitro.logger",
    qos: .utility
  )
  private let subsystem = Bundle.main.bundleIdentifier ?? "ReactNative"
  private var droppedBatches = 0
  private var pendingBatches: [[PendingLogEntry]] = []
  private var workerScheduled = false

  func enqueue(entries: [NativeLogEntry]) throws {
    guard !entries.isEmpty else { return }
    let batch = entries.map { entry in
      PendingLogEntry(
        level: pendingLevel(entry.level),
        message: entry.message,
        tag: entry.tag
      )
    }

    lock.lock()
    if pendingBatches.count >= maxPendingBatches {
      pendingBatches.removeFirst()
      droppedBatches += 1
    }
    pendingBatches.append(batch)
    let shouldSchedule = !workerScheduled
    workerScheduled = true
    lock.unlock()

    if shouldSchedule {
      logQueue.async { [weak self] in self?.drain() }
    }
  }

  private func drain() {
    while true {
      lock.lock()
      guard !pendingBatches.isEmpty else {
        workerScheduled = false
        lock.unlock()
        return
      }
      let batch = pendingBatches.removeFirst()
      let dropped = droppedBatches
      droppedBatches = 0
      lock.unlock()

      if dropped > 0 {
        let logger = OSLog.Logger(subsystem: subsystem, category: "NitroLogger")
        logger.warning("native.dropped batches=\(dropped, privacy: .public)")
      }
      batch.forEach(writeEntry)
    }
  }

  private func writeEntry(_ entry: PendingLogEntry) {
    let logger = OSLog.Logger(
      subsystem: subsystem,
      category: normalizedTag(entry.tag)
    )
    switch entry.level {
      case .debug:
        logger.debug("\(entry.message, privacy: .public)")
      case .info:
        logger.info("\(entry.message, privacy: .public)")
      case .warn:
        logger.warning("\(entry.message, privacy: .public)")
      case .error:
        logger.error("\(entry.message, privacy: .public)")
    }
  }

  private func pendingLevel(_ level: LogLevel) -> PendingLogLevel {
    switch level {
      case .debug: return .debug
      case .info: return .info
      case .warn: return .warn
      case .error: return .error
    }
  }

  private func normalizedTag(_ tag: String) -> String {
    let normalized = tag
      .replacingOccurrences(of: "[\\r\\n]+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized.isEmpty ? fallbackTag : normalized
  }
}
