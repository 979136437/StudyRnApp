import UIKit

final class RecyclerCellContainer: UIView {
  var onSizeChanged: ((CGSize) -> Void)?
  private var previousSize: CGSize = .zero

  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.size != previousSize {
      previousSize = bounds.size
      onSizeChanged?(bounds.size)
    }
  }
}

final class RecyclerCollectionCell: UICollectionViewCell {
  var slotId = -1
  var bindingIndex = -1

  override func layoutSubviews() {
    super.layoutSubviews()
    for hostView in contentView.subviews where hostView.frame != contentView.bounds {
      hostView.frame = contentView.bounds
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    bindingIndex = -1
    contentView.subviews.forEach { $0.removeFromSuperview() }
  }
}
