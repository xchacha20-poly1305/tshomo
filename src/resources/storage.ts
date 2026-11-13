import { json, isJson, type Decoder } from '../decode.js'
import { InputError } from '../errors.js'
import type { RequestOptions } from '../options.js'
import type { JsonValue } from '../types.js'
import type { HttpContext } from '../transport/http.js'
export function storage(context: HttpContext) {
  function getJson(
    key: string,
    decoder?: undefined,
    options?: RequestOptions,
  ): Promise<JsonValue>
  function getJson<T>(
    key: string,
    decoder: Decoder<T>,
    options?: RequestOptions,
  ): Promise<T>
  function getJson<T>(
    key: string,
    decoder?: Decoder<T>,
    options?: RequestOptions,
  ): Promise<T | JsonValue> {
    return context.json(
      'storage.getJson',
      { method: 'GET', path: ['storage', key] },
      (value) => (decoder ? decoder(value) : json(value)),
      options,
    )
  }
  return {
    getBytes: (key: string, options?: RequestOptions) =>
      context.request(
        'storage.getBytes',
        { method: 'GET', path: ['storage', key] },
        (response, signal) => context.readBytes(response, signal),
        options,
      ),
    /** Sends raw bytes without Content-Type. Known kernels require valid JSON. */
    putBytes: (key: string, bytes: Uint8Array, options?: RequestOptions) =>
      context.void(
        'storage.putBytes',
        { method: 'PUT', path: ['storage', key], bytes },
        options,
      ),
    delete: (key: string, options?: RequestOptions) =>
      context.void(
        'storage.delete',
        { method: 'DELETE', path: ['storage', key] },
        options,
      ),
    getJson,
    putJson(key: string, value: JsonValue, options?: RequestOptions) {
      context.check('storage.putJson')
      if (!isJson(value)) {
        throw new InputError('Storage value must be valid JSON')
      }
      return context.void(
        'storage.putJson',
        { method: 'PUT', path: ['storage', key], json: value },
        options,
      )
    },
  }
}
