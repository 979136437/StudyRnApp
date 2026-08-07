import { View } from 'react-native';

import type { MediaThumbnailProps } from '../types';

export function MediaThumbnail({
  style,
}: MediaThumbnailProps): React.JSX.Element {
  return (
    <View accessibilityLabel="Media thumbnail unavailable" style={style} />
  );
}
