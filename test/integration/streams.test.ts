import { it, expect } from 'vitest'
import {
  createClashClient,
  AbortError,
  DecodeError,
  StreamError,
  TimeoutError,
} from '../../src/index.js'
import { localServer } from './server.js'
import { once } from 'node:events'

it('receives fragmented WebSocket text and releases the real connection after first sample', async () => {
  const service = await localServer()
  let seenUrl: string | undefined
  const closed = new Promise<void>((resolve) =>
    service.wss.on('connection', (socket, request) => {
      seenUrl = request.url
      socket.on('close', () => resolve())
      socket.send('{"up":', { fin: false })
      socket.send('3,"down":4}', { fin: true })
    }),
  )
  const client = createClashClient({
    baseUrl: service.baseUrl,
    secret: 'sample-token',
  })
  try {
    expect(await client.metrics.trafficSample()).toEqual({ up: 3, down: 4 })
    await closed
    expect(seenUrl).toBe('/controller/traffic?token=sample-token')
  } finally {
    client.dispose()
    await service.close()
  }
})
it('HTTP JSON handles split UTF-8, CRLF, blanks and final non-newline record', async () => {
  const chunks = [
    Buffer.from(' \r\n{"type":"info","payload":"'),
    Buffer.from('中文'),
    Buffer.from('"}\r\n{"type":"debug","payload":"last"}'),
  ]
  const service = await localServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    for (const chunk of chunks) {
      for (const byte of chunk) {
        response.write(Buffer.from([byte]))
      }
    }
    response.end()
  })
  const client = createClashClient({ baseUrl: service.baseUrl })
  try {
    const values = []
    for await (const value of client.logs.watch({ transport: 'http-json' })) {
      values.push(value)
    }
    expect(values).toEqual([
      { type: 'info', payload: '中文' },
      { type: 'debug', payload: 'last' },
    ])
  } finally {
    client.dispose()
    await service.close()
  }
})
it('HTTP first-sample and break cancel readers instead of waiting for EOF', async () => {
  const service = await localServer((_request, response) => {
    response.writeHead(200)
    response.write('{"inuse":12,"oslimit":100}\n')
  })
  const client = createClashClient({ baseUrl: service.baseUrl })
  try {
    expect(
      await client.metrics.memorySample({ transport: 'http-json' }),
    ).toEqual({ inuse: 12, oslimit: 100 })
    const disconnected = new Promise<void>((resolve) =>
      service.server.once('request', (_request, response) =>
        response.once('close', resolve),
      ),
    )
    for await (const value of client.metrics.watchMemory({
      transport: 'http-json',
    })) {
      expect(value.inuse).toBe(12)
      break
    }
    await disconnected
  } finally {
    client.dispose()
    await service.close()
  }
})
it('HTTP streams enforce frame limits, structure and malformed UTF-8', async () => {
  for (const [body, error] of [
    ['{bad}\n', DecodeError],
    ['{}\n', DecodeError],
    ['x'.repeat(33), StreamError],
    [Buffer.from([0xff, 10]), DecodeError],
  ] as const) {
    const client = createClashClient({
      baseUrl: 'http://local/',
      fetch: async () => new Response(body),
    })
    const stream = client.metrics.watchTraffic({
      transport: 'http-json',
      maxFrameBytes: 32,
    })
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      error,
    )
    client.dispose()
  }
})
it('HTTP subscriptions abort while waiting for headers and do not retry authentication failures', async () => {
  let requests = 0
  const service = await localServer((_request, response) => {
    requests++
    if (requests > 1) {
      response.writeHead(401).end('no')
    }
  })
  const client = createClashClient({ baseUrl: service.baseUrl })
  try {
    const controller = new AbortController()
    const stream = client.logs.watch({
      transport: 'http-json',
      signal: controller.signal,
    })
    const arrived = once(service.server, 'request')
    const pending = stream[Symbol.asyncIterator]().next()
    await arrived
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(AbortError)
    const auth = client.logs.watch({
      transport: 'http-json',
      reconnect: { maxAttempts: 2 },
    })
    await expect(auth[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      kind: 'http',
      status: 401,
    })
    expect(requests).toBe(2)
  } finally {
    client.dispose()
    await service.close()
  }
})
it('HTTP connect timeout also covers a stalled error response body', async () => {
  const service = await localServer((_request, response) => {
    response.writeHead(503)
    response.flushHeaders()
  })
  const client = createClashClient({ baseUrl: service.baseUrl })
  try {
    const stream = client.logs.watch({
      transport: 'http-json',
      connectTimeoutMs: 10,
    })
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      TimeoutError,
    )
  } finally {
    client.dispose()
    await service.close()
  }
})
