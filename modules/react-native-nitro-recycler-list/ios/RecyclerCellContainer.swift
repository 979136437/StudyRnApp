import UIKit

final class RecyclerCellContainer: UIView {
  var onComponentViewMounted: (() -> Void)?

  @objc(nitroRecyclerComponentDidMount)
  func componentViewDidMount() {
    onComponentViewMounted?()
  }
}

final class RecyclerCollectionCell: UICollectionViewCell {
  var slotId = -1
  var bindingIndex = -1
  var bindingGeneration = 0
  var isDisplaying = false

  override func layoutSubviews() {
    super.layoutSubviews()
    for hostView in contentView.subviews where hostView.frame != contentView.bounds {
      hostView.frame = contentView.bounds
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    isDisplaying = false
    contentView.endEditing(true)
  }
}
