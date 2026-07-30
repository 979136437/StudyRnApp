package com.margelo.nitro.recyclerlist

import org.junit.Assert.assertEquals
import org.junit.Test

class RecyclerTabCoordinatorStateTest {
  @Test
  fun syncsPartialCollapseAndPreservesDeepOffsets() {
    val state = RecyclerTabCoordinatorState()
    state.update("first", 60.0, true, 180.0)
    state.update("second", 320.0, false, 180.0)
    assertEquals(60.0, state.targetOffset("second", 180.0), 0.0)

    state.update("first", 240.0, true, 180.0)
    assertEquals(320.0, state.targetOffset("second", 180.0), 0.0)
  }
}
