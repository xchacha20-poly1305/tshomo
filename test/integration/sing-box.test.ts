import { expect, it } from 'vitest'
import {
  createClashClient,
  DecodeError,
  InputError,
  isProxyGroup,
} from '../../src/index.js'
import { localServer } from './server.js'

// Source-derived contracts: reF1nd/sing-box 56e25a64031f8130995f87abdc05ff5ed24fdd55,
// experimental/clashapi/{configs,rules,proxies,api_meta_group,provider,ruleprovider,dns}.go.
const config = {
  port: 0,
  'socks-port': 0,
  'redir-port': 0,
  'tproxy-port': 0,
  'mixed-port': 0,
  'allow-lan': true,
  'bind-address': '*',
  mode: 'rule',
  'mode-list': ['rule'],
  modes: ['rule'],
  'log-level': 'info',
  ipv6: false,
  tun: null,
}

it('accepts sing-box null TUN without weakening other config fields or patch inputs', async () => {
  let value: unknown = config
  const client = createClashClient({
    baseUrl: 'http://local/',
    fetch: async () => Response.json(value),
  })
  try {
    expect(await client.configs.get()).toEqual(config)
    for (const invalid of [
      { tun: false },
      { tun: { enable: 'yes' } },
      { mode: null },
      { port: '7890' },
    ]) {
      value = { ...config, ...invalid }
      await expect(client.configs.get()).rejects.toBeInstanceOf(DecodeError)
    }
    // @ts-expect-error A null response field is not a TUN patch object.
    expect(() => client.configs.patch({ tun: null })).toThrow(InputError)
  } finally {
    client.dispose()
  }
})

it('treats nil rule and group slices as empty lists and still rejects malformed collections', async () => {
  let value: unknown
  const client = createClashClient({
    baseUrl: 'http://local/',
    fetch: async () => Response.json(value),
  })
  try {
    value = { rules: null }
    expect(await client.rules.list()).toEqual([])
    value = { proxies: null }
    expect(await client.groups.list()).toEqual([])
    for (const invalid of [{}, 'bad', [null], [42]]) {
      value = { rules: invalid }
      await expect(client.rules.list()).rejects.toBeInstanceOf(DecodeError)
      value = { proxies: invalid }
      await expect(client.groups.list()).rejects.toBeInstanceOf(DecodeError)
    }
    value = {}
    await expect(client.rules.list()).rejects.toBeInstanceOf(DecodeError)
    await expect(client.groups.list()).rejects.toBeInstanceOf(DecodeError)
  } finally {
    client.dispose()
  }
})

it('preserves null group membership and unknown sing-box fields without misnarrowing arrays', async () => {
  const proxy = {
    name: 'empty',
    type: 'LoadBalance',
    now: '',
    all: null,
    history: [],
    future: { kept: true },
  }
  let value: unknown = proxy
  const client = createClashClient({
    baseUrl: 'http://local/',
    fetch: async () => Response.json(value),
  })
  try {
    const result = await client.proxies.get('empty')
    expect(result).toEqual(proxy)
    expect(isProxyGroup(result)).toBe(false)
    value = { ...proxy, all: [] }
    expect(isProxyGroup(await client.proxies.get('empty'))).toBe(true)
    value = { ...proxy, all: [null] }
    await expect(client.proxies.get('empty')).rejects.toBeInstanceOf(
      DecodeError,
    )
  } finally {
    client.dispose()
  }
})

it('preserves and validates the capitalized DNS Server field used by sing-box', async () => {
  const dns = {
    Status: 0,
    Question: [{ Name: 'demo.test.', Qtype: 1, Qclass: 1 }],
    Server: 'internal',
    TC: false,
    RD: true,
    RA: true,
    AD: false,
    CD: false,
    Answer: [{ name: 'demo.test.', type: 1, TTL: 0, data: '192.0.2.1' }],
  }
  let value: unknown = dns
  const client = createClashClient({
    baseUrl: 'http://local/',
    fetch: async () => Response.json(value),
  })
  try {
    expect(await client.dns.query({ name: 'demo.test' })).toEqual(dns)
    for (const invalid of [
      { Server: 1 },
      { Answer: [{ name: 'x', type: 1, TTL: '60', data: 'x' }] },
    ]) {
      value = { ...dns, ...invalid }
      await expect(
        client.dns.query({ name: 'demo.test' }),
      ).rejects.toBeInstanceOf(DecodeError)
    }
  } finally {
    client.dispose()
  }
})

it('sends a default server timeout for proxy, group and provider delay endpoints', async () => {
  const paths: string[] = []
  const server = await localServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://local')
    paths.push(url.pathname)
    const timeout = url.searchParams.get('timeout')
    // sing-box ParseInt(query.Get("timeout"), 10, 16) rejects the missing parameter.
    if (timeout !== '5000' && timeout !== '2500') {
      response.writeHead(400).end('{"message":"Bad request"}')
      return
    }
    response.end(
      url.pathname.startsWith('/controller/group/')
        ? '{"direct":12}'
        : '{"delay":12}',
    )
  })
  const client = createClashClient({ baseUrl: server.baseUrl })
  try {
    expect(await client.proxies.delay('direct')).toEqual({ delay: 12 })
    expect(await client.groups.delay('selector')).toEqual({ direct: 12 })
    expect(await client.proxyProviders.delayProxy('inline', 'direct')).toEqual({
      delay: 12,
    })
    expect(await client.proxies.delay('direct', { timeoutMs: 2500 })).toEqual({
      delay: 12,
    })
    expect(paths).toEqual([
      '/controller/proxies/direct/delay',
      '/controller/group/selector/delay',
      '/controller/providers/proxies/inline/direct/healthcheck',
      '/controller/proxies/direct/delay',
    ])
  } finally {
    client.dispose()
    await server.close()
  }
})
