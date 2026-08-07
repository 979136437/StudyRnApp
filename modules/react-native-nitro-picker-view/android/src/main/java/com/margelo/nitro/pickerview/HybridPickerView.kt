package com.margelo.nitro.pickerview

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import com.facebook.react.uimanager.ThemedReactContext
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val DEFAULT_ITEM_HEIGHT_DP = 44.0
private const val MIN_ITEM_HEIGHT_DP = 24.0
private const val MAX_ITEM_HEIGHT_DP = 120.0
private const val DEFAULT_MAGNIFICATION = 1.18
private const val MIN_MAGNIFICATION = 1.0
private const val MAX_MAGNIFICATION = 1.6
private const val DEFAULT_FADE_SIZE_DP = 72.0
private const val MAX_FADE_SIZE_DP = 240.0
private const val DEFAULT_FADE_INTENSITY = 0.9
private const val SNAP_DURATION_MS = 140
private const val SNAP_TOLERANCE_PX = 1

private fun Double.finiteOr(fallback: Double): Double = if (isFinite()) this else fallback

private fun Context.dp(value: Double): Int =
  TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP,
    value.toFloat(),
    resources.displayMetrics,
  ).roundToInt()

private fun resolveThemeColor(context: Context, attribute: Int, fallback: Int): Int {
  val typedValue = TypedValue()
  return if (context.theme.resolveAttribute(attribute, typedValue, true)) {
    if (typedValue.resourceId != 0) {
      runCatching { context.getColor(typedValue.resourceId) }.getOrDefault(fallback)
    } else {
      typedValue.data
    }
  } else {
    fallback
  }
}

private fun parseColorOrNull(value: String): Int? {
  if (value.isBlank()) return null
  return runCatching { Color.parseColor(value) }.getOrNull() ?: run {
    val match = Regex(
      """rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)""",
      RegexOption.IGNORE_CASE,
    ).matchEntire(value) ?: return@run null
    val red = match.groupValues[1].toDoubleOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@run null
    val green = match.groupValues[2].toDoubleOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@run null
    val blue = match.groupValues[3].toDoubleOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@run null
    val alpha = match.groupValues[4].toDoubleOrNull()?.let {
      (it.coerceIn(0.0, 1.0) * 255).roundToInt()
    } ?: 255
    Color.argb(alpha, red, green, blue)
  }
}

private class PickerRowAdapter(
  private val context: Context,
  private val itemHeightPx: () -> Int,
) : BaseAdapter() {
  var items: List<String> = emptyList()
    private set

  fun update(nextItems: List<String>) {
    if (items == nextItems) return
    items = nextItems
    notifyDataSetChanged()
  }

  override fun getCount(): Int = items.size

  override fun getItem(position: Int): String = items[position]

  override fun getItemId(position: Int): Long = position.toLong()

  override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
    val textView = convertView as? TextView ?: TextView(context).apply {
      gravity = Gravity.CENTER
      isSingleLine = true
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setTypeface(typeface, Typeface.NORMAL)
      ellipsize = android.text.TextUtils.TruncateAt.END
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    textView.text = getItem(position)
    textView.contentDescription = getItem(position)
    textView.layoutParams = AbsListView.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      itemHeightPx(),
    )
    return textView
  }
}

