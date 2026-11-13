import { describe, it, expect, vi } from 'vitest'
import {
  createClashClient,
  AbortError,
  ClientDisposedError,
  DecodeError,
  HttpError,
  InputError,
  NetworkError,
  OperationError,
  TimeoutError,
  UnsupportedCapabilityError,
  readSubscriptionInfo,
} from '../src/index.js'

const baseUrl = 'http://localhost/controller/'
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status })
}
function mockClient(value: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response(value))
  return { client: createClashClient({ baseUrl, fetch }), fetch }
}
describe('HTTP boundary', () => {
  it('validates URL and path before I/O; preserves prefixes and raw names', async () => {
    for (const value of [
      'relative',
      'file:///tmp',
      'https://u:p@host/',
      'https://host/?',
      'https://host/#x',
    ]) {
      expect(() => createClashClient({ baseUrl: value })).toThrow(InputError)
    }
    const { client, fetch } = mockClient({
      name: 'x',
      type: 'direct',
      future: 42,
    })
    const name = '香港 / % ? #'
    expect((await client.proxies.get(name)).future).toBe(42)
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      baseUrl + 'proxies/' + encodeURIComponent(name),
    )
    await expect(client.proxies.get('..')).rejects.toBeInstanceOf(InputError)
    expect(fetch).toHaveBeenCalledTimes(1)
    client.dispose()
  })
  it('isolates credentials, omits cookies, disables redirects, constructs no I/O', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({ version: '1' }),
    )
    const clients = ['one', 'two'].map((secret) =>
      createClashClient({ baseUrl, fetch, secret }),
    )
    expect(fetch).not.toHaveBeenCalled()
    await Promise.all(clients.map((client) => client.system.getVersion()))
    expect(
      fetch.mock.calls.map((call) =>
        new Headers(call[1]?.headers).get('Authorization'),
      ),
    ).toEqual(['Bearer one', 'Bearer two'])
    for (const call of fetch.mock.calls) {
      expect(call[1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
    }
    clients.forEach((client) => client.dispose())
  })
  it('allows void responses without reading JSON and rejects empty data responses', async () => {
    for (const body of [null, '', '<html>ok</html>']) {
      const client = createClashClient({
        baseUrl,
        fetch: async () => new Response(body),
      })
      await client.cache.flushDns()
      await expect(client.system.getVersion()).rejects.toBeInstanceOf(
        DecodeError,
      )
      client.dispose()
    }
    const client = createClashClient({
      baseUrl,
      fetch: async () => new Response(null, { status: 204 }),
    })
    await client.proxyProviders.healthCheck('p')
    client.dispose()
  })
  it('distinguishes HTTP, network, business and decode failures without secrets', async () => {
    const secret = 'private-secret'
    const client = createClashClient({
      baseUrl,
      secret,
      fetch: async () =>
        new Response(
          `Authorization: Bearer ${secret} ws://host/?token=${secret}`,
          { status: 403 },
        ),
    })
    const error = await client.system
      .getVersion()
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(HttpError)
    expect(JSON.stringify(error)).not.toContain(secret)
    client.dispose()
    const invalid = mockClient({ version: 2 })
    await expect(invalid.client.system.getVersion()).rejects.toBeInstanceOf(
      DecodeError,
    )
    invalid.client.dispose()
    const business = mockClient({ status: 'error', message: secret })
    await expect(business.client.system.restart()).rejects.toBeInstanceOf(
      OperationError,
    )
    business.client.dispose()
    const network = createClashClient({
      baseUrl,
      fetch: async () => {
        throw new Error(secret)
      },
    })
    await expect(network.system.getVersion()).rejects.toBeInstanceOf(
      NetworkError,
    )
    network.dispose()
  })
  it('caps error body reads and cancels the reader', async () => {
    let pulls = 0
    let cancelled = false
    const client = createClashClient({
      baseUrl,
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull(c) {
              pulls++
              c.enqueue(new TextEncoder().encode('x'.repeat(1024)))
            },
            cancel() {
              cancelled = true
            },
          }),
          { status: 500 },
        ),
    })
    await expect(client.system.getVersion()).rejects.toBeInstanceOf(HttpError)
    expect(pulls).toBeLessThanOrEqual(10)
    expect(cancelled).toBe(true)
    client.dispose()
  })
  it('recognizes pre-abort and explicit unsupported before network', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createClashClient({
      baseUrl,
      fetch,
      capabilities: { 'cache.flushDns': 'unsupported' },
    })
    await expect(
      client.system.getVersion({ signal: AbortSignal.abort('secret') }),
    ).rejects.toBeInstanceOf(AbortError)
    await expect(client.cache.flushDns()).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    )
    expect(fetch).not.toHaveBeenCalled()
    client.dispose()
    await expect(client.system.getVersion()).rejects.toBeInstanceOf(
      ClientDisposedError,
    )
  })
  it('cancels during body reads, distinguishes timeout and dispose', async () => {
    function bodyClient() {
      return createClashClient({
        baseUrl,
        fetch: async (_url, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new Error('cancelled')),
                  { once: true },
                )
              },
            }),
          ),
      })
    }
    const timeout = bodyClient()
    await expect(
      timeout.system.getVersion({ timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(TimeoutError)
    timeout.dispose()
    const abort = bodyClient()
    const controller = new AbortController()
    const request = abort.system.getVersion({ signal: controller.signal })
    controller.abort()
    await expect(request).rejects.toBeInstanceOf(AbortError)
    abort.dispose()
    const dispose = bodyClient()
    const waiting = dispose.system.getVersion()
    dispose.dispose()
    await expect(waiting).rejects.toBeInstanceOf(ClientDisposedError)
  })
  it('handles provider name lists, uppercase and lowercase usage, DNS variants', async () => {
    const { client } = mockClient({ providers: ['one', '__proto__'] })
    const list = await client.ruleProviders.list()
    expect(list.one).toEqual({ name: 'one' })
    expect(Object.hasOwn(list, '__proto__')).toBe(true)
    client.dispose()
    expect(readSubscriptionInfo({ Upload: 12, Expire: 20 })).toEqual({
      upload: 12,
      expire: 20,
    })
    expect(readSubscriptionInfo({ upload: 3 })).toEqual({ upload: 3 })
    for (const value of [
      { Status: 0, Question: [] },
      { status: 0, Question: [] },
      { status: 0, question: [] },
    ]) {
      const { client } = mockClient(value)
      expect(await client.dns.query({ name: 'example.com' })).toEqual(value)
      client.dispose()
    }
  })
})

it('rejects ambiguous config loads, invalid JSON patches and invalid header values before I/O', () => {
  const { client, fetch } = mockClient({})
  // @ts-expect-error invalid JS callers must not issue ambiguous writes
  expect(() => client.configs.load({ path: 'x', payload: 3 })).toThrow(
    InputError,
  )
  // @ts-expect-error invalid JS callers must not send both input modes
  expect(() => client.configs.load({ path: 'x', payload: 'y' })).toThrow(
    InputError,
  )
  const cycle: { [key: string]: never } = {}
  Object.defineProperty(cycle, 'cycle', { value: cycle, enumerable: true })
  expect(() => client.configs.patch(cycle)).toThrow(InputError)
  expect(() =>
    createClashClient({ baseUrl, secret: 'invalid\r\nheader' }),
  ).toThrow(InputError)
  expect(fetch).not.toHaveBeenCalled()
  client.dispose()
})
