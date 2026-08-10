package com.margelo.nitro.pickerview

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
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
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
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
private const val DEFAULT_FONT_SIZE_SP = 14.0
private const val MIN_FONT_SIZE_SP = 8.0
private const val MAX_FONT_SIZE_SP = 64.0
private const val DEFAULT_FADE_SIZE_DP = 72.0
private const val MAX_FADE_SIZE_DP = 240.0
private const val DEFAULT_FADE_INTENSITY = 0.9
private const val SNAP_DURATION_MS = 220L
private const val SNAP_DECELERATION_FACTOR = 1.6f
private const val SNAP_TOLERANCE_PX = 1
private const val SNAP_VERIFICATION_DELAY_MS = 16L
private const val SPACER_VIEW_TYPE = 0
private const val ITEM_VIEW_TYPE = 1
private const val EDGE_SPACER_COUNT = 2

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

private fun blendColors(start: Int, end: Int, progress: Float): Int {
  val fraction = progress.coerceIn(0f, 1f)
  fun blend(startComponent: Int, endComponent: Int): Int =
    (startComponent + (endComponent - startComponent) * fraction).roundToInt()
  return Color.argb(
    blend(Color.alpha(start), Color.alpha(end)),
    blend(Color.red(start), Color.red(end)),
    blend(Color.green(start), Color.green(end)),
    blend(Color.blue(start), Color.blue(end)),
  )
}

