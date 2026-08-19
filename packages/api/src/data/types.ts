export type DataErrorCode = 'not_found' | 'conflict' | 'validation' | 'network_error' | 'unknown';

export interface DataError {
  code: DataErrorCode;
  message: string;
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: DataError };

export function dataOk<T>(data: T): DataResult<T> {
  return { ok: true, data };
}

export function dataErr(error: DataError): DataResult<never> {
  return { ok: false, error };
}
