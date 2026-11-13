import { isJson, type Decoder } from './decode.js'
import { InputError } from './errors.js'
import type { RequestOptions } from './options.js'
import type { HttpContext } from './transport/http.js'
import type { JsonValue } from './types.js'

/** Paths are raw segments relative to the client's base URL. */
export type ExtensionRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  path: readonly string[]
  query?: Readonly<Record<string, string | number | boolean | undefined>>
} & ({ json?: JsonValue; bytes?: never } | { json?: never; bytes?: Uint8Array })

/** A restricted transport sharing the owning client's settings and lifecycle. */
export interface ExtensionTransport {
  json<T>(
    request: ExtensionRequest,
    decoder: Decoder<T>,
    options?: RequestOptions,
  ): Promise<T>
  bytes(
    request: ExtensionRequest,
    options?: RequestOptions,
  ): Promise<Uint8Array>
  void(request: ExtensionRequest, options?: RequestOptions): Promise<void>
}

export type ExtensionFactory<T> = (transport: ExtensionTransport) => T

export function extensionTransport(context: HttpContext): ExtensionTransport {
  function validate(request: ExtensionRequest): void {
    if (
      !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
        request.method,
      )
    ) {
      throw new InputError('Invalid extension request method')
    }
    if (request.json !== undefined && request.bytes !== undefined) {
      throw new InputError(
        'Extension requests cannot contain both JSON and bytes',
      )
    }
    if (request.json !== undefined && !isJson(request.json)) {
      throw new InputError('Extension request body must be valid JSON')
    }
    if (request.bytes !== undefined && !(request.bytes instanceof Uint8Array)) {
      throw new InputError('Extension request bytes must be a Uint8Array')
    }
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      (request.json !== undefined || request.bytes !== undefined)
    ) {
      throw new InputError('GET and HEAD requests cannot contain a body')
    }
  }
  return Object.freeze({
    json<T>(
      request: ExtensionRequest,
      decoder: Decoder<T>,
      options?: RequestOptions,
    ) {
      validate(request)
      return context.json(undefined, request, decoder, options)
    },
    bytes(request: ExtensionRequest, options?: RequestOptions) {
      validate(request)
      return context.request(
        undefined,
        request,
        (response, signal) => context.readBytes(response, signal),
        options,
      )
    },
    void(request: ExtensionRequest, options?: RequestOptions) {
      validate(request)
      return context.void(undefined, request, options)
    },
  })
}
