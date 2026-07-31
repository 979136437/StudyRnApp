import UIKit

final class RecyclerCellContainer: UIView {}

final class RecyclerCollectionCell: UICollectionViewCell {
  var slotId = -1
  var bindingIndex = -1
  var bindingGeneration = 0

  override func layoutSubviews() {
    super.layoutSubviews()
    for hostView in contentView.subviews where hostView.frame != contentView.bounds {
      hostView.frame = contentView.bounds
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    contentView.endEditing(true)
  }
}
