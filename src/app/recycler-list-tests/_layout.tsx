import { Stack } from 'expo-router/stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecyclerListTestsLayout(): React.JSX.Element {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerTitleStyle: { color: '#18221e', fontWeight: '700' },
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
