import {
  AbortError,
  DecodeError,
  StreamError,
  TimeoutError,
  UnsupportedTransportError,
} from '../errors.js'
import type { WebSocketFactory } from '../options.js'

export interface Feed {
  open(): void
  message(text: string): void
}
export interface ConnectionOptions {
  signal: AbortSignal
  connectTimeoutMs: number
  idleTimeoutMs: number
  maxFrameBytes: number
}
export function readWebSocket(
  factory: WebSocketFactory | undefined,
  url: string,
  feed: Feed,
  options: ConnectionOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new AbortError())
      return
    }
    if (!factory && typeof globalThis.WebSocket === 'undefined') {
      reject(new UnsupportedTransportError())
      return
    }
    let socket: ReturnType<WebSocketFactory>
    try {
      socket = factory ? factory(url) : new globalThis.WebSocket(url)
    } catch {
      reject(new StreamError())
      return
    }
    let done = false
    let opened = false
    let connectTimer: ReturnType<typeof setTimeout> | undefined
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      clearTimeout(connectTimer)
      clearTimeout(idleTimer)
      options.signal.removeEventListener('abort', abort)
      socket.removeEventListener('open', open)
      socket.removeEventListener('message', message)
      socket.removeEventListener('error', error)
      socket.removeEventListener('close', close)
      // Closing a CONNECTING socket can throw in third-party adapters.
      try {
        socket.close()
      } catch {
        /* the handle is already detached */
      }
    }
    function finish(error?: unknown) {
      if (done) {
        return
      }
      done = true
      cleanup()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    function idle() {
      clearTimeout(idleTimer)
      if (options.idleTimeoutMs) {
        idleTimer = setTimeout(
          () => finish(new TimeoutError()),
          options.idleTimeoutMs,
        )
      }
    }
    function open() {
      if (done || opened) {
        return
      }
      opened = true
      clearTimeout(connectTimer)
      idle()
      feed.open()
    }
    function message(event: { readonly data: unknown }) {
      if (done) {
        return
      }
      if (!opened) {
        finish(new StreamError('Message received before socket opened', false))
        return
      }
      if (typeof event.data !== 'string') {
        finish(new DecodeError('Binary WebSocket messages are unsupported'))
        return
      }
      if (
        new TextEncoder().encode(event.data).byteLength > options.maxFrameBytes
      ) {
        finish(new StreamError('Frame size limit exceeded', false))
        return
      }
      idle()
      try {
        feed.message(event.data)
      } catch (error) {
        finish(error)
      }
    }
    function error() {
      finish(new StreamError())
    }
    function close(event: { readonly code: number }) {
      finish(event.code === 1000 ? undefined : new StreamError())
    }
    function abort() {
      finish(new AbortError())
    }
    socket.addEventListener('open', open)
    socket.addEventListener('message', message)
    socket.addEventListener('error', error)
    socket.addEventListener('close', close)
    options.signal.addEventListener('abort', abort, { once: true })
    if (options.connectTimeoutMs) {
      connectTimer = setTimeout(
        () => finish(new TimeoutError()),
        options.connectTimeoutMs,
      )
    }
    if (options.signal.aborted) {
      abort()
    } else if (socket.readyState === 1) {
      open()
    } else if (socket.readyState > 1) {
      finish(new StreamError())
    }
  })
}
