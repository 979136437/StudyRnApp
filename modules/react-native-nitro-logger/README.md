# react-native-nitro-logger

通过空闲批处理同时写入 JavaScript Console 和 Android Logcat / Apple unified logging 的非阻塞日志模块。

```ts
import { createLogger } from 'react-native-nitro-logger';

const logger = createLogger('InteractiveList');
logger.info('drag.start', { session: 1, key: 'item-01' });
```
