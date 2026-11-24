import { expect, it, vi } from 'vitest'
import {
  AbortError,
  ClientDisposedError,
  createClashClient,
  DecodeError,
  HttpError,
  InputError,
  OperationError,
  TimeoutError,
  type Connection,
  type Proxy,
} from '../../src/index.js'
import {
  isSmartConnection,
  isSmartGroup,
  isSmartNodeRank,
  smart,
} from '../../src/extensions/smart.js'
import { localServer } from './server.js'

// Source-derived contract: vernesong/mihomo Alpha 1348c4d2dee81f6941443b3d8b8a78a602b3d89c
// (hub/route/groups.go, hub/route/cache.go, hub/route/connections.go, hub/route/upgrade.go).
it('maps Smart endpoints, path encoding, auth, and Go nil-slice normalization', async () => {
  const smartGroup = 'Smart / % ? #'
  const configName = 'profile / % ? #'
  const connId = 'conn / % ? #'
  let selected = ''
  let smartBlock = 'normal'
  let lgbmStatus = 'ok'
  const requests: {
    method: string | undefined
    url: string | undefined
    auth: string | undefined
  }[] = []
  const server = await localServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      auth: request.headers.authorization,
    })
    const url = request.url ?? ''
    if (request.method === 'GET' && url === '/controller/proxies') {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          proxies: {
            [smartGroup]: {
              name: smartGroup,
              type: 'Smart',
              now: selected || 'Smart - Select',
              all: ['NodeA', 'NodeB'],
              fixed: selected,
              useLightGBM: true,
              collectData: false,
              sampleRate: 0.5,
              preferASN: true,
              tolerance: 50,
              future: 42,
            },
            Selector: {
              name: 'Selector',
              type: 'Selector',
              all: ['NodeA'],
            },
          },
        }),
      )
    } else if (
      request.method === 'PUT' &&
      url === '/controller/proxies/' + encodeURIComponent(smartGroup)
    ) {
      selected = 'NodeA'
      response.writeHead(204).end()
    } else if (
      request.method === 'DELETE' &&
      url === '/controller/proxies/' + encodeURIComponent(smartGroup)
    ) {
      selected = ''
      response.writeHead(204).end()
    } else if (
      request.method === 'GET' &&
      url === '/controller/group/weights'
    ) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          weights: {
            [smartGroup]: [
              { Name: 'NodeA', Rank: 'MostUsed', Weight: 100, extra: true },
            ],
            EmptySmart: null,
          },
          errors: { BrokenSmart: 'cache read error' },
          message: 'partial',
          topExtra: 7,
        }),
      )
    } else if (
      request.method === 'GET' &&
      url === '/controller/group/' + encodeURIComponent(smartGroup) + '/weights'
    ) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          weights: [{ Name: 'NodeA', Rank: 'MostUsed', Weight: 100 }],
        }),
      )
    } else if (
      request.method === 'GET' &&
      url === '/controller/group/EmptySmart/weights'
    ) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          weights: null,
          message: 'No weight data available for the specified group',
        }),
      )
    } else if (
      request.method === 'GET' &&
      url === '/controller/group/Selector/weights'
    ) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ weights: [], error: 'Not a Smart group' }))
    } else if (
      request.method === 'POST' &&
      url === '/controller/cache/smart/flush'
    ) {
      response.writeHead(204).end()
    } else if (
      request.method === 'POST' &&
      url === '/controller/cache/smart/flush/' + encodeURIComponent(configName)
    ) {
      response.writeHead(204).end()
    } else if (request.method === 'GET' && url === '/controller/connections') {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          downloadTotal: 100,
          uploadTotal: 50,
          connections: [
            {
              id: connId,
              upload: 10,
              download: 20,
              start: '2026-01-01T00:00:00Z',
              chains: ['NodeA', smartGroup],
              metadata: {
                smartBlock,
                smartTarget: 'DOMAIN [example.test]',
                exitGeoIP: 'JP',
              },
            },
            {
              id: 'non-smart',
              upload: 5,
              download: 5,
              start: '2026-01-01T00:00:00Z',
              chains: ['DIRECT'],
              metadata: { smartBlock: '' },
            },
            {
              id: 'plain',
              upload: 1,
              download: 1,
              start: '2026-01-01T00:00:00Z',
              chains: ['DIRECT'],
              metadata: {},
            },
          ],
        }),
      )
    } else if (
      request.method === 'DELETE' &&
      url === '/controller/connections/smart/' + encodeURIComponent(connId)
    ) {
      smartBlock = 'blocked'
      response.writeHead(204).end()
    } else if (
      request.method === 'POST' &&
      url === '/controller/upgrade/lgbm'
    ) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ status: lgbmStatus, extra: 1 }))
    } else {
      response.writeHead(404).end('{"message":"Not Found"}')
    }
  })
  const client = createClashClient({
    baseUrl: server.baseUrl,
    secret: 'test-secret',
  })
  try {
    const extension = client.extend(smart)
    expect(requests).toHaveLength(0)

    const proxies = await client.proxies.list()
    const smartGroups = Object.values(proxies).filter(isSmartGroup)
    expect(smartGroups.map((group) => group.name)).toEqual([smartGroup])
    expect(smartGroups[0]?.future).toBe(42)

    await client.proxies.select(smartGroup, 'NodeA')
    expect((await client.proxies.list())[smartGroup]?.fixed).toBe('NodeA')
    await client.proxies.clearFixed(smartGroup)
    expect((await client.proxies.list())[smartGroup]?.fixed).toBe('')

    const snapshot = await extension.groups.listWeights()
    expect(snapshot).toEqual({
      weights: {
        [smartGroup]: [
          { Name: 'NodeA', Rank: 'MostUsed', Weight: 100, extra: true },
        ],
        EmptySmart: [],
      },
      errors: { BrokenSmart: 'cache read error' },
      message: 'partial',
      topExtra: 7,
    })

    expect(await extension.groups.getWeights(smartGroup)).toEqual([
      { Name: 'NodeA', Rank: 'MostUsed', Weight: 100 },
    ])
    expect(await extension.groups.getWeights('EmptySmart')).toEqual([])
    await expect(
      extension.groups.getWeights('Selector'),
    ).rejects.toBeInstanceOf(HttpError)
    await expect(extension.groups.getWeights('Missing')).rejects.toBeInstanceOf(
      HttpError,
    )

    await extension.cache.flushSmart()
    await extension.cache.flushSmartConfig(configName)

    const conns = await client.connections.snapshot()
    const smartConns = (conns.connections ?? []).filter(isSmartConnection)
    expect(smartConns.map((conn) => conn.id)).toEqual([connId])
    expect(smartConns[0]?.metadata.smartBlock).toBe('normal')

    await extension.connections.block(connId)
    const afterBlock = (
      await client.connections.snapshot()
    ).connections?.filter(isSmartConnection)
    expect(afterBlock?.[0]?.metadata.smartBlock).toBe('blocked')

    expect(await extension.system.upgradeLgbm()).toEqual({
      status: 'ok',
      extra: 1,
    })
    lgbmStatus = 'failed-secret-detail'
    await expect(extension.system.upgradeLgbm()).rejects.toMatchObject({
      name: 'OperationError',
      result: { status: 'unsuccessful' },
    })
    for (const entry of requests) {
      expect(entry.auth).toBe('Bearer test-secret')
    }
  } finally {
    client.dispose()
    await server.close()
  }
})

