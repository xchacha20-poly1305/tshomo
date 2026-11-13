import { expect, it, vi } from 'vitest'
import {
  AbortError,
  ClientDisposedError,
  createClashClient,
  HttpError,
  InputError,
  TimeoutError,
  type Rule,
} from '../../src/index.js'
import { isRefindRule, refind } from '../../src/extensions/refind.js'
import { localServer } from './server.js'

// Source-derived contract: reF1nd/sing-box 732618a5989cd2566f072c374fe2f619200f33f9,
// experimental/clashapi/rules.go (also matches testing 17397d022647b73378705e1f91ff031dddaaec21).
it('lists DNS/routing UUID rules and toggles their current state with authenticated PUT', async () => {
  const uuid = 'opaque / % ? #'
  let disabled = false
  const requests: {
    method: string | undefined
    url: string | undefined
    auth: string | undefined
    body: string
  }[] = []
  const server = await localServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push({
        method: request.method,
        url: request.url,
        auth: request.headers.authorization,
        body,
      })
      if (request.method === 'GET' && request.url === '/controller/rules') {
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify({
            rules: [
              {
                type: 'default',
                payload: 'domain=example.test',
                proxy: 'dns',
                uuid,
                ...(disabled ? { disabled: true } : {}),
                future: 42,
              },
              {
                type: 'default',
                payload: 'final',
                proxy: 'route(direct)',
                uuid: 'route-id',
              },
              { type: 'logical', payload: 'and', proxy: 'route(proxy)' },
            ],
          }),
        )
      } else if (
        request.method === 'PUT' &&
        request.url === '/controller/rules/' + encodeURIComponent(uuid)
      ) {
        disabled = !disabled
        response.writeHead(204).end()
      } else {
        response.writeHead(404).end('{"message":"Not Found"}')
      }
    })
  })
  const client = createClashClient({
    baseUrl: server.baseUrl,
    secret: 'test-secret',
    capabilities: { 'rules.disableByIndex': 'unsupported' },
  })
  try {
    const extension = client.extend(refind)
    expect(requests).toHaveLength(0)
    const rules = await client.rules.list()
    const supported = rules.filter(isRefindRule)
    expect(supported.map((rule) => rule.uuid)).toEqual([uuid, 'route-id'])
    expect(supported[0]?.future).toBe(42)
    expect(rules[0]?.disabled).toBeUndefined()
    await extension.rules.toggleByUuid(uuid)
    expect((await client.rules.list())[0]?.disabled).toBe(true)
    await extension.rules.toggleByUuid(uuid)
    expect((await client.rules.list())[0]?.disabled).toBeUndefined()
    await expect(
      extension.rules.toggleByUuid('missing'),
    ).rejects.toBeInstanceOf(HttpError)
    expect(requests.filter((request) => request.method === 'PUT')).toEqual([
      ...Array.from({ length: 2 }, () => ({
        method: 'PUT',
        url: '/controller/rules/' + encodeURIComponent(uuid),
        auth: 'Bearer test-secret',
        body: '',
      })),
      {
        method: 'PUT',
        url: '/controller/rules/missing',
        auth: 'Bearer test-secret',
        body: '',
      },
    ])
  } finally {
    client.dispose()
    await server.close()
  }
})

it('only narrows UUID-bearing rule shapes, without asserting fork identity', () => {
  const rule: Rule = { type: 'default', payload: '', proxy: 'direct' }
  expect(isRefindRule(rule)).toBe(false)
  expect(isRefindRule({ ...rule, uuid: '' })).toBe(false)
  expect(isRefindRule({ ...rule, uuid: 'opaque-id' })).toBe(true)
})

it('validates UUIDs and forwards cancellation, timeout and disposal without retries', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(new ReadableStream()),
  )
  const client = createClashClient({ baseUrl: 'https://example.test/', fetch })
  const extension = client.extend(refind)
  expect(() => extension.rules.toggleByUuid('')).toThrow(InputError)
  // @ts-expect-error Validate JavaScript callers too.
  expect(() => extension.rules.toggleByUuid(42)).toThrow(InputError)
  await expect(extension.rules.toggleByUuid('..')).rejects.toBeInstanceOf(
    InputError,
  )
  await expect(
    extension.rules.toggleByUuid('uuid', { signal: AbortSignal.abort() }),
  ).rejects.toBeInstanceOf(AbortError)
  expect(fetch).not.toHaveBeenCalled()
  // A stalled response body times out even for void requests.
  // Error bodies must be read, so use a non-success response to exercise this.
  fetch.mockImplementation(
    async () => new Response(new ReadableStream(), { status: 500 }),
  )
  await expect(
    extension.rules.toggleByUuid('uuid', { timeoutMs: 5 }),
  ).rejects.toBeInstanceOf(TimeoutError)
  expect(fetch).toHaveBeenCalledTimes(1)
  const pending = extension.rules.toggleByUuid('uuid', { timeoutMs: 0 })
  client.dispose()
  await expect(pending).rejects.toBeInstanceOf(ClientDisposedError)
  await expect(extension.rules.toggleByUuid('uuid')).rejects.toBeInstanceOf(
    ClientDisposedError,
  )
  expect(fetch).toHaveBeenCalledTimes(2)
})
