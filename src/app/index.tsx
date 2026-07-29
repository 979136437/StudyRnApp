import { Text, View, Image } from '@/tw';

export default function Home() {
  return (
    <View className="flex-1 flex flex-col gap-2 px-2 bg-red-500 pt-safe flex-center">
      <View className="bg-blue-500/50 p-2">
        <Text>1122331111111</Text>
      </View>
      <View className="bg-blue-500/50 p-2">
        <Text className="text-blue-900">1122331111111</Text>
      </View>
      <View className="bg-blue-500/50 p-2">
        <Text className="text-blue-900" style={{ padding: 24 }}>
          1122331111111
        </Text>
      </View>
      <View className="bg-blue-500/50 p-2">
        <Text style={{ fontSize: 24 }} className="text-blue-900">
          1122331111111
        </Text>
      </View>
      <Image
        source={{
          uri: 'https://picsum.photos/200/300',
        }}
        className="w-24 h-24 rounded-full"
      />
    </View>
  );
}
