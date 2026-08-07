import { useCallback, useMemo, useRef, useState } from 'react';

import type { Method } from '../core/method';
import { RequestError } from '../core/request-error';
import type { MaybePromise, ProgressInfo } from '../types';

export type UploadSource =
  | string
  | Blob
  | ArrayBuffer
  | { base64: string; name?: string; type?: string }
  | { name?: string; type?: string; uri: string };

export type UploadStatus = 0 | 1 | 2 | 3;

export type UploadFile<TResponse = unknown> = {
  error?: RequestError;
  file: UploadSource;
  id: string;
  name: string;
  preview?: string;
  progress: ProgressInfo;
  response?: TResponse;
  status: UploadStatus;
  type?: string;
};

export type UploaderConfig = {
  createLocalLink?: (source: UploadSource) => MaybePromise<string | undefined>;
  immediate?: boolean;
  limit?: number;
  mode?: 'each' | 'batch';
};

export type UploaderEvent<TResponse> = {
  error?: RequestError;
  fileList: readonly UploadFile<TResponse>[];
  response?: TResponse | readonly TResponse[];
};

export type UploaderResult<TResponse> = {
  abort(): void;
  appendFiles(
    files?: readonly UploadSource[],
    index?: number,
  ): Promise<readonly UploadFile<TResponse>[]>;
  error?: RequestError;
  failCount: number;
  file?: UploadFile<TResponse>;
  fileList: readonly UploadFile<TResponse>[];
  onComplete(
    callback: (event: UploaderEvent<TResponse>) => void,
  ): UploaderResult<TResponse>;
  onError(
    callback: (event: UploaderEvent<TResponse>) => void,
  ): UploaderResult<TResponse>;
  onSuccess(
    callback: (event: UploaderEvent<TResponse>) => void,
  ): UploaderResult<TResponse>;
  progress: ProgressInfo;
  removeFiles(...files: (string | UploadFile<TResponse>)[]): void;
  successCount: number;
  upload(
    ...files: (string | UploadFile<TResponse>)[]
  ): Promise<readonly TResponse[]>;
  uploading: boolean;
};

export type FileSelector = () => MaybePromise<readonly UploadSource[]>;
export type LocalLinkCreator = (
  source: UploadSource,
) => MaybePromise<string | undefined>;

type UploaderHook = {
  <TResponse>(
    handler: (
      file: UploadFile<TResponse> | readonly UploadFile<TResponse>[],
    ) => Method<TResponse>,
    config?: UploaderConfig,
  ): UploaderResult<TResponse>;
  createLocalLink?: LocalLinkCreator;
  selectFile?: FileSelector;
};

let nextFileId = 0;

