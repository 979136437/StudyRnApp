import { Image, Text, View } from '@/tw';

export default function Index() {
  return (
    <View className="flex-1 flex flex-col gap-2 px-2 bg-red-500">
      <View className="bg-blue-500/50 w-full border border-solid border-red-500 pt-safe-top">
        <Text className="text-lg font-bold text-blue-900">112233111111</Text>
      </View>
      <View className="bg-blue-500/50 w-full pt-safe-top">
        <Text className="text-[24px] font-bold text-blue-900">
          1122331111111
        </Text>
      </View>
      <View className="bg-blue-500/50 w-full pt-safe-top">
        <Text className="font-bold text-blue-900" style={{ fontSize: 24 }}>
          1122331111111
        </Text>
      </View>
      <View className="bg-blue-500/50 w-full pt-safe-top">
        <Text className="text-[24rem] font-bold text-blue-900">
          1122331111111
        </Text>
      </View>
      <Image
        source={{
          uri: 'https://tencent-web-1320474462.cos.ap-shanghai.myqcloud.com/lego/icon/ex_right.png',
        }}
        contentFit="fill"
        className="w-6 h-17"
      />
      <View className="w-187.5 h-333.5 bg-blue-500" />
    </View>
  );
}
