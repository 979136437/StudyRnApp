import Foundation

struct RecyclerListRefreshSnapshot {
  let phase: NativeRefreshPhase
  let offset: Double
  let progress: Double
  let secondLevelPhase: NativeSecondLevelPhase
  let secondLevelProgress: Double
}

/// 统一规范化刷新事件，并将高频位移与低频阶段通知分流。
final class RecyclerListRefreshEventState {
  private(set) var phase: NativeRefreshPhase = .idle
  private(set) var offset: Double = 0
  private(set) var secondLevelPhase: NativeSecondLevelPhase = .idle

  func publish(
    phase nextPhase: NativeRefreshPhase,
    offset nextOffset: Double,
    progress nextProgress: Double,
    secondLevelPhase nextSecondLevelPhase: NativeSecondLevelPhase,
    secondLevelProgress nextSecondLevelProgress: Double,
    onPull: (RecyclerListRefreshSnapshot) -> Void,
    onPhaseChanged: (NativeRefreshPhase) -> Void,
    onSecondLevelPhaseChanged: (NativeSecondLevelPhase) -> Void
  ) {
    offset = max(0, nextOffset)
    onPull(
      RecyclerListRefreshSnapshot(
        phase: nextPhase,
        offset: offset,
        progress: min(1, max(0, nextProgress)),
        secondLevelPhase: nextSecondLevelPhase,
        secondLevelProgress: min(1, max(0, nextSecondLevelProgress))
      )
    )
    if phase != nextPhase {
      phase = nextPhase
      onPhaseChanged(nextPhase)
    }
    if secondLevelPhase != nextSecondLevelPhase {
      secondLevelPhase = nextSecondLevelPhase
      onSecondLevelPhaseChanged(nextSecondLevelPhase)
    }
  }
}