it('validates Smart group, connection, and rank shapes strictly', () => {
  const baseProxy: Proxy = {
    name: 'SmartGroup',
    type: 'Smart',
    all: ['NodeA'],
  }
  expect(isSmartGroup(baseProxy)).toBe(true)
  expect(
    isSmartGroup({
      ...baseProxy,
      expectedStatus: '200',
      emptyFallback: 'DIRECT',
      'policy-priority': 'NodeA:1.5',
      useLightGBM: true,
      collectData: false,
      sampleRate: 0.25,
      preferASN: true,
      tolerance: 50,
    }),
  ).toBe(true)
  expect(isSmartGroup({ name: 'x', type: 'Smart', all: null })).toBe(false)
  expect(isSmartGroup({ name: 'x', type: 'Smart' })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, type: 'Selector' })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, type: 'smart' })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, expectedStatus: 200 })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, emptyFallback: 1 })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, 'policy-priority': 1 })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, useLightGBM: 'yes' })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, collectData: 1 })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, preferASN: 'true' })).toBe(false)
  expect(isSmartGroup({ ...baseProxy, sampleRate: Number.NaN })).toBe(false)
  expect(
    isSmartGroup({ ...baseProxy, tolerance: Number.POSITIVE_INFINITY }),
  ).toBe(false)
  expect(isSmartGroup({ ...baseProxy, tolerance: undefined })).toBe(false)

  const baseConn: Connection = {
    id: '1',
    upload: 0,
    download: 0,
    start: '2026-01-01T00:00:00Z',
    chains: ['NodeA'],
    metadata: { smartBlock: 'normal' },
  }
  expect(isSmartConnection(baseConn)).toBe(true)
  expect(
    isSmartConnection({
      ...baseConn,
      metadata: {
        smartBlock: 'degraded',
        smartTarget: 'DOMAIN [a]',
        wildcardTarget: 'DOMAIN [a]',
        exitGeoIP: 'US',
        exitIPASN: 'AS13335',
      },
    }),
  ).toBe(true)
  expect(isSmartConnection({ ...baseConn, metadata: {} })).toBe(false)
  expect(isSmartConnection({ ...baseConn, metadata: { smartBlock: '' } })).toBe(
    false,
  )
  expect(isSmartConnection({ ...baseConn, metadata: { smartBlock: 1 } })).toBe(
    false,
  )
  expect(
    isSmartConnection({
      ...baseConn,
      metadata: { smartBlock: 'normal', smartTarget: 123 },
    }),
  ).toBe(false)
  expect(
    isSmartConnection({
      ...baseConn,
      metadata: { smartBlock: 'normal', exitGeoIP: undefined },
    }),
  ).toBe(false)

  expect(isSmartNodeRank({ Name: 'A', Rank: 'MostUsed', Weight: 80 })).toBe(
    true,
  )
  expect(isSmartNodeRank({ Name: 'A', Rank: '', Weight: 0 })).toBe(true)
  expect(isSmartNodeRank(null)).toBe(false)
  expect(
    isSmartNodeRank({ Name: 'A', Rank: 'MostUsed', Weight: Number.NaN }),
  ).toBe(false)
})

