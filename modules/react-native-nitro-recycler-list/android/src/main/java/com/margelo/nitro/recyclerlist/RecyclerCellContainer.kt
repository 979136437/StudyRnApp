package com.margelo.nitro.recyclerlist

import android.content.Context
import android.widget.FrameLayout

class RecyclerCellContainer(context: Context) : FrameLayout(context) {
  init {
    clipChildren = false
    clipToPadding = false
  }
}
