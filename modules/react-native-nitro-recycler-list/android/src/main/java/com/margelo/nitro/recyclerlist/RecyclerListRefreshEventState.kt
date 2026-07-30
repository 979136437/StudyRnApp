package com.margelo.nitro.recyclerlist

internal data class RecyclerListRefreshSnapshot(
  val phase: NativeRefreshPhase,
  val offset: Double,
  val progress: Double,
  val secondLevelPhase: NativeSecondLevelPhase,
  val secondLevelProgress: Double,
)

/** 统一规范化刷新事件，并将高频位移与低频阶段通知分流。 */
internal class RecyclerListRefreshEventState {
  var phase: NativeRefreshPhase = NativeRefreshPhase.IDLE
    private set
  var secondLevelPhase: NativeSecondLevelPhase = NativeSecondLevelPhase.IDLE
    private set

  fun publish(
    nextPhase: NativeRefreshPhase,
    offset: Double,
    progress: Double,
    nextSecondLevelPhase: NativeSecondLevelPhase,
    secondLevelProgress: Double,
    onPull: (RecyclerListRefreshSnapshot) -> Unit,
    onPhaseChanged: (NativeRefreshPhase) -> Unit,
    onSecondLevelPhaseChanged: (NativeSecondLevelPhase) -> Unit,
  ) {
    onPull(
      RecyclerListRefreshSnapshot(
        nextPhase,
        offset.coerceAtLeast(0.0),
        progress.coerceIn(0.0, 1.0),
        nextSecondLevelPhase,
        secondLevelProgress.coerceIn(0.0, 1.0),
      ),
    )
    if (phase != nextPhase) {
      phase = nextPhase
      onPhaseChanged(nextPhase)
    }
    if (secondLevelPhase != nextSecondLevelPhase) {
      secondLevelPhase = nextSecondLevelPhase
      onSecondLevelPhaseChanged(nextSecondLevelPhase)
    }
  }
}