it('rejects malformed payloads with DecodeError', async () => {
  let payload: unknown = {}
  const client = createClashClient({
    baseUrl: 'https://example.test/',
    fetch: async () => new Response(JSON.stringify(payload)),
  })
  const extension = client.extend(smart)

  payload = { weights: 'bad' }
  await expect(extension.groups.listWeights()).rejects.toBeInstanceOf(
    DecodeError,
  )
  payload = { weights: { G: [{ Name: 'A', Rank: 'MostUsed' }] } }
  await expect(extension.groups.listWeights()).rejects.toBeInstanceOf(
    DecodeError,
  )
  payload = { weights: { G: [] }, errors: { G: 1 } }
  await expect(extension.groups.listWeights()).rejects.toBeInstanceOf(
    DecodeError,
  )

  payload = { weights: {} }
  await expect(extension.groups.getWeights('G')).rejects.toBeInstanceOf(
    DecodeError,
  )
  payload = { weights: [{ Name: 'A', Rank: 'MostUsed', Weight: '1' }] }
  await expect(extension.groups.getWeights('G')).rejects.toBeInstanceOf(
    DecodeError,
  )

  payload = { status: 123 }
  await expect(extension.system.upgradeLgbm()).rejects.toBeInstanceOf(
    DecodeError,
  )
  payload = { status: 'error' }
  await expect(extension.system.upgradeLgbm()).rejects.toBeInstanceOf(
    OperationError,
  )
  client.dispose()
})

it('validates arguments and forwards cancellation, timeout, and disposal', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(new ReadableStream()),
  )
  const client = createClashClient({ baseUrl: 'https://example.test/', fetch })
  const extension = client.extend(smart)

  expect(() => extension.groups.getWeights('')).toThrow(InputError)
  // @ts-expect-error Validate JavaScript callers too.
  expect(() => extension.groups.getWeights(42)).toThrow(InputError)
  expect(() => extension.cache.flushSmartConfig('')).toThrow(InputError)
  // @ts-expect-error Validate JavaScript callers too.
  expect(() => extension.cache.flushSmartConfig(null)).toThrow(InputError)
  expect(() => extension.connections.block('')).toThrow(InputError)
  // @ts-expect-error Validate JavaScript callers too.
  expect(() => extension.connections.block(123)).toThrow(InputError)

  await expect(extension.groups.getWeights('..')).rejects.toBeInstanceOf(
    InputError,
  )
  await expect(extension.cache.flushSmartConfig('.')).rejects.toBeInstanceOf(
    InputError,
  )
  await expect(extension.connections.block('..')).rejects.toBeInstanceOf(
    InputError,
  )
  await expect(
    extension.cache.flushSmart({ signal: AbortSignal.abort() }),
  ).rejects.toBeInstanceOf(AbortError)
  expect(fetch).not.toHaveBeenCalled()

  fetch.mockImplementation(
    async () => new Response(new ReadableStream(), { status: 500 }),
  )
  await expect(
    extension.cache.flushSmart({ timeoutMs: 5 }),
  ).rejects.toBeInstanceOf(TimeoutError)
  expect(fetch).toHaveBeenCalledTimes(1)

  const pending = extension.cache.flushSmart({ timeoutMs: 0 })
  client.dispose()
  await expect(pending).rejects.toBeInstanceOf(ClientDisposedError)
  await expect(extension.cache.flushSmart()).rejects.toBeInstanceOf(
    ClientDisposedError,
  )
  expect(fetch).toHaveBeenCalledTimes(2)
})
