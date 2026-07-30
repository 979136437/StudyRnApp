import * as core from 'react-native-request-kit';
import {
  createAxiosRequestAdapter,
  createFetchRequestAdapter,
  createKyRequestAdapter,
} from 'react-native-request-kit/adapter';
import { createFetchRequestAdapter as createFetchFromEntry } from 'react-native-request-kit/adapter/fetch';
import {
  createAsyncStoragePersister,
  invalidateCache,
} from 'react-native-request-kit/cache';
import {
  RequestProvider,
  usePagination,
  useRequest,
} from 'react-native-request-kit/react';
import {
  createClientTokenAuthentication,
  useAutoRequest,
  useCaptcha,
  useRetriableRequest,
  useUploader,
} from 'react-native-request-kit/strategy';
import { describe, expect, it } from 'vitest';

describe('package exports', () => {
  it('resolves every public subpath', () => {
    const publicExports = [
      createAxiosRequestAdapter,
      createFetchRequestAdapter,
      createKyRequestAdapter,
      createFetchFromEntry,
      createAsyncStoragePersister,
      invalidateCache,
      useRequest,
      usePagination,
      RequestProvider,
      useAutoRequest,
      createClientTokenAuthentication,
      useCaptcha,
      useRetriableRequest,
      useUploader,
    ];

    expect(publicExports.every((value) => value !== undefined)).toBe(true);
  });

  it('keeps optional runtime APIs out of the root entry', () => {
    expect(core).not.toHaveProperty('createAxiosRequestAdapter');
    expect(core).not.toHaveProperty('createKyRequestAdapter');
    expect(core).not.toHaveProperty('RequestProvider');
    expect(core).not.toHaveProperty('createAsyncStoragePersister');
    expect(core).not.toHaveProperty('useAutoRequest');
  });
});
