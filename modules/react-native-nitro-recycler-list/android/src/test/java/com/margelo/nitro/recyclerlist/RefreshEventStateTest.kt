package com.margelo.nitro.recyclerlist

import org.junit.Assert.assertEquals
import org.junit.Test

class RefreshEventStateTest {
  @Test
  fun clampsPullValuesAndOnlyPublishesChangedPhases() {
    val state = RecyclerListRefreshEventState()
    val pulls = mutableListOf<RecyclerListRefreshSnapshot>()
    val phases = mutableListOf<NativeRefreshPhase>()
    val secondPhases = mutableListOf<NativeSecondLevelPhase>()

    state.publish(NativeRefreshPhase.PULLING, -12.0, 1.8, NativeSecondLevelPhase.IDLE, 0.0, pulls::add, phases::add, secondPhases::add)
    state.publish(NativeRefreshPhase.READY, 120.0, 1.0, NativeSecondLevelPhase.PULLING, 0.4, pulls::add, phases::add, secondPhases::add)
    state.publish(NativeRefreshPhase.READY, 180.0, 1.0, NativeSecondLevelPhase.READY, 1.8, pulls::add, phases::add, secondPhases::add)

    assertEquals(3, pulls.size)
    assertEquals(0.0, pulls.first().offset, 0.0)
    assertEquals(1.0, pulls.first().progress, 0.0)
    assertEquals(listOf(NativeRefreshPhase.PULLING, NativeRefreshPhase.READY), phases)
    assertEquals(listOf(NativeSecondLevelPhase.PULLING, NativeSecondLevelPhase.READY), secondPhases)
    assertEquals(1.0, pulls.last().secondLevelProgress, 0.0)
  }

  @Test
  fun registrySupportsLateRegistrationReplacementAndUnregister() {
    val first = FakeSink("refresh-registry-test")
    val second = FakeSink("refresh-registry-test")
    val snapshot = RecyclerListRefreshSnapshot(
      NativeRefreshPhase.PULLING,
      20.0,
      0.25,
      NativeSecondLevelPhase.IDLE,
      0.0,
    )

    RecyclerListRegistry.emitRefresh(first.listId, snapshot)
    RecyclerListRegistry.registerRefreshEventSource(first)
    RecyclerListRegistry.emitRefresh(first.listId, snapshot)
    RecyclerListRegistry.registerRefreshEventSource(second)
    RecyclerListRegistry.emitRefresh(second.listId, snapshot)
    RecyclerListRegistry.unregisterRefreshEventSource(first)
    RecyclerListRegistry.emitRefresh(second.listId, snapshot)
    RecyclerListRegistry.unregisterRefreshEventSource(second)
    RecyclerListRegistry.emitRefresh(second.listId, snapshot)

    assertEquals(1, first.events.size)
    assertEquals(2, second.events.size)
  }

  private class FakeSink(
    override val listId: String,
  ) : RecyclerListRefreshEventSink {
    val events = mutableListOf<RecyclerListRefreshSnapshot>()
    override fun emitPull(snapshot: RecyclerListRefreshSnapshot) {
      events += snapshot
    }

    override fun emitTabScroll(collapseOffset: Double) = Unit
  }
}