private class PickerColumnList(
  context: Context,
  val columnIndex: Int,
  private val listener: Listener,
) : ListView(context), AbsListView.OnScrollListener {
  interface Listener {
    fun onInteractionStart(column: Int)
    fun onInteractionSettled(column: Int, selectedIndex: Int)
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val rowAdapter = PickerRowAdapter(context) { itemHeightPx }
  private val textColor = resolveThemeColor(context, android.R.attr.textColorPrimary, Color.BLACK)
  private var itemHeightPx = context.dp(DEFAULT_ITEM_HEIGHT_DP)
  private var magnification = DEFAULT_MAGNIFICATION
  private var userInteractionActive = false
  private var snapping = false
  private var disposed = false
  private var selectedIndex = 0

  private val settleRunnable = Runnable {
    if (!disposed && userInteractionActive) {
      finishInteraction(nearestIndex())
    }
  }

  init {
    adapter = rowAdapter
    divider = ColorDrawable(Color.TRANSPARENT)
    dividerHeight = 0
    isVerticalScrollBarEnabled = false
    overScrollMode = View.OVER_SCROLL_NEVER
    clipToPadding = false
    clipChildren = false
    setOnScrollListener(this)
    descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
  }

  fun updateItems(items: List<String>): Boolean {
    if (rowAdapter.items == items) return false
    rowAdapter.update(items)
    selectedIndex = normalizeIndex(selectedIndex)
    return true
  }

  fun updateVisuals(nextItemHeightPx: Int, nextMagnification: Double) {
    val heightChanged = itemHeightPx != nextItemHeightPx
    itemHeightPx = nextItemHeightPx
    magnification = nextMagnification
    if (heightChanged) {
      rowAdapter.notifyDataSetChanged()
      updateCenterPadding()
      post { applySelection(selectedIndex) }
    }
    updateVisibleRows()
  }

  fun setDisabled(disabled: Boolean) {
    isEnabled = !disabled
  }

  fun applySelection(index: Int) {
    if (rowAdapter.isEmpty || height == 0) {
      selectedIndex = 0
      return
    }
    selectedIndex = normalizeIndex(index)
    setSelectionFromTop(selectedIndex, paddingTop)
    post { updateVisibleRows() }
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    updateCenterPadding()
    post { applySelection(selectedIndex) }
  }

  private fun updateCenterPadding() {
    val verticalPadding = max(0, (height - itemHeightPx) / 2)
    setPadding(paddingLeft, verticalPadding, paddingRight, verticalPadding)
  }

  override fun onScrollStateChanged(view: AbsListView?, scrollState: Int) {
    when (scrollState) {
      AbsListView.OnScrollListener.SCROLL_STATE_TOUCH_SCROLL -> {
        mainHandler.removeCallbacks(settleRunnable)
        snapping = false
        if (!userInteractionActive) {
          userInteractionActive = true
          listener.onInteractionStart(columnIndex)
        }
      }
      AbsListView.OnScrollListener.SCROLL_STATE_IDLE -> {
        if (userInteractionActive) snapToNearest()
      }
    }
  }

  override fun onScroll(
    view: AbsListView?,
    firstVisibleItem: Int,
    visibleItemCount: Int,
    totalItemCount: Int,
  ) {
    updateVisibleRows()
  }

  private fun snapToNearest() {
    if (rowAdapter.isEmpty) {
      finishInteraction(0)
      return
    }
    val target = nearestIndex()
    val targetChild = getChildAt(target - firstVisiblePosition)
    val expectedTop = paddingTop
    if (targetChild != null && abs(targetChild.top - expectedTop) <= SNAP_TOLERANCE_PX) {
      finishInteraction(target)
      return
    }
    if (!snapping) {
      snapping = true
      smoothScrollToPositionFromTop(target, expectedTop, SNAP_DURATION_MS)
    }
    mainHandler.removeCallbacks(settleRunnable)
    mainHandler.postDelayed(settleRunnable, SNAP_DURATION_MS.toLong() + 40L)
  }

  private fun finishInteraction(index: Int) {
    mainHandler.removeCallbacks(settleRunnable)
    snapping = false
    selectedIndex = normalizeIndex(index)
    if (!userInteractionActive) return
    userInteractionActive = false
    listener.onInteractionSettled(columnIndex, selectedIndex)
  }

  private fun nearestIndex(): Int {
    if (rowAdapter.isEmpty || childCount == 0) return 0
    val centerY = height / 2f
    var bestPosition = firstVisiblePosition
    var bestDistance = Float.MAX_VALUE
    for (childIndex in 0 until childCount) {
      val child = getChildAt(childIndex)
      val distance = abs((child.top + child.bottom) / 2f - centerY)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPosition = firstVisiblePosition + childIndex
      }
    }
    return normalizeIndex(bestPosition)
  }

  private fun updateVisibleRows() {
    if (height <= 0) return
    val centerY = height / 2f
    val influenceDistance = max(1f, itemHeightPx * 2f)
    for (childIndex in 0 until childCount) {
      val child = getChildAt(childIndex)
      val distance = abs((child.top + child.bottom) / 2f - centerY)
      val progress = (1f - distance / influenceDistance).coerceIn(0f, 1f)
      val eased = progress * progress * (3f - 2f * progress)
      val scale = (1.0 + (magnification - 1.0) * eased).toFloat()
      child.scaleX = scale
      child.scaleY = scale
      child.alpha = 0.45f + 0.55f * eased
      (child as? TextView)?.setTextColor(textColor)
    }
  }

  private fun normalizeIndex(index: Int): Int =
    if (rowAdapter.isEmpty) 0 else index.coerceIn(0, rowAdapter.count - 1)

  fun dispose() {
    disposed = true
    mainHandler.removeCallbacksAndMessages(null)
    setOnScrollListener(null)
    userInteractionActive = false
  }
}

