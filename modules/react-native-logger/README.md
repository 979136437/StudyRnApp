# react-native-logger

通过空闲批处理写入 JavaScript Console 的非阻塞日志模块。

```ts
import { createLogger } from 'react-native-logger';

const logger = createLogger('InteractiveList');
logger.info('drag.start', { session: 1, key: 'item-01' });
```
