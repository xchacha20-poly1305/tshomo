import { it, expect, vi, afterEach } from 'vitest'
import {
  createClashClient,
  AbortError,
  BufferOverflowError,
  DecodeError,
  InputError,
  StreamError,
  TimeoutError,
  type ClashSocket,
  type SocketEvents,
  type WebSocketFactory,
} from '../src/index.js'

class FakeSocket implements ClashSocket {
  readyState = 0
  closed = 0
  private listeners = new Map<string, Set<(event: never) => void>>()
  addEventListener<K extends keyof SocketEvents>(
    type: K,
    listener: (event: SocketEvents[K]) => void,
  ) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener as (event: never) => void)
  }
  removeEventListener<K extends keyof SocketEvents>(
    type: K,
    listener: (event: SocketEvents[K]) => void,
  ) {
    this.listeners.get(type)?.delete(listener as (event: never) => void)
  }
  emit<K extends keyof SocketEvents>(type: K, value: SocketEvents[K]) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(value as never)
    }
  }
  open() {
    this.readyState = 1
    this.emit('open', {})
  }
  text(value: unknown) {
    this.emit('message', { data: JSON.stringify(value) })
  }
  close() {
    this.readyState = 3
    this.closed++
  }
  count() {
    return [...this.listeners.values()].reduce(
      (count, set) => count + set.size,
      0,
    )
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const urls: string[] = []
  const factory: WebSocketFactory = (url) => {
    urls.push(url)
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  }
  const client = createClashClient({
    baseUrl: 'https://example.invalid/controller/',
    secret: 'test-secret',
    webSocketFactory: factory,
  })
  const socket = () => {
    const socket = sockets.at(-1)
    if (!socket) {
      throw new Error('No socket')
    }
    return socket
  }
  return { client, sockets, urls, socket }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('connects lazily, encodes WS auth/query, enforces one consumer and cleans on break', async () => {
  const { client, sockets, urls, socket } = setup()
  const stream = client.connections.watch({ intervalMs: 1000 })
  expect(stream.state).toBe('idle')
  expect(sockets).toHaveLength(0)
  const iterator = stream[Symbol.asyncIterator]()
  expect(() => stream[Symbol.asyncIterator]()).toThrow(InputError)
  const waiting = iterator.next()
  expect(urls[0]).toBe(
    'wss://example.invalid/controller/connections?interval=1000&token=test-secret',
  )
  socket().open()
  socket().text({ downloadTotal: 0, uploadTotal: 0, connections: null })
  expect((await waiting).done).toBe(false)
  await iterator.return?.()
  expect(socket().count()).toBe(0)
  expect(socket().closed).toBe(1)
  socket().text({ downloadTotal: 1, uploadTotal: 1, connections: null })
  expect((await iterator.next()).done).toBe(true)
  client.dispose()
})
it('keeps latest snapshots, preserves log order and fails on log overflow', async () => {
  const { client, socket } = setup()
  const stream = client.metrics.watchTraffic()
  const iterator = stream[Symbol.asyncIterator]()
  const first = iterator.next()
  socket().open()
  socket().text({ up: 1, down: 1 })
  await first
  for (let i = 2; i <= 500; i++) {
    socket().text({ up: i, down: i })
  }
  expect((await iterator.next()).value).toEqual({ up: 500, down: 500 })
  stream.close()
  const logs = client.logs.watch()
  const logIterator = logs[Symbol.asyncIterator]()
  const logFirst = logIterator.next()
  socket().open()
  socket().text({ type: 'info', payload: 'first' })
  await logFirst
  socket().text({ type: 'info', payload: 'second' })
  socket().text({ type: 'info', payload: 'third' })
  expect((await logIterator.next()).value.payload).toBe('second')
  expect((await logIterator.next()).value.payload).toBe('third')
  for (let i = 0; i < 257; i++) {
    socket().text({ type: 'info', payload: String(i) })
  }
  await expect(logIterator.next()).rejects.toBeInstanceOf(BufferOverflowError)
  expect(socket().count()).toBe(0)
  client.dispose()
})
it('distinguishes caller abort from close and dispose, including idle handles', async () => {
  for (const action of ['close', 'dispose', 'abort']) {
    const { client, socket } = setup()
    const controller = new AbortController()
    const stream = client.metrics.watchMemory({ signal: controller.signal })
    const iterator = stream[Symbol.asyncIterator]()
    const pending = iterator.next()
    if (action === 'close') {
      stream.close()
    } else if (action === 'dispose') {
      client.dispose()
    } else {
      controller.abort('sensitive reason')
    }
    if (action === 'abort') {
      await expect(pending).rejects.toBeInstanceOf(AbortError)
    } else {
      expect((await pending).done).toBe(true)
    }
    expect(socket().count()).toBe(0)
    expect(stream.state).toBe(action === 'abort' ? 'failed' : 'closed')
    client.dispose()
  }
  const { client, sockets } = setup()
  const stream = client.metrics.watchMemory({ signal: AbortSignal.abort() })
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
    AbortError,
  )
  expect(sockets).toHaveLength(0)
  client.dispose()
})
it('fails invalid JSON, invalid structure, binary messages and oversized frames without retry', async () => {
  for (const data of ['{bad', '{}', new Uint8Array([1]), 'x'.repeat(65)]) {
    const { client, socket, sockets } = setup()
    const stream = client.metrics.watchTraffic({
      maxFrameBytes: 64,
      reconnect: { maxAttempts: 2 },
    })
    const iterator = stream[Symbol.asyncIterator]()
    const pending = iterator.next()
    socket().open()
    socket().emit('message', { data })
    await expect(pending).rejects.toBeInstanceOf(
      data === 'x'.repeat(65) ? StreamError : DecodeError,
    )
    expect(sockets).toHaveLength(1)
    expect(socket().count()).toBe(0)
    client.dispose()
  }
})
it('uses bounded backoff, stops retry on abort, and does not reset budget on short opens', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const { client, socket, sockets } = setup()
  const controller = new AbortController()
  const stream = client.metrics.watchTraffic({
    signal: controller.signal,
    reconnect: { maxAttempts: 2, initialDelayMs: 100, maxDelayMs: 150 },
  })
  const pending = stream[Symbol.asyncIterator]().next()
  const rejection = expect(pending).rejects.toBeInstanceOf(StreamError)
  socket().open()
  socket().emit('close', { code: 1006 })
  await vi.advanceTimersByTimeAsync(99)
  expect(sockets).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(sockets).toHaveLength(2)
  socket().open()
  socket().emit('close', { code: 1006 })
  await vi.advanceTimersByTimeAsync(150)
  expect(sockets).toHaveLength(3)
  socket().open()
  socket().emit('close', { code: 1006 })
  await rejection
  expect(vi.getTimerCount()).toBe(0)
  client.dispose()
  const next = setup()
  const updates = next.client.metrics.watchTraffic({
    signal: controller.signal,
    reconnect: { maxAttempts: 8 },
  })
  const waiting = updates[Symbol.asyncIterator]().next()
  const cancelled = expect(waiting).rejects.toBeInstanceOf(AbortError)
  next.socket().emit('error', {})
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  await cancelled
  await vi.advanceTimersByTimeAsync(100000)
  expect(next.sockets).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
  next.client.dispose()
})
it('does not reconnect normal closure and observer errors cannot interrupt cleanup', async () => {
  const { client, socket, sockets } = setup()
  const stream = client.logs.watch({
    reconnect: { maxAttempts: 3 },
    onStateChange() {
      throw new Error('observer')
    },
  })
  const iterator = stream[Symbol.asyncIterator]()
  const waiting = iterator.next()
  socket().open()
  socket().emit('close', { code: 1000 })
  expect((await waiting).done).toBe(true)
  expect(stream.state).toBe('closed')
  expect(socket().count()).toBe(0)
  expect(sockets).toHaveLength(1)
  client.dispose()
})
it('enforces connect, idle and first-sample timeouts with no leaked timers', async () => {
  vi.useFakeTimers()
  const first = setup()
  const stream = first.client.metrics.watchTraffic({ connectTimeoutMs: 10 })
  const waiting = stream[Symbol.asyncIterator]().next()
  const timed = expect(waiting).rejects.toBeInstanceOf(TimeoutError)
  await vi.advanceTimersByTimeAsync(10)
  await timed
  first.client.dispose()
  const second = setup()
  const idle = second.client.metrics.watchTraffic({ idleTimeoutMs: 10 })
  const idleWaiting = idle[Symbol.asyncIterator]().next()
  const idleTimed = expect(idleWaiting).rejects.toBeInstanceOf(TimeoutError)
  second.socket().open()
  await vi.advanceTimersByTimeAsync(10)
  await idleTimed
  second.client.dispose()
  const third = setup()
  const sample = third.client.metrics.memorySample({
    timeoutMs: 10,
    connectTimeoutMs: 0,
  })
  const sampleTimed = expect(sample).rejects.toBeInstanceOf(TimeoutError)
  third.socket().open()
  await vi.advanceTimersByTimeAsync(10)
  await sampleTimed
  expect(third.socket().count()).toBe(0)
  third.client.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it('retries HTTP body read failures and cleans the new reader on close', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  let reads = 0
  let cancelled = false
  const client = createClashClient({
    baseUrl: 'http://local/',
    fetch: async () => {
      reads++
      if (reads === 1) {
        return new Response(
          new ReadableStream({
            start(c) {
              c.error(new TypeError('connection reset'))
            },
          }),
        )
      }
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"up":1,"down":2}\n'))
          },
          cancel() {
            cancelled = true
          },
        }),
      )
    },
  })
  const stream = client.metrics.watchTraffic({
    transport: 'http-json',
    reconnect: { maxAttempts: 1, initialDelayMs: 10 },
  })
  const pending = stream[Symbol.asyncIterator]().next()
  await vi.advanceTimersByTimeAsync(10)
  expect((await pending).value).toEqual({ up: 1, down: 2 })
  expect(reads).toBe(2)
  stream.close()
  await vi.advanceTimersByTimeAsync(0)
  expect(cancelled).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  client.dispose()
})
it('only resets retry budget after 30 seconds open and snapshots caller options', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const { client, socket, sockets } = setup()
  const options = { reconnect: { maxAttempts: 1, initialDelayMs: 10 } }
  const stream = client.metrics.watchTraffic(options)
  const pending = stream[Symbol.asyncIterator]().next()
  const rejected = expect(pending).rejects.toBeInstanceOf(StreamError)
  options.reconnect.maxAttempts = 0
  socket().emit('error', {})
  await vi.advanceTimersByTimeAsync(10)
  expect(sockets).toHaveLength(2)
  socket().open()
  await vi.advanceTimersByTimeAsync(30000)
  socket().emit('close', { code: 1006 })
  await vi.advanceTimersByTimeAsync(10)
  expect(sockets).toHaveLength(3)
  socket().open()
  socket().emit('error', {})
  await rejected
  expect(vi.getTimerCount()).toBe(0)
  client.dispose()
})
