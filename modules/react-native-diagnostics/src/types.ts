export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type DiagnosticLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export type DiagnosticKind =
  | 'javascript'
  | 'react'
  | 'native'
  | 'abnormal-termination'
  | 'manual';

export type DiagnosticBreadcrumb = {
  /** 记录时间，使用 ISO 8601。 */
  timestamp: string;
  /** 日志来源，例如导航、网络、控制台或应用生命周期。 */
  category: string;
  /** 经过脱敏和长度限制的人类可读摘要。 */
  message: string;
  /** 日志严重程度。 */
  level: DiagnosticLevel;
  /** 不包含令牌、请求正文及用户内容的结构化上下文。 */
  data?: JsonValue;
};

export type DiagnosticError = {
  /** 异常类型名称。 */
  name: string;
  /** 异常消息。 */
  message: string;
  /** JavaScript 或原生异常堆栈；不可获得时省略。 */
  stack?: string;
};

export type DiagnosticReport = {
  /** 报告结构版本，用于后续兼容迁移。 */
  schemaVersion: 1;
  /** 当前设备内唯一的报告标识。 */
  id: string;
  /** 报告创建时间。 */
  createdAt: string;
  /** 异常来源。 */
  kind: DiagnosticKind;
  /** 是否属于会导致当前运行终止的异常。 */
  fatal: boolean;
  /** Sentry 接收事件后返回的公开事件标识。 */
  sentryEventId?: string;
  /** 启动提示展示时间；未提示时省略。 */
  promptedAt?: string;
  /** 用户打开详情的时间；未查看时省略。 */
  viewedAt?: string;
  /** 应用及原生构建信息。 */
  app: {
    name: string;
    applicationId: string | null;
    version: string | null;
    buildVersion: string | null;
  };
  /** 崩溃发生前的运行环境。 */
  runtime: {
    platform: string;
    osVersion: string;
    deviceModel: string | null;
    reactNativeVersion: string | null;
    jsEngine: 'hermes' | 'jsc' | 'unknown';
    newArchitecture: boolean;
    route: string | null;
    appState: string;
    sessionId: string;
  };
  /** 标准化后的异常。 */
  error: DiagnosticError;
  /** 业务主动提供的脱敏上下文快照。 */
  contexts: Readonly<Record<string, JsonValue>>;
  /** 崩溃前的环形日志，最多 200 条。 */
  breadcrumbs: readonly DiagnosticBreadcrumb[];
};

export type DiagnosticReportSummary = Pick<
  DiagnosticReport,
  | 'id'
  | 'createdAt'
  | 'kind'
  | 'fatal'
  | 'promptedAt'
  | 'viewedAt'
  | 'sentryEventId'
> & {
  errorName: string;
  errorMessage: string;
  platform: string;
  appVersion: string | null;
};

export type DiagnosticSession = {
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
  appState: string;
  route: string | null;
  endedCleanly: boolean;
};
