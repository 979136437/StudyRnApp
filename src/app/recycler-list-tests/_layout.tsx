import { Stack } from 'expo-router/stack';

export default function RecyclerListTestsLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerTitleStyle: { color: '#18221e', fontWeight: '700' },
      }}
    />
  );
}