private class PickerRootLayout(
  context: Context,
  private val onStart: (Int) -> Unit,
  private val onSettled: (Int, Int) -> Unit,
) : FrameLayout(context), PickerColumnList.Listener {
  private val columnsContainer = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    clipChildren = true
  }
  private val columnViews = mutableListOf<PickerColumnList>()
  private val fadePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var lastPropValue = IntArray(0)
  private var fadeColor = resolveThemeColor(context, android.R.attr.colorBackground, Color.WHITE)
  private var fadeSizePx = context.dp(DEFAULT_FADE_SIZE_DP)
  private var fadeIntensity = DEFAULT_FADE_INTENSITY

  init {
    addView(
      columnsContainer,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    setWillNotDraw(false)
  }

  fun update(
    columns: List<List<String>>,
    value: IntArray,
    disabled: Boolean,
    itemHeightPx: Int,
    magnification: Double,
    edgeFadeColor: String,
    edgeFadeSizePx: Int,
    edgeFadeIntensity: Double,
  ) {
    ensureColumnCount(columns.size)
    columns.forEachIndexed { index, items ->
      val column = columnViews[index]
      val itemsChanged = column.updateItems(items)
      column.updateVisuals(itemHeightPx, magnification)
      column.setDisabled(disabled)
      val nextValue = value.getOrElse(index) { 0 }
      if (itemsChanged || lastPropValue.getOrNull(index) != nextValue) {
        column.applySelection(nextValue)
      }
    }
    lastPropValue = value.copyOf()
    fadeColor = parseColorOrNull(edgeFadeColor)
      ?: resolveThemeColor(context, android.R.attr.colorBackground, Color.WHITE)
    fadeSizePx = edgeFadeSizePx
    fadeIntensity = edgeFadeIntensity
    invalidate()
  }

  private fun ensureColumnCount(count: Int) {
    while (columnViews.size > count) {
      val removed = columnViews.removeAt(columnViews.lastIndex)
      removed.dispose()
      columnsContainer.removeView(removed)
    }
    if (lastPropValue.size != count) {
      lastPropValue = lastPropValue.copyOf(count)
    }
    while (columnViews.size < count) {
      val column = PickerColumnList(context, columnViews.size, this)
      columnViews.add(column)
      columnsContainer.addView(
        column,
        LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f),
      )
    }
  }

  override fun onInteractionStart(column: Int) {
    onStart(column)
  }

  override fun onInteractionSettled(column: Int, selectedIndex: Int) {
    onSettled(column, selectedIndex)
  }

  override fun dispatchDraw(canvas: Canvas) {
    super.dispatchDraw(canvas)
    if (fadeSizePx <= 0 || fadeIntensity <= 0.0 || height <= 0) return
    val size = min(fadeSizePx.toFloat(), height / 2f)
    val baseAlpha = (Color.alpha(fadeColor) * fadeIntensity).roundToInt().coerceIn(0, 255)
    val opaque = Color.argb(baseAlpha, Color.red(fadeColor), Color.green(fadeColor), Color.blue(fadeColor))
    val transparent = Color.argb(0, Color.red(fadeColor), Color.green(fadeColor), Color.blue(fadeColor))

    fadePaint.shader = LinearGradient(0f, 0f, 0f, size, opaque, transparent, Shader.TileMode.CLAMP)
    canvas.drawRect(0f, 0f, width.toFloat(), size, fadePaint)
    fadePaint.shader = LinearGradient(
      0f,
      height - size,
      0f,
      height.toFloat(),
      transparent,
      opaque,
      Shader.TileMode.CLAMP,
    )
    canvas.drawRect(0f, height - size, width.toFloat(), height.toFloat(), fadePaint)
    fadePaint.shader = null
  }

  fun dispose() {
    columnViews.forEach(PickerColumnList::dispose)
    columnViews.clear()
    lastPropValue = IntArray(0)
    columnsContainer.removeAllViews()
  }
}

