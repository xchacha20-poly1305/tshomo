import {
  BufferOverflowError,
  ClashError,
  DecodeError,
  HttpError,
  InputError,
  NetworkError,
  StreamError,
  TimeoutError,
} from '../errors.js'
import { parseJson, type Decoder } from '../decode.js'
import type {
  Capability,
  ClashStream,
  StreamOptions,
  StreamState,
  WebSocketFactory,
} from '../options.js'
import type { HttpContext } from './http.js'
import { duration, endpoint, websocketUrl, type Query } from './url.js'
import { readWebSocket } from './websocket.js'
import { readJsonStream } from './json-stream.js'

function retryable(error: unknown): boolean {
  return (
    (error instanceof StreamError && error.recoverable) ||
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    (error instanceof HttpError && error.status >= 500)
  )
}

export function watch<T>(
  context: HttpContext,
  factory: WebSocketFactory | undefined,
  capability: Capability,
  path: string[],
  query: Query,
  decode: Decoder<T>,
  logs: boolean,
  options: StreamOptions = {},
): ClashStream<T> {
  context.check(capability)
  options = {
    ...options,
    ...(options.reconnect ? { reconnect: { ...options.reconnect } } : {}),
  }
  const url = endpoint(context.base, path, query)
  const connectTimeoutMs = duration(
    options.connectTimeoutMs ?? 10000,
    'connectTimeoutMs',
  )
  const idleTimeoutMs = duration(options.idleTimeoutMs ?? 0, 'idleTimeoutMs')
  const maxFrameBytes = duration(
    options.maxFrameBytes ?? 16 * 1024 * 1024,
    'maxFrameBytes',
    false,
  )
  if (
    options.transport !== undefined &&
    options.transport !== 'websocket' &&
    options.transport !== 'http-json'
  ) {
    throw new InputError('Invalid stream transport')
  }
  const reconnect = options.reconnect
  if (reconnect) {
    duration(reconnect.maxAttempts, 'maxAttempts')
    duration(reconnect.initialDelayMs ?? 500, 'initialDelayMs')
    duration(reconnect.maxDelayMs ?? 30000, 'maxDelayMs')
  }
  let state: StreamState = 'idle'
  let terminal = false
  let claimed = false
  let started = false
  let failure: unknown
  let queue: T[] = []
  let pending:
    | {
        resolve: (value: IteratorResult<T>) => void
        reject: (error: unknown) => void
      }
    | undefined
  let connection: AbortController | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let wakeRetry: (() => void) | undefined
  let openedAt: number | undefined
  const change = (next: StreamState) => {
    state = next
    try {
      options.onStateChange?.(next)
    } catch {
      /* state observers do not own lifecycle */
    }
  }
  const unown = context.own(() => stop())

  function stop(error?: unknown, drain = false) {
    if (terminal) {
      if (!drain) {
        queue = []
      }
      return
    }
    terminal = true
    failure = error
    connection?.abort()
    clearTimeout(retryTimer)
    wakeRetry?.()
    options.signal?.removeEventListener('abort', abort)
    unown()
    if (!drain || error) {
      queue = []
    }
    change(error ? 'failed' : 'closed')
    if (pending) {
      const waiter = pending
      pending = undefined
      if (error) {
        waiter.reject(error)
      } else {
        waiter.resolve({ done: true, value: undefined })
      }
    }
  }

  function abort() {
    stop(context.cancellation(options.signal?.reason))
  }

  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) {
    abort()
  }

  function push(value: T) {
    if (terminal) {
      return
    }
    if (pending) {
      const waiter = pending
      pending = undefined
      waiter.resolve({ done: false, value })
      return
    }
    if (!logs) {
      queue = [value]
    } else if (queue.length >= 256) {
      stop(new BufferOverflowError())
    } else {
      queue.push(value)
    }
  }

  async function run() {
    let attempts = 0
    while (!terminal) {
      openedAt = undefined
      connection = new AbortController()
      change(attempts ? 'reconnecting' : 'connecting')
      if (terminal) {
        return
      }
      try {
        const feed = {
          open: () => {
            if (!terminal) {
              openedAt = performance.now()
              change('open')
            }
          },
          message: (text: string) => {
            if (terminal) {
              return
            }
            push(decode(parseJson(text)))
          },
        }
        const connectionOptions = {
          signal: connection.signal,
          connectTimeoutMs,
          idleTimeoutMs,
          maxFrameBytes,
        }
        if (options.transport === 'http-json') {
          await readJsonStream(
            context,
            { method: 'GET', path, query },
            feed,
            connectionOptions,
          )
        } else {
          await readWebSocket(
            factory,
            websocketUrl(url, context.secret),
            feed,
            connectionOptions,
          )
        }
        if (!terminal) {
          stop(undefined, true)
        }
      } catch (error) {
        if (terminal) {
          return
        }
        if (openedAt !== undefined && performance.now() - openedAt >= 30000) {
          attempts = 0
        }
        if (
          !reconnect ||
          !retryable(error) ||
          attempts >= reconnect.maxAttempts
        ) {
          stop(
            error instanceof ClashError
              ? error
              : new DecodeError('Stream decoder failed'),
          )
          return
        }
        const delay = Math.min(
          reconnect.maxDelayMs ?? 30000,
          (reconnect.initialDelayMs ?? 500) * 2 ** Math.min(attempts, 30),
        )
        attempts++
        change('reconnecting')
        if (terminal) {
          return
        }
        await new Promise<void>((resolve) => {
          wakeRetry = resolve
          retryTimer = setTimeout(
            resolve,
            Math.min(
              2_147_483_647,
              Math.min(
                reconnect.maxDelayMs ?? 30000,
                delay * (0.8 + Math.random() * 0.4),
              ),
            ),
          )
        })
        wakeRetry = undefined
        retryTimer = undefined
      }
    }
  }

  return {
    get state() {
      return state
    },
    close: () => stop(),
    [Symbol.asyncIterator]() {
      if (claimed) {
        throw new InputError('Streams support only one consumer')
      }
      claimed = true
      return {
        next(): Promise<IteratorResult<T>> {
          if (pending) {
            return Promise.reject(
              new InputError('Concurrent next() calls are unsupported'),
            )
          }
          if (queue.length) {
            const value = queue.shift()
            if (value !== undefined) {
              return Promise.resolve({ done: false, value })
            }
          }
          if (terminal) {
            return failure
              ? Promise.reject(failure)
              : Promise.resolve({ done: true, value: undefined })
          }
          const next = new Promise<IteratorResult<T>>((resolve, reject) => {
            pending = { resolve, reject }
          })
          if (!started) {
            started = true
            void run().catch(() => stop(new StreamError()))
          }
          return next
        },
        return(): Promise<IteratorResult<T>> {
          stop()
          return Promise.resolve({ done: true, value: undefined })
        },
        throw(error?: unknown): Promise<IteratorResult<T>> {
          stop()
          return Promise.reject(error)
        },
      }
    },
  }
}
