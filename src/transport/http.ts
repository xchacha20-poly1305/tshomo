import {
  AbortError,
  ClashError,
  ClientDisposedError,
  DecodeError,
  HttpError,
  InputError,
  NetworkError,
  OperationError,
  TimeoutError,
  UnsupportedCapabilityError,
} from '../errors.js'
import { object, parseJson, type Decoder } from '../decode.js'
import type {
  Capability,
  ClashClientOptions,
  RequestOptions,
} from '../options.js'
import { baseUrl, duration, endpoint, type Query } from './url.js'

export interface RequestSpec {
  method: string
  path: string[]
  query?: Query
  json?: unknown
  bytes?: Uint8Array
}
export interface Scope {
  signal: AbortSignal
  error(): ClashError | undefined
  finish(): void
}
export class HttpContext {
  readonly base: URL
  readonly secret: string | undefined
  readonly timeoutMs: number
  private readonly fetcher: typeof globalThis.fetch
  private readonly capabilities: ClashClientOptions['capabilities']
  private disposed = false
  private readonly cleanups = new Set<() => void>()
  constructor(options: ClashClientOptions) {
    this.base = baseUrl(options.baseUrl)
    if (options.secret !== undefined && typeof options.secret !== 'string') {
      throw new InputError('secret must be a string')
    }
    try {
      if (options.secret) {
        new Headers({ Authorization: `Bearer ${options.secret}` })
      }
    } catch {
      throw new InputError('secret is not a valid header value')
    }
    this.secret = options.secret
    this.timeoutMs = duration(
      options.requestTimeoutMs ?? 15000,
      'requestTimeoutMs',
    )
    this.fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis)
    if (!this.fetcher) {
      throw new InputError('Fetch is unavailable; provide options.fetch')
    }
    this.capabilities = { ...options.capabilities }
  }
  check(capability: Capability): void {
    if (this.disposed) {
      throw new ClientDisposedError()
    }
    if (this.capabilities?.[capability] === 'unsupported') {
      throw new UnsupportedCapabilityError(capability)
    }
  }
  own(cleanup: () => void): () => void {
    if (this.disposed) {
      throw new ClientDisposedError()
    }
    this.cleanups.add(cleanup)
    return () => {
      this.cleanups.delete(cleanup)
    }
  }
  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const cleanup of [...this.cleanups]) {
      cleanup()
    }
    this.cleanups.clear()
  }
  redact(text: string): string {
    // Opaque server strings can contain arbitrarily transformed credentials.
    // With credentials present expose no server-controlled text at all.
    if (
      this.secret ||
      text.toLowerCase().includes('authorization') ||
      text.toLowerCase().includes('token=')
    ) {
      return '[server detail omitted]'
    }
    return text.slice(0, 512).split('\n').join(' ').split('\r').join(' ')
  }
  safeCause(value: unknown): unknown {
    if (value instanceof Error) {
      return new Error(this.redact(value.message))
    }
    if (typeof value === 'string') {
      return this.redact(value)
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return value
    }
    return undefined
  }
  cancellation(reason: unknown): AbortError {
    return new AbortError(this.safeCause(reason))
  }
  safeResult(value: Record<string, unknown>): Record<string, unknown> {
    // Only the known business discriminator is safe to expose.
    return { status: value.status === 'ok' ? 'ok' : 'unsuccessful' }
  }
  scope(signal: AbortSignal | undefined, timeoutMs: number): Scope {
    duration(timeoutMs, 'timeoutMs')
    const controller = new AbortController()
    const startedAt = performance.now()
    let reason: ClashError | undefined
    const abort = (error: ClashError) => {
      if (!controller.signal.aborted) {
        reason = error
        controller.abort(error)
      }
    }
    const callerAbort = () => abort(this.cancellation(signal?.reason))
    const unown = this.own(() => abort(new ClientDisposedError()))
    signal?.addEventListener('abort', callerAbort, { once: true })
    if (signal?.aborted) {
      callerAbort()
    }
    const timer = timeoutMs
      ? setTimeout(() => abort(new TimeoutError()), timeoutMs)
      : undefined
    return {
      signal: controller.signal,
      error: () => {
        if (timeoutMs && performance.now() - startedAt >= timeoutMs) {
          abort(new TimeoutError())
        }
        return reason
      },
      finish: () => {
        unown()
        signal?.removeEventListener('abort', callerAbort)
        clearTimeout(timer)
      },
    }
  }
  async fetch(spec: RequestSpec, signal: AbortSignal): Promise<Response> {
    if (signal.aborted) {
      throw new AbortError()
    }
    const headers = new Headers()
    if (this.secret) {
      headers.set('Authorization', `Bearer ${this.secret}`)
    }
    let body: BodyInit | undefined
    if (spec.json !== undefined) {
      headers.set('Content-Type', 'application/json')
      try {
        body = JSON.stringify(spec.json)
      } catch {
        throw new InputError('Request body is not JSON serializable')
      }
    } else if (spec.bytes !== undefined) {
      body = new Blob([new Uint8Array(spec.bytes)])
    }
    const url = endpoint(this.base, spec.path, spec.query)
    let response: Response
    try {
      response = await this.fetcher(url, {
        method: spec.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal,
        credentials: 'omit',
        redirect: 'error',
      })
    } catch (error) {
      throw new NetworkError(this.safeCause(error))
    }
    if (!response.ok) {
      const detail = new TextDecoder().decode(
        await this.readBytes(response, signal, 8192),
      )
      let message = detail
      try {
        const data = parseJson(detail)
        if (object(data) && typeof data.message === 'string') {
          message = data.message
        }
      } catch {
        /* text/HTML remains a bounded summary */
      }
      throw new HttpError(
        spec.method,
        spec.path[0] ?? 'root',
        response.status,
        this.redact(message),
      )
    }
    return response
  }
  async readBytes(
    response: Response,
    signal: AbortSignal,
    limit = Infinity,
  ): Promise<Uint8Array> {
    if (!response.body) {
      return new Uint8Array()
    }
    const reader = response.body.getReader()
    const abort = () => {
      void reader.cancel().catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    }
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (length < limit) {
        let result: ReadableStreamReadResult<Uint8Array>
        try {
          result = await reader.read()
        } catch (error) {
          throw new NetworkError(this.safeCause(error))
        }
        if (signal.aborted) {
          throw new AbortError()
        }
        if (result.done) {
          break
        }
        const chunk = result.value.subarray(0, limit - length)
        chunks.push(chunk)
        length += chunk.byteLength
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return bytes
    } finally {
      signal.removeEventListener('abort', abort)
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  async request<T>(
    capability: Capability,
    spec: RequestSpec,
    decode: (response: Response, signal: AbortSignal) => Promise<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    this.check(capability)
    // Build and validate before acquiring timers or issuing I/O.
    endpoint(this.base, spec.path, spec.query)
    const scope = this.scope(
      options.signal,
      options.timeoutMs ?? this.timeoutMs,
    )
    try {
      if (scope.signal.aborted) {
        throw scope.error()
      }
      const response = await this.fetch(spec, scope.signal)
      try {
        const value = await decode(response, scope.signal)
        if (scope.error()) {
          throw scope.error()
        }
        return value
      } finally {
        await response.body?.cancel().catch(() => {})
      }
    } catch (error) {
      if (scope.error()) {
        throw scope.error()
      }
      if (error instanceof ClashError) {
        throw error
      }
      throw new NetworkError(this.safeCause(error))
    } finally {
      scope.finish()
    }
  }
  json<T>(
    capability: Capability,
    spec: RequestSpec,
    decode: Decoder<T>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request(
      capability,
      spec,
      async (response, signal) => {
        const value = parseJson(
          new TextDecoder().decode(await this.readBytes(response, signal)),
        )
        try {
          return decode(value)
        } catch (error) {
          if (error instanceof ClashError) {
            throw error
          }
          throw new DecodeError('Response decoder failed')
        }
      },
      options,
    )
  }
  void(
    capability: Capability,
    spec: RequestSpec,
    options?: RequestOptions,
  ): Promise<void> {
    return this.request(
      capability,
      spec,
      async (response) => {
        await response.body?.cancel()
      },
      options,
    )
  }
  operation<T extends Record<string, unknown> & { status: string }>(
    capability: Capability,
    spec: RequestSpec,
    decode: Decoder<T>,
    options?: RequestOptions,
  ): Promise<T> {
    return this.json(
      capability,
      spec,
      (value) => {
        const result = decode(value)
        if (result.status !== 'ok') {
          throw new OperationError(this.safeResult(result))
        }
        return result
      },
      options,
    )
  }
}
