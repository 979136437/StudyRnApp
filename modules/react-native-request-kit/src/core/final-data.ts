const FINAL_DATA = Symbol('react-native-request-kit.final-data');

export type FinalData<T> = {
  readonly [FINAL_DATA]: true;
  readonly value: T;
};

export function finalData<T>(value: T): FinalData<T> {
  return { [FINAL_DATA]: true, value };
}

export function isFinalData(value: unknown): value is FinalData<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    FINAL_DATA in value &&
    value[FINAL_DATA] === true
  );
}
