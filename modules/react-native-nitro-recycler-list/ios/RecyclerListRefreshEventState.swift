import Foundation

struct RecyclerListRefreshSnapshot {
  let phase: NativeRefreshPhase
  let offset: Double
  let progress: Double
}

/// 统一规范化刷新事件，并将高频位移与低频阶段通知分流。
final class RecyclerListRefreshEventState {
  private(set) var phase: NativeRefreshPhase = .idle
  private(set) var offset: Double = 0

  func publish(
    phase nextPhase: NativeRefreshPhase,
    offset nextOffset: Double,
    progress nextProgress: Double,
    onPull: (RecyclerListRefreshSnapshot) -> Void,
    onPhaseChanged: (NativeRefreshPhase) -> Void
  ) {
    offset = max(0, nextOffset)
    onPull(
      RecyclerListRefreshSnapshot(
        phase: nextPhase,
        offset: offset,
        progress: min(1, max(0, nextProgress))
      )
    )
    if phase != nextPhase {
      phase = nextPhase
      onPhaseChanged(nextPhase)
    }
  }
}
