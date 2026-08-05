import { StyleSheet, Text, View } from 'react-native';

export interface FeedItem {
  id: string;
  summary: string;
  time: string;
  title: string;
}

interface FeedCardProps {
  fill?: boolean;
  item: FeedItem;
  selectable?: boolean;
}

export function FeedCard({
  fill = false,
  item,
  selectable = false,
}: FeedCardProps): React.JSX.Element {
  return (
    <View style={[styles.card, fill && styles.fill]}>
      <View style={styles.header}>
        <Text selectable={selectable} style={styles.title}>
          {item.title}
        </Text>
        <Text selectable={selectable} style={styles.time}>
          {item.time}
        </Text>
      </View>
      <Text selectable={selectable} style={styles.summary}>
        {item.summary}
      </Text>
    </View>
  );
}

const colors = {
  border: '#DCE2E7',
  muted: '#66727D',
  surface: '#FFFFFF',
  text: '#17212B',
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  fill: {
    height: '100%',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  summary: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  time: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