function useUploaderImpl<TResponse>(
  handler: (
    file: UploadFile<TResponse> | readonly UploadFile<TResponse>[],
  ) => Method<TResponse>,
  config: UploaderConfig = {},
): UploaderResult<TResponse> {
  const [fileList, setFileList] = useState<readonly UploadFile<TResponse>[]>(
    [],
  );
  const filesRef = useRef(fileList);
  filesRef.current = fileList;
  const [error, setError] = useState<RequestError>();
  const [uploading, setUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<ProgressInfo>();
  const methods = useRef(new Map<string, Method<TResponse>>());
  const listeners = useRef({
    complete: new Set<(event: UploaderEvent<TResponse>) => void>(),
    error: new Set<(event: UploaderEvent<TResponse>) => void>(),
    success: new Set<(event: UploaderEvent<TResponse>) => void>(),
  });
  const resultRef = useRef<UploaderResult<TResponse>>(null as never);

  const replace = useCallback(
    (id: string, patch: Partial<UploadFile<TResponse>>) => {
      setFileList((current) => {
        const next = current.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        );
        filesRef.current = next;
        return next;
      });
    },
    [],
  );

  const appendFiles = useCallback(
    async (
      sources?: readonly UploadSource[],
      index = filesRef.current.length,
    ) => {
      const selected = sources ?? (await useUploader.selectFile?.()) ?? [];
      const available = Math.max(
        0,
        (config.limit ?? Number.POSITIVE_INFINITY) - filesRef.current.length,
      );
      const accepted = selected.slice(0, available);
      const createLocalLink =
        config.createLocalLink ?? useUploader.createLocalLink;
      const additions = await Promise.all(
        accepted.map(async (source) => ({
          file: source,
          id: `upload-${Date.now()}-${nextFileId++}`,
          name: readName(source),
          preview: readUri(source) ?? (await createLocalLink?.(source)),
          progress: { loaded: 0, percent: 0, total: 0 },
          status: 0 as const,
          type: readType(source),
        })),
      );
      setFileList((current) => {
        const position = Math.max(0, Math.min(index, current.length));
        const next = [
          ...current.slice(0, position),
          ...additions,
          ...current.slice(position),
        ];
        filesRef.current = next;
        return next;
      });
      if (config.immediate === true && additions.length > 0) {
        queueMicrotask(() => void resultRef.current.upload(...additions));
      }
      return additions;
    },
    [config.createLocalLink, config.immediate, config.limit],
  );

  const abort = useCallback(() => {
    for (const method of methods.current.values()) method.abort();
    methods.current.clear();
    setUploading(false);
  }, []);

  const removeFiles = useCallback(
    (...selected: (string | UploadFile<TResponse>)[]) => {
      const ids = new Set(
        selected.map((item) => (typeof item === 'string' ? item : item.id)),
      );
      for (const id of ids) {
        methods.current.get(id)?.abort();
        methods.current.delete(id);
      }
      setFileList((current) => {
        const next = current.filter((item) => !ids.has(item.id));
        filesRef.current = next;
        return next;
      });
    },
    [],
  );

  const upload = useCallback(
    async (...selected: (string | UploadFile<TResponse>)[]) => {
      const ids = new Set(
        selected.map((item) => (typeof item === 'string' ? item : item.id)),
      );
      const targets = filesRef.current.filter((item) =>
        ids.size > 0
          ? ids.has(item.id)
          : item.status === 0 || item.status === 3,
      );
      if (targets.length === 0) return [];
      setUploading(true);
      setError(undefined);
      setBatchProgress(undefined);
      const runMethod = async (
        method: Method<TResponse>,
        targetIds: readonly string[],
      ) => {
        for (const id of targetIds) methods.current.set(id, method);
        const progressListener = (progress: ProgressInfo) => {
          if (targetIds.length === 1) replace(targetIds[0]!, { progress });
          else setBatchProgress(progress);
        };
        method.onUpload(progressListener);
        try {
          const response = await method.executeOnce();
          for (const id of targetIds) {
            replace(id, {
              error: undefined,
              progress: { loaded: 1, percent: 1, total: 1 },
              response,
              status: 2,
            });
          }
          return response;
        } catch (value) {
          const requestError = normalize(value);
          setError(requestError);
          for (const id of targetIds)
            replace(id, { error: requestError, status: 3 });
          throw requestError;
        } finally {
          method.offUpload(progressListener);
          for (const id of targetIds) methods.current.delete(id);
        }
      };
      for (const target of targets)
        replace(target.id, { error: undefined, status: 1 });
      try {
        let responses: TResponse[];
        if (config.mode === 'batch') {
          responses = [
            await runMethod(
              handler(targets),
              targets.map((item) => item.id),
            ),
          ];
        } else {
          const settled = await Promise.allSettled(
            targets.map((item) => runMethod(handler(item), [item.id])),
          );
          const failed = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected',
          );
          if (failed !== undefined) throw failed.reason;
          responses = settled.map(
            (item) => (item as PromiseFulfilledResult<TResponse>).value,
          );
        }
        const event = { fileList: filesRef.current, response: responses };
        for (const listener of listeners.current.success) listener(event);
        for (const listener of listeners.current.complete) listener(event);
        return responses;
      } catch (value) {
        const requestError = normalize(value);
        const event = { error: requestError, fileList: filesRef.current };
        for (const listener of listeners.current.error) listener(event);
        for (const listener of listeners.current.complete) listener(event);
        throw requestError;
      } finally {
        setUploading(false);
      }
    },
    [config.mode, handler, replace],
  );

  const successCount = fileList.filter((item) => item.status === 2).length;
  const failCount = fileList.filter((item) => item.status === 3).length;
  const progress =
    config.mode === 'batch' && uploading && batchProgress !== undefined
      ? batchProgress
      : aggregateProgress(fileList);
  const result = useMemo<UploaderResult<TResponse>>(
    () => ({
      abort,
      appendFiles,
      error,
      failCount,
      file: fileList[0],
      fileList,
      onComplete: (callback) => {
        listeners.current.complete.add(callback);
        return resultRef.current;
      },
      onError: (callback) => {
        listeners.current.error.add(callback);
        return resultRef.current;
      },
      onSuccess: (callback) => {
        listeners.current.success.add(callback);
        return resultRef.current;
      },
      progress,
      removeFiles,
      successCount,
      upload,
      uploading,
    }),
    [
      abort,
      appendFiles,
      error,
      failCount,
      fileList,
      progress,
      removeFiles,
      successCount,
      upload,
      uploading,
    ],
  );
  resultRef.current = result;
  return result;
}

export const useUploader = useUploaderImpl as UploaderHook;

function aggregateProgress(files: readonly UploadFile[]): ProgressInfo {
  if (files.length === 0) return { loaded: 0, percent: 0, total: 0 };
  const percent =
    files.reduce(
      (sum, file) => sum + (file.status === 2 ? 1 : file.progress.percent),
      0,
    ) / files.length;
  return { loaded: percent * files.length, percent, total: files.length };
}

function readName(source: UploadSource): string {
  if (
    typeof source === 'object' &&
    !(source instanceof ArrayBuffer) &&
    !(source instanceof Blob) &&
    source.name
  )
    return source.name;
  const uri = readUri(source);
  return uri?.split('/').at(-1)?.split('?')[0] || 'upload';
}

function readType(source: UploadSource): string | undefined {
  if (source instanceof Blob) return source.type || undefined;
  return typeof source === 'object' &&
    !(source instanceof ArrayBuffer) &&
    'type' in source
    ? source.type
    : undefined;
}

function readUri(source: UploadSource): string | undefined {
  if (typeof source === 'string') {
    return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(source) ? source : undefined;
  }
  return typeof source === 'object' &&
    !(source instanceof ArrayBuffer) &&
    !(source instanceof Blob) &&
    'uri' in source
    ? source.uri
    : undefined;
}

function normalize(error: unknown): RequestError {
  return error instanceof RequestError
    ? error
    : new RequestError(
        error instanceof Error ? error.message : 'Upload failed',
        {
          cause: error,
          code: 'UPLOAD_ERROR',
          status: -1,
        },
      );
}