class HybridPickerView(
  private val context: ThemedReactContext,
) : HybridPickerViewSpec() {
  private val root = PickerRootLayout(
    context,
    onStart = ::handleStart,
    onSettled = ::handleSettled,
  )
  override val view: View = root

  override var columns: Array<NativePickerColumn> = emptyArray()
  override var value: DoubleArray = doubleArrayOf()
  override var disabled = false
  override var itemHeight = DEFAULT_ITEM_HEIGHT_DP
  override var magnification = DEFAULT_MAGNIFICATION
  override var edgeFadeColor = ""
  override var edgeFadeSize = DEFAULT_FADE_SIZE_DP
  override var edgeFadeIntensity = DEFAULT_FADE_INTENSITY
  override var onChange: (NativePickerEvent) -> Unit = {}
  override var onPickStart: (NativePickerEvent) -> Unit = {}
  override var onPickEnd: (NativePickerEvent) -> Unit = {}

  private var normalizedValue = IntArray(0)
  private var disposed = false

  override fun afterUpdate() {
    if (disposed) return
    val normalizedColumns = columns.map { it.items.toList() }
    normalizedValue = IntArray(normalizedColumns.size) { columnIndex ->
      val count = normalizedColumns[columnIndex].size
      if (count == 0) {
        0
      } else {
        value.getOrNull(columnIndex)
          ?.finiteOr(0.0)
          ?.toInt()
          ?.coerceIn(0, count - 1)
          ?: 0
      }
    }
    val safeItemHeight = itemHeight.finiteOr(DEFAULT_ITEM_HEIGHT_DP)
      .coerceIn(MIN_ITEM_HEIGHT_DP, MAX_ITEM_HEIGHT_DP)
    val safeMagnification = magnification.finiteOr(DEFAULT_MAGNIFICATION)
      .coerceIn(MIN_MAGNIFICATION, MAX_MAGNIFICATION)
    val safeFadeSize = edgeFadeSize.finiteOr(DEFAULT_FADE_SIZE_DP)
      .coerceIn(0.0, MAX_FADE_SIZE_DP)
    val safeFadeIntensity = edgeFadeIntensity.finiteOr(DEFAULT_FADE_INTENSITY)
      .coerceIn(0.0, 1.0)

    root.update(
      columns = normalizedColumns,
      value = normalizedValue,
      disabled = disabled,
      itemHeightPx = context.dp(safeItemHeight),
      magnification = safeMagnification,
      edgeFadeColor = edgeFadeColor,
      edgeFadeSizePx = context.dp(safeFadeSize),
      edgeFadeIntensity = safeFadeIntensity,
    )
  }

  private fun handleStart(column: Int) {
    if (disposed || disabled) return
    onPickStart(createEvent(column))
  }

  private fun handleSettled(column: Int, selectedIndex: Int) {
    if (disposed || disabled || column !in normalizedValue.indices) return
    normalizedValue[column] = selectedIndex
    val event = createEvent(column)
    onChange(event)
    onPickEnd(event)
  }

  private fun createEvent(column: Int): NativePickerEvent = NativePickerEvent(
    value = DoubleArray(normalizedValue.size) { normalizedValue[it].toDouble() },
    column = column.toDouble(),
  )

  override fun onDropView() {
    dispose()
  }

  private fun dispose() {
    if (disposed) return
    disposed = true
    root.dispose()
    onChange = {}
    onPickStart = {}
    onPickEnd = {}
  }
}
