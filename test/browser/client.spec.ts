import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { localServer } from '../integration/server.js'

let pageServer: Awaited<ReturnType<typeof localServer>>
let apiServer: Awaited<ReturnType<typeof localServer>>
let preflight = 0
let authorizations: (string | undefined)[] = []
let socketUrls: (string | undefined)[] = []
let httpStreams = 0

test.beforeAll(async () => {
  pageServer = await localServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://local')
    if (url.pathname.startsWith('/dist/')) {
      const path = resolve('.' + url.pathname)
      if (!path.startsWith(resolve('dist') + '/')) {
        response.writeHead(404).end()
        return
      }
      void readFile(path).then(
        (data) =>
          response
            .writeHead(200, { 'Content-Type': 'text/javascript' })
            .end(data),
        () => response.writeHead(404).end(),
      )
    } else {
      response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('<!doctype html><title>Local SDK test</title>')
    }
  })
  apiServer = await localServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, content-type',
    )
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, PATCH, PUT, POST, DELETE, OPTIONS',
    )
    if (request.method === 'OPTIONS') {
      preflight++
      response.writeHead(204).end()
      return
    }
    authorizations.push(request.headers.authorization)
    if (request.url === '/controller/traffic') {
      httpStreams++
      response.on('close', () => httpStreams--)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write('{"up":5,"down":6}\n')
    } else if (
      request.method === 'PUT' &&
      request.url === '/controller/rules/browser-uuid'
    ) {
      response.writeHead(204).end()
    } else {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end('{"version":"browser-fixture"}')
    }
  })
  apiServer.wss.on('connection', (socket, request) => {
    socketUrls.push(request.url)
    if (request.url?.startsWith('/controller/logs')) {
      socket.send('{"type":"info","payload":"hello"}')
    } else {
      socket.send('{"up":3,"down":4}')
    }
  })
})
test.afterAll(async () => {
  await apiServer?.close()
  await pageServer?.close()
})
test.beforeEach(async ({ page }) => {
  preflight = 0
  authorizations = []
  socketUrls = []
  await page.goto(pageServer.baseUrl)
})

test('browser import, cross-origin Bearer/preflight, token WS and sample cleanup', async ({
  page,
}) => {
  const result = await page.evaluate(async (baseUrl) => {
    const moduleUrl = '/dist/index.js'
    const { createClashClient } = await import(moduleUrl)
    const client = createClashClient({ baseUrl, secret: 'browser-secret' })
    try {
      return {
        version: await client.system.getVersion(),
        traffic: await client.metrics.trafficSample(),
      }
    } finally {
      client.dispose()
    }
  }, apiServer.baseUrl)
  expect(result).toEqual({
    version: { version: 'browser-fixture' },
    traffic: { up: 3, down: 4 },
  })
  expect(preflight).toBeGreaterThan(0)
  expect(authorizations).toEqual(['Bearer browser-secret'])
  expect(socketUrls).toEqual(['/controller/traffic?token=browser-secret'])
  await expect.poll(() => apiServer.wss.clients.size).toBe(0)
})
test('dispose ends subscriptions; HTTP sample releases a streaming fetch body', async ({
  page,
}) => {
  const result = await page.evaluate(async (baseUrl) => {
    const moduleUrl = '/dist/index.js'
    const { createClashClient } = await import(moduleUrl)
    const client = createClashClient({ baseUrl, secret: 'browser-secret' })
    const sample = await client.metrics.trafficSample({
      transport: 'http-json',
    })
    const stream = client.logs.watch()
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    const waiting = iterator.next()
    client.dispose()
    return {
      sample,
      first: first.value,
      ended: (await waiting).done,
      state: stream.state,
    }
  }, apiServer.baseUrl)
  expect(result).toEqual({
    sample: { up: 5, down: 6 },
    first: { type: 'info', payload: 'hello' },
    ended: true,
    state: 'closed',
  })
  await expect.poll(() => apiServer.wss.clients.size).toBe(0)
  await expect.poll(() => httpStreams).toBe(0)
})
test('page closure releases its live WebSocket connection', async ({
  page,
}) => {
  await page.evaluate(async (baseUrl) => {
    const moduleUrl = '/dist/index.js'
    const { createClashClient } = await import(moduleUrl)
    const client = createClashClient({ baseUrl })
    const stream = client.metrics.watchTraffic()
    await stream[Symbol.asyncIterator]().next()
    window.addEventListener('pagehide', () => client.dispose(), { once: true })
  }, apiServer.baseUrl)
  expect(apiServer.wss.clients.size).toBe(1)
  await page.close()
  await expect.poll(() => apiServer.wss.clients.size).toBe(0)
})

test('caller extensions use the browser transport', async ({ page }) => {
  const result = await page.evaluate(async (baseUrl) => {
    const moduleUrl = '/dist/index.js'
    const { createClashClient } = await import(moduleUrl)
    const client = createClashClient({ baseUrl, secret: 'browser-secret' })
    const extension = client.extend(
      (transport: import('../../src/index.js').ExtensionTransport) => ({
        version: () =>
          transport.json({ method: 'GET', path: ['version'] }, (value) => {
            if (
              typeof value !== 'object' ||
              value === null ||
              !('version' in value) ||
              typeof value.version !== 'string'
            ) {
              throw new Error('Expected a version string')
            }
            return value.version
          }),
      }),
    )
    try {
      return await extension.version()
    } finally {
      client.dispose()
    }
  }, apiServer.baseUrl)
  expect(result).toBe('browser-fixture')
  expect(authorizations).toEqual(['Bearer browser-secret'])
})

test('published reF1nd module performs an authenticated cross-origin toggle', async ({
  page,
}) => {
  const result = await page.evaluate(async (baseUrl) => {
    const moduleUrl = '/dist/index.js'
    const extensionUrl = '/dist/extensions/refind.js'
    const { createClashClient } = await import(moduleUrl)
    const { refind, isRefindRule } = await import(extensionUrl)
    const client = createClashClient({ baseUrl, secret: 'browser-secret' })
    try {
      const extension = client.extend(refind)
      await extension.rules.toggleByUuid('browser-uuid')
      return isRefindRule({
        type: 'default',
        payload: '',
        proxy: 'direct',
        uuid: 'browser-uuid',
      })
    } finally {
      client.dispose()
    }
  }, apiServer.baseUrl)
  expect(result).toBe(true)
  expect(preflight).toBeGreaterThan(0)
  expect(authorizations).toEqual(['Bearer browser-secret'])
})
