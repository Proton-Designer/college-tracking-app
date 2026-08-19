export type DataErrorCode = 'not_found' | 'conflict' | 'validation' | 'network_error' | 'unknown';

export interface DataError {
  code: DataErrorCode;
  message: string;
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: DataError };

// @barrel-internal -- result-constructor helper used by every data/ and day/ module, never called directly by a consumer.
export function dataOk<T>(data: T): DataResult<T> {
  return { ok: true, data };
}

// @barrel-internal -- result-constructor helper used by every data/ and day/ module, never called directly by a consumer.
export function dataErr(error: DataError): DataResult<never> {
  return { ok: false, error };
}
