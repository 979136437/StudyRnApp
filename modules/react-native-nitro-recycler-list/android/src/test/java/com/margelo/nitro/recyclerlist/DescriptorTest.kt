package com.margelo.nitro.recyclerlist

import org.junit.Assert.assertEquals
import org.junit.Test

class DescriptorTest {
  @Test
  fun descriptorKeepsRecyclingAndLayoutMetadata() {
    val descriptor = ItemDescriptor("header", "section", 2.0, 1.0, "featured", 96.0)

    assertEquals("header", descriptor.key)
    assertEquals("section", descriptor.type)
    assertEquals(2.0, descriptor.span, 0.0)
    assertEquals(1.0, descriptor.stickyLevel, 0.0)
    assertEquals("featured", descriptor.stickyGroup)
    assertEquals(96.0, descriptor.estimatedSize, 0.0)
  }
}
