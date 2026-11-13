import { it, expect } from 'vitest'
import { createClashClient, type ClashClient } from '../../src/index.js'
import { localServer } from './server.js'

it('maps A/B operations to wire method, prefix, encoding, query, body and domain return', async () => {
  interface Case {
    run(c: ClashClient): Promise<unknown>
    method: string
    path: string
    body?: unknown
    query?: string
    response?: unknown
    result?: unknown
    raw?: boolean
  }
  const proxy = { name: 'DIRECT', type: 'Direct', unknown: { kept: true } }
  const snapshot = { downloadTotal: 2, uploadTotal: 1, connections: null }
  const cases: Case[] = [
    {
      run: (c) => c.system.hello(),
      method: 'GET',
      path: '',
      response: { hello: 'world' },
    },
    {
      run: (c) => c.system.getVersion(),
      method: 'GET',
      path: 'version',
      response: { version: '1', meta: true },
    },
    {
      run: (c) => c.configs.get(),
      method: 'GET',
      path: 'configs',
      response: { 'mixed-port': 7890, tun: { enable: true }, future: 2 },
    },
    {
      run: (c) => c.configs.patch({ mode: 'rule' }),
      method: 'PATCH',
      path: 'configs',
      body: { mode: 'rule' },
    },
    {
      run: (c) => c.configs.load({ payload: 'mode: rule' }, { force: false }),
      method: 'PUT',
      path: 'configs',
      query: '?force=false',
      body: { payload: 'mode: rule' },
    },
    {
      run: (c) => c.configs.load({ path: '/tmp/config.yaml' }),
      method: 'PUT',
      path: 'configs',
      body: { path: '/tmp/config.yaml' },
    },
    {
      run: (c) => c.configs.reload(),
      method: 'PUT',
      path: 'configs',
      query: '?reload=true',
      body: { path: '', payload: '' },
    },
    { run: (c) => c.configs.updateGeo(), method: 'POST', path: 'configs/geo' },
    {
      run: (c) => c.proxies.list(),
      method: 'GET',
      path: 'proxies',
      response: { proxies: { DIRECT: proxy } },
      result: { DIRECT: proxy },
    },
    {
      run: (c) => c.proxies.get('节点 /%?#'),
      method: 'GET',
      path: 'proxies/' + encodeURIComponent('节点 /%?#'),
      response: proxy,
    },
    {
      run: (c) => c.proxies.select('g', 'DIRECT'),
      method: 'PUT',
      path: 'proxies/g',
      body: { name: 'DIRECT' },
    },
    {
      run: (c) => c.proxies.clearFixed('g'),
      method: 'DELETE',
      path: 'proxies/g',
    },
    {
      run: (c) =>
        c.proxies.delay('DIRECT', {
          url: 'https://test.invalid/?q=1',
          timeoutMs: 0,
          expectedStatus: '200/204',
        }),
      method: 'GET',
      path: 'proxies/DIRECT/delay',
      query:
        '?url=https%3A%2F%2Ftest.invalid%2F%3Fq%3D1&timeout=0&expected=200%2F204',
      response: { delay: 1 },
    },
    {
      run: (c) => c.groups.list(),
      method: 'GET',
      path: 'group',
      response: { proxies: [proxy] },
      result: [proxy],
    },
    {
      run: (c) => c.groups.get('g'),
      method: 'GET',
      path: 'group/g',
      response: proxy,
    },
    {
      run: (c) => c.groups.delay('g'),
      method: 'GET',
      path: 'group/g/delay',
      query: '?timeout=5000',
      response: { DIRECT: 2 },
    },
    {
      run: (c) => c.proxyProviders.list(),
      method: 'GET',
      path: 'providers/proxies',
      response: {
        providers: {
          p: { name: 'p', proxies: [proxy], subscriptionInfo: { Upload: 3 } },
        },
      },
      result: {
        p: { name: 'p', proxies: [proxy], subscriptionInfo: { Upload: 3 } },
      },
    },
    {
      run: (c) => c.proxyProviders.get('p'),
      method: 'GET',
      path: 'providers/proxies/p',
      response: { name: 'p' },
    },
    {
      run: (c) => c.proxyProviders.update('p'),
      method: 'PUT',
      path: 'providers/proxies/p',
    },
    {
      run: (c) => c.proxyProviders.healthCheck('p'),
      method: 'GET',
      path: 'providers/proxies/p/healthcheck',
    },
    {
      run: (c) => c.proxyProviders.getProxy('p', 'DIRECT'),
      method: 'GET',
      path: 'providers/proxies/p/DIRECT',
      response: proxy,
    },
    {
      run: (c) => c.proxyProviders.delayProxy('p', 'DIRECT'),
      method: 'GET',
      path: 'providers/proxies/p/DIRECT/healthcheck',
      query: '?timeout=5000',
      response: { delay: 3 },
    },
    {
      run: (c) => c.rules.list(),
      method: 'GET',
      path: 'rules',
      response: { rules: [{ type: 'MATCH', payload: '', proxy: 'DIRECT' }] },
      result: [{ type: 'MATCH', payload: '', proxy: 'DIRECT' }],
    },
    {
      run: (c) => c.rules.disableByIndex({ 0: false, 2: true }),
      method: 'PATCH',
      path: 'rules/disable',
      body: { 0: false, 2: true },
    },
    {
      run: (c) => c.ruleProviders.list(),
      method: 'GET',
      path: 'providers/rules',
      response: { providers: { r: { name: 'r', ruleCount: 3 } } },
      result: { r: { name: 'r', ruleCount: 3 } },
    },
    {
      run: (c) => c.ruleProviders.update('r'),
      method: 'PUT',
      path: 'providers/rules/r',
    },
    {
      run: (c) => c.connections.snapshot(),
      method: 'GET',
      path: 'connections',
      response: snapshot,
    },
    {
      run: (c) => c.connections.close('id/?'),
      method: 'DELETE',
      path: 'connections/id%2F%3F',
    },
    {
      run: (c) => c.connections.closeAll(),
      method: 'DELETE',
      path: 'connections',
    },
    {
      run: (c) => c.dns.query({ name: 'example.invalid', type: 'AAAA' }),
      method: 'GET',
      path: 'dns/query',
      query: '?name=example.invalid&type=AAAA',
      response: { Status: 0, Question: [] },
    },
    { run: (c) => c.cache.flushDns(), method: 'POST', path: 'cache/dns/flush' },
    {
      run: (c) => c.cache.flushFakeIp(),
      method: 'POST',
      path: 'cache/fakeip/flush',
    },
    {
      run: (c) => c.storage.getBytes('k/?'),
      method: 'GET',
      path: 'storage/k%2F%3F',
      response: [1, 2],
      result: new TextEncoder().encode('[1,2]'),
    },
    {
      run: (c) =>
        c.storage.putBytes('k', new TextEncoder().encode(' {"x":1} ')),
      method: 'PUT',
      path: 'storage/k',
      body: ' {"x":1} ',
      raw: true,
    },
    {
      run: (c) => c.storage.getJson('k'),
      method: 'GET',
      path: 'storage/k',
      response: null,
    },
    {
      run: (c) => c.storage.putJson('k', { x: 1 }),
      method: 'PUT',
      path: 'storage/k',
      body: { x: 1 },
    },
    { run: (c) => c.storage.delete('k'), method: 'DELETE', path: 'storage/k' },
    { run: (c) => c.system.gc(), method: 'PUT', path: 'gc' },
    {
      run: (c) => c.system.restart(),
      method: 'POST',
      path: 'restart',
      response: { status: 'ok' },
    },
    {
      run: (c) => c.system.upgradeCore({ channel: 'alpha', force: false }),
      method: 'POST',
      path: 'upgrade',
      query: '?channel=alpha&force=false',
      response: { status: 'ok' },
    },
    {
      run: (c) => c.system.upgradeUi(),
      method: 'POST',
      path: 'upgrade/ui',
      response: { status: 'ok' },
    },
    { run: (c) => c.system.updateGeo(), method: 'POST', path: 'upgrade/geo' },
  ]
  let current: Case | undefined
  const captures: {
    url?: string
    method?: string
    auth?: string
    contentType?: string
    body: string
  }[] = []
  const service = await localServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      captures.push({
        ...(request.url ? { url: request.url } : {}),
        ...(request.method ? { method: request.method } : {}),
        ...(request.headers.authorization
          ? { auth: request.headers.authorization }
          : {}),
        ...(request.headers['content-type']
          ? { contentType: request.headers['content-type'] }
          : {}),
        body: Buffer.concat(chunks).toString(),
      })
      if (current && Object.hasOwn(current, 'response')) {
        response
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(current.response))
      } else {
        response.writeHead(204).end()
      }
    })
  })
  const client = createClashClient({
    baseUrl: service.baseUrl,
    secret: 'test-only',
  })
  try {
    for (const row of cases) {
      current = row
      const result = await row.run(client)
      expect(result, row.path).toEqual(
        Object.hasOwn(row, 'result') ? row.result : row.response,
      )
      const request = captures.at(-1)
      expect(request, row.path).toMatchObject({
        method: row.method,
        url: '/controller/' + row.path + (row.query ?? ''),
        auth: 'Bearer test-only',
      })
      expect(request?.body).toBe(
        row.body === undefined
          ? ''
          : row.raw
            ? row.body
            : JSON.stringify(row.body),
      )
      expect(request?.contentType).toBe(
        row.body !== undefined && !row.raw ? 'application/json' : undefined,
      )
    }
    expect(captures).toHaveLength(cases.length)
  } finally {
    client.dispose()
    await service.close()
  }
})
