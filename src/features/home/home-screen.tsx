import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MyImage } from 'react-native-components';

export function HomeScreen(): React.JSX.Element {
  return (
    <View className="flex-1 gap-4 p-4 bg-red-500 pt-safe">
      <Link href="/cache" asChild>
        <Pressable accessibilityRole="button" style={styles.cacheButton}>
          <Text style={styles.cacheButtonText}>缓存统计</Text>
        </Pressable>
      </Link>
      <Link href="/visibility-observer" asChild>
        <Pressable accessibilityRole="button" style={styles.cacheButton}>
          <Text style={styles.cacheButtonText}>可见性监听测试</Text>
        </Pressable>
      </Link>
      <Link href="/diagnostics" asChild>
        <Pressable accessibilityRole="button" style={styles.cacheButton}>
          <Text style={styles.cacheButtonText}>诊断信息</Text>
        </Pressable>
      </Link>
      <MyImage
        source={{
          uri: 'https://bjmnapi.happyvalley.link/uploads/20200703/2232b3134bdf5c89df95a20aede339fb.jpg',
        }}
        className="bg-white aspect-square rounded-md"
      />
      <MyImage
        source={{
          uri: 'https://bjmnapi.happyvalley.link/uploads/20260529/81ac1235d0f766d82357a0589bab9d07.jpg',
        }}
        className="bg-white aspect-square rounded-md"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cacheButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cacheButtonPressed: {
    opacity: 0.7,
  },
  cacheButtonText: {
    color: '#202124',
    fontSize: 15,
    fontWeight: '600',
  },
});