private class PickerRowAdapter(
  private val context: Context,
  private val itemHeightPx: () -> Int,
  private val centerSpacingPx: () -> Int,
  private val fontSizeSp: () -> Float,
) : BaseAdapter() {
  var items: List<String> = emptyList()
    private set

  fun update(nextItems: List<String>) {
    if (items == nextItems) return
    items = nextItems
    notifyDataSetChanged()
  }

  val itemCount: Int
    get() = items.size

  override fun getCount(): Int = if (items.isEmpty()) 0 else items.size + EDGE_SPACER_COUNT

  override fun getItem(position: Int): String? =
    dataIndex(position)?.let { items[it] }

  override fun getItemId(position: Int): Long = position.toLong()

  override fun getViewTypeCount(): Int = 2

  override fun getItemViewType(position: Int): Int =
    if (dataIndex(position) == null) SPACER_VIEW_TYPE else ITEM_VIEW_TYPE

  override fun isEnabled(position: Int): Boolean = dataIndex(position) != null

  override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
    val index = dataIndex(position)
    if (index == null) {
      return (convertView ?: View(context)).apply {
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        layoutParams = AbsListView.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          centerSpacingPx(),
        )
      }
    }
    val textView = convertView as? TextView ?: TextView(context).apply {
      gravity = Gravity.CENTER
      isSingleLine = true
      setTypeface(typeface, Typeface.NORMAL)
      ellipsize = android.text.TextUtils.TruncateAt.END
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    textView.text = items[index]
    textView.contentDescription = items[index]
    textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSizeSp())
    textView.layoutParams = AbsListView.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      itemHeightPx(),
    )
    return textView
  }

  fun adapterPosition(index: Int): Int = index + 1

  fun dataIndex(adapterPosition: Int): Int? {
    if (items.isEmpty()) return null
    val index = adapterPosition - 1
    return index.takeIf { it in items.indices }
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
  private val themeTextColor = resolveThemeColor(context, android.R.attr.textColorPrimary, Color.BLACK)
  private val rowAdapter = PickerRowAdapter(
    context,
    { itemHeightPx },
    { centerSpacingPx },
    { fontSizeSp },
  )
  private var itemHeightPx = context.dp(DEFAULT_ITEM_HEIGHT_DP)
  private var centerSpacingPx = 0
  private var fontSizeSp = DEFAULT_FONT_SIZE_SP.toFloat()
  private var magnification = DEFAULT_MAGNIFICATION
  private var textColor = themeTextColor
  private var selectedTextColor = themeTextColor
  private var userInteractionActive = false
  private var snapping = false
  private var disposed = false
  private var selectedIndex = 0
  private var snapAnimator: ValueAnimator? = null

  private val settleRunnable = Runnable {
    if (!disposed && userInteractionActive) {
      verifySnapAlignment()
    }
  }
  private val applySelectionRunnable = Runnable {
    if (!disposed) applySelection(selectedIndex)
  }
  private val updateVisibleRowsRunnable = Runnable {
    if (!disposed) updateVisibleRows()
  }

  init {
    adapter = rowAdapter
    divider = ColorDrawable(Color.TRANSPARENT)
    dividerHeight = 0
    // ListView 默认 selector 会在轻触项目时绘制深色反馈，滚轮本身不需要选中态遮罩。
    selector = ColorDrawable(Color.TRANSPARENT)
    cacheColorHint = Color.TRANSPARENT
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

  fun updateVisuals(
    nextItemHeightPx: Int,
    nextFontSizeSp: Double,
    nextMagnification: Double,
    nextTextColor: String,
    nextSelectedTextColor: String,
  ) {
    val heightChanged = itemHeightPx != nextItemHeightPx
    val fontSizeChanged = fontSizeSp != nextFontSizeSp.toFloat()
    itemHeightPx = nextItemHeightPx
    fontSizeSp = nextFontSizeSp.toFloat()
    magnification = nextMagnification
    textColor = parseColorOrNull(nextTextColor) ?: themeTextColor
    selectedTextColor = parseColorOrNull(nextSelectedTextColor) ?: textColor
    if (heightChanged) {
      updateCenterSpacing()
    }
    if (heightChanged || fontSizeChanged) {
      rowAdapter.notifyDataSetChanged()
    }
    if (heightChanged) {
      scheduleSelectionApplication()
    }
    updateVisibleRows()
  }

  fun setDisabled(disabled: Boolean) {
    isEnabled = !disabled
    if (disabled) {
      cancelSnapAnimation()
      userInteractionActive = false
    }
  }

  fun applySelection(index: Int) {
    // 尺寸尚未就绪时也要保留受控索引，待挂载或尺寸变化后再完成定位。
    selectedIndex = normalizeIndex(index)
    if (rowAdapter.isEmpty || height == 0) return
    setSelectionFromTop(rowAdapter.adapterPosition(selectedIndex), centerSpacingPx)
    removeCallbacks(updateVisibleRowsRunnable)
    post(updateVisibleRowsRunnable)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    scheduleSelectionApplication()
  }

  override fun onDetachedFromWindow() {
    cancelPendingViewWork()
    super.onDetachedFromWindow()
  }

  override fun onCancelPendingInputEvents() {
    super.onCancelPendingInputEvents()
    cancelPendingViewWork()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    if (updateCenterSpacing()) {
      rowAdapter.notifyDataSetChanged()
    }
    scheduleSelectionApplication()
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (isEnabled) {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          removeCallbacks(applySelectionRunnable)
          parent?.requestDisallowInterceptTouchEvent(true)
        }
        MotionEvent.ACTION_MOVE -> parent?.requestDisallowInterceptTouchEvent(true)
        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> parent?.requestDisallowInterceptTouchEvent(false)
      }
    }
    return super.dispatchTouchEvent(event)
  }

  private fun updateCenterSpacing(): Boolean {
    val nextSpacing = max(0, (height - itemHeightPx) / 2)
    if (centerSpacingPx == nextSpacing) return false
    centerSpacingPx = nextSpacing
    return true
  }

  private fun scheduleSelectionApplication() {
    removeCallbacks(applySelectionRunnable)
    post(applySelectionRunnable)
  }

  private fun cancelPendingViewWork() {
    removeCallbacks(applySelectionRunnable)
    removeCallbacks(updateVisibleRowsRunnable)
    cancelSnapAnimation()
    userInteractionActive = false
    parent?.requestDisallowInterceptTouchEvent(false)
  }

  override fun onScrollStateChanged(view: AbsListView?, scrollState: Int) {
    when (scrollState) {
      AbsListView.OnScrollListener.SCROLL_STATE_TOUCH_SCROLL -> {
        removeCallbacks(applySelectionRunnable)
        cancelSnapAnimation()
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
    val target = nearestSnapTarget()
    if (abs(target.offsetPx) <= SNAP_TOLERANCE_PX) {
      finishInteraction(target.index)
      return
    }
    if (snapping) return
    snapping = true
    mainHandler.removeCallbacks(settleRunnable)
    var previousOffset = 0
    val animator = ValueAnimator.ofInt(0, target.offsetPx).apply {
      duration = SNAP_DURATION_MS
      interpolator = DecelerateInterpolator(SNAP_DECELERATION_FACTOR)
      addUpdateListener { animation ->
        val currentOffset = animation.animatedValue as Int
        val delta = currentOffset - previousOffset
        if (delta != 0) scrollListBy(delta)
        previousOffset = currentOffset
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (snapAnimator !== animation) return
          snapAnimator = null
          mainHandler.post(settleRunnable)
        }
      })
    }
    snapAnimator = animator
    animator.start()
  }

  private fun cancelSnapAnimation() {
    mainHandler.removeCallbacks(settleRunnable)
    val animator = snapAnimator
    snapAnimator = null
    animator?.cancel()
    snapping = false
  }

  private fun verifySnapAlignment() {
    if (rowAdapter.isEmpty) {
      finishInteraction(0)
      return
    }
    val target = nearestSnapTarget()
    if (abs(target.offsetPx) <= SNAP_TOLERANCE_PX) {
      finishInteraction(target.index)
      return
    }

    // 动画结束后按实际可见行再做一次像素纠偏，避免固定延时导致半行停留。
    scrollListBy(target.offsetPx)
    mainHandler.postDelayed(settleRunnable, SNAP_VERIFICATION_DELAY_MS)
  }

  private fun finishInteraction(index: Int) {
    cancelSnapAnimation()
    selectedIndex = normalizeIndex(index)
    if (!userInteractionActive) return
    userInteractionActive = false
    listener.onInteractionSettled(columnIndex, selectedIndex)
  }

  private fun nearestSnapTarget(): SnapTarget {
    if (rowAdapter.isEmpty || childCount == 0) return SnapTarget(0, 0)
    val centerY = height / 2f
    var bestPosition = selectedIndex
    var bestDistance = Float.MAX_VALUE
    var bestOffset = 0
    for (childIndex in 0 until childCount) {
      val itemIndex = rowAdapter.dataIndex(firstVisiblePosition + childIndex) ?: continue
      val child = getChildAt(childIndex)
      val offset = (child.top + child.bottom) / 2f - centerY
      val distance = abs(offset)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPosition = itemIndex
        bestOffset = offset.roundToInt()
      }
    }
    return SnapTarget(normalizeIndex(bestPosition), bestOffset)
  }

  private data class SnapTarget(val index: Int, val offsetPx: Int)

  private fun updateVisibleRows() {
    if (height <= 0) return
    val centerY = height / 2f
    val influenceDistance = max(1f, itemHeightPx * 2f)
    for (childIndex in 0 until childCount) {
      val child = getChildAt(childIndex)
      if (rowAdapter.dataIndex(firstVisiblePosition + childIndex) == null) {
        child.scaleX = 1f
        child.scaleY = 1f
        child.alpha = 0f
        continue
      }
      val distance = abs((child.top + child.bottom) / 2f - centerY)
      val progress = (1f - distance / influenceDistance).coerceIn(0f, 1f)
      val eased = progress * progress * (3f - 2f * progress)
      val scale = (1.0 + (magnification - 1.0) * eased).toFloat()
      child.scaleX = scale
      child.scaleY = scale
      child.alpha = 0.45f + 0.55f * eased
      (child as? TextView)?.setTextColor(
        blendColors(textColor, selectedTextColor, eased),
      )
    }
  }

  private fun normalizeIndex(index: Int): Int =
    if (rowAdapter.itemCount == 0) 0 else index.coerceIn(0, rowAdapter.itemCount - 1)

  fun dispose() {
    disposed = true
    cancelPendingViewWork()
    mainHandler.removeCallbacksAndMessages(null)
    setOnScrollListener(null)
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
    fontSizeSp: Double,
    magnification: Double,
    textColor: String,
    selectedTextColor: String,
    edgeFadeColor: String,
    edgeFadeSizePx: Int,
    edgeFadeIntensity: Double,
  ) {
    ensureColumnCount(columns.size)
    columns.forEachIndexed { index, items ->
      val column = columnViews[index]
      val itemsChanged = column.updateItems(items)
      column.updateVisuals(
        itemHeightPx,
        fontSizeSp,
        magnification,
        textColor,
        selectedTextColor,
      )
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
  override var fontSize = DEFAULT_FONT_SIZE_SP
  override var magnification = DEFAULT_MAGNIFICATION
  override var textColor = ""
  override var selectedTextColor = ""
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
    val safeFontSize = fontSize.finiteOr(DEFAULT_FONT_SIZE_SP)
      .coerceIn(MIN_FONT_SIZE_SP, MAX_FONT_SIZE_SP)
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
      fontSizeSp = safeFontSize,
      magnification = safeMagnification,
      textColor = textColor,
      selectedTextColor = selectedTextColor,
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

  override fun dispose() {
    if (disposed) return
    disposed = true
    root.dispose()
    onChange = {}
    onPickStart = {}
    onPickEnd = {}
    super.dispose()
  }
}
