import {
  AbortError,
  DecodeError,
  NetworkError,
  StreamError,
  TimeoutError,
} from '../errors.js'
import type { HttpContext, RequestSpec } from './http.js'
import type { ConnectionOptions, Feed } from './websocket.js'

/** NDJSON only. Frame limits count wire bytes, including an optional CR. */
export async function readJsonStream(
  context: HttpContext,
  spec: RequestSpec,
  feed: Feed,
  options: ConnectionOptions,
): Promise<void> {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const abort = () => {
    controller.abort()
    void reader?.cancel().catch(() => {})
  }
  const timeout = () => {
    timedOut = true
    abort()
  }
  const idle = () => {
    clearTimeout(timer)
    timer = options.idleTimeoutMs
      ? setTimeout(timeout, options.idleTimeoutMs)
      : undefined
  }
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) {
    abort()
  }
  if (options.connectTimeoutMs) {
    timer = setTimeout(timeout, options.connectTimeoutMs)
  }
  try {
    const response = await context.fetch(spec, controller.signal)
    clearTimeout(timer)
    if (controller.signal.aborted) {
      throw new AbortError()
    }
    if (!response.body) {
      throw new DecodeError('Missing stream body')
    }
    reader = response.body.getReader()
    idle()
    feed.open()
    let parts: Uint8Array[] = []
    let size = 0
    const append = (bytes: Uint8Array) => {
      size += bytes.byteLength
      if (size > options.maxFrameBytes) {
        throw new StreamError('Frame size limit exceeded', false)
      }
      if (bytes.byteLength) {
        parts.push(bytes)
      }
    }
    const emit = () => {
      const frame = new Uint8Array(size)
      let offset = 0
      for (const part of parts) {
        frame.set(part, offset)
        offset += part.byteLength
      }
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(frame)
      } catch {
        throw new DecodeError('Invalid UTF-8 stream frame')
      }
      parts = []
      size = 0
      if (text.trim()) {
        feed.message(text)
      }
    }
    while (!controller.signal.aborted) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch (error) {
        throw new NetworkError(context.safeCause(error))
      }
      if (controller.signal.aborted) {
        throw new AbortError()
      }
      const { value, done } = result
      if (done) {
        if (size) {
          emit()
        }
        break
      }
      idle()
      let start = 0
      for (let index = 0; index < value.byteLength; index++) {
        if (value[index] === 10) {
          append(value.subarray(start, index))
          emit()
          start = index + 1
        }
      }
      append(value.subarray(start))
    }
    if (controller.signal.aborted) {
      throw new AbortError()
    }
  } catch (error) {
    if (timedOut) {
      throw new TimeoutError()
    }
    if (options.signal.aborted) {
      throw new AbortError()
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', abort)
    controller.abort()
    if (reader) {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
