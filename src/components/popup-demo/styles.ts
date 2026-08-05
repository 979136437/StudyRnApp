import { StyleSheet } from 'react-native';

export const popupDemoColors = {
  accent: '#087E5B',
  background: '#F4F6F8',
  border: '#DCE2E7',
  buttonText: '#FFFFFF',
  muted: '#66727D',
  pressed: '#E5E9EC',
  surface: '#FFFFFF',
  text: '#17212B',
} as const;

export const popupDemoStyles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bottomPopup: {
    alignItems: 'stretch',
    backgroundColor: popupDemoColors.surface,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    gap: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    backgroundColor: popupDemoColors.surface,
    borderColor: popupDemoColors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexGrow: 1,
    height: 44,
    justifyContent: 'center',
    minWidth: 136,
    paddingHorizontal: 14,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.68 },
  buttonPrimary: {
    backgroundColor: popupDemoColors.accent,
    borderColor: popupDemoColors.accent,
  },
  buttonText: {
    color: popupDemoColors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextPrimary: { color: popupDemoColors.buttonText },
  content: {
    gap: 28,
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  popupHandle: {
    alignSelf: 'center',
    backgroundColor: popupDemoColors.border,
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  popupTitle: {
    color: popupDemoColors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  screen: { backgroundColor: popupDemoColors.background, flex: 1 },
  section: {
    borderTopColor: popupDemoColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingTop: 18,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionMeta: { color: popupDemoColors.muted, fontSize: 12 },
  sectionTitle: {
    color: popupDemoColors.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
