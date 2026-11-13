import { expect, it, vi } from 'vitest'
import {
  AbortError,
  ClientDisposedError,
  createClashClient,
  DecodeError,
  HttpError,
  InputError,
  TimeoutError,
  type ExtensionTransport,
} from '../src/index.js'

function decodeCount(value: unknown): number {
  if (typeof value !== 'number') {
    throw new Error('Expected a number')
  }
  return value
}

it('lets caller extensions identify metadata and use the authenticated transport', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async (url) =>
      new Response(
        String(url).endsWith('/version')
          ? JSON.stringify({ version: 'custom', customMarker: true })
          : '42',
      ),
  )
  const client = createClashClient({
    baseUrl: 'https://example.test/controller/',
    secret: 'secret',
    fetch,
  })
  const custom = client.extend((transport) => ({
    detect: async () =>
      (await client.system.getVersion()).customMarker === true,
    count: () =>
      transport.json(
        {
          method: 'POST',
          path: ['custom', 'a/b'],
          query: { limit: 3 },
          json: { enabled: true },
        },
        decodeCount,
      ),
  }))
  expect(fetch).not.toHaveBeenCalled()
  expect(await custom.detect()).toBe(true)
  expect(await custom.count()).toBe(42)
  const call = fetch.mock.calls[1]
  expect(String(call?.[0])).toBe(
    'https://example.test/controller/custom/a%2Fb?limit=3',
  )
  expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe(
    'Bearer secret',
  )
  expect(call?.[1]).toMatchObject({
    body: '{"enabled":true}',
    redirect: 'error',
    credentials: 'omit',
  })
  client.dispose()
})

it('supports bytes and empty responses without interpreting caller business status', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('raw'))
  const client = createClashClient({ baseUrl: 'https://example.test/', fetch })
  const transport = client.extend((transport) => transport)
  const bytes = new Uint8Array([1, 2])
  expect(
    await transport.bytes({ method: 'PUT', path: ['custom'], bytes }),
  ).toEqual(new TextEncoder().encode('raw'))
  expect(
    await new Response(fetch.mock.calls[0]?.[1]?.body).arrayBuffer(),
  ).toEqual(bytes.buffer)
  await transport.void({ method: 'DELETE', path: ['custom'] })
  client.dispose()
})

it('validates extension requests before I/O and shares decode and HTTP errors', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response('"wrong"'),
  )
  const client = createClashClient({ baseUrl: 'https://example.test/', fetch })
  const transport = client.extend((transport) => transport)
  expect(() =>
    transport.void({ method: 'GET', path: ['x'], json: null }),
  ).toThrow(InputError)
  expect(() =>
    // @ts-expect-error JavaScript callers must not send ambiguous bodies.
    transport.void({
      method: 'POST',
      path: ['x'],
      json: null,
      bytes: new Uint8Array(),
    }),
  ).toThrow(InputError)
  await expect(
    transport.void({ method: 'GET', path: ['..'] }),
  ).rejects.toBeInstanceOf(InputError)
  expect(fetch).not.toHaveBeenCalled()
  await expect(
    transport.json({ method: 'GET', path: ['x'] }, decodeCount),
  ).rejects.toBeInstanceOf(DecodeError)
  fetch.mockImplementation(async () => new Response('no', { status: 403 }))
  await expect(
    transport.void({ method: 'GET', path: ['x'] }),
  ).rejects.toBeInstanceOf(HttpError)
  client.dispose()
})

it('shares cancellation, timeout, body cleanup and disposal with the client', async () => {
  const cancelled = vi.fn()
  const started = vi.fn()
  const client = createClashClient({
    baseUrl: 'https://example.test/',
    requestTimeoutMs: 10,
    fetch: async () =>
      new Response(new ReadableStream({ start: started, cancel: cancelled })),
  })
  const transport: ExtensionTransport = client.extend((transport) => transport)
  const request = { method: 'GET', path: ['x'] } satisfies Parameters<
    ExtensionTransport['bytes']
  >[0]
  await expect(transport.bytes(request)).rejects.toBeInstanceOf(TimeoutError)
  const controller = new AbortController()
  const aborted = transport.bytes(request, {
    signal: controller.signal,
    timeoutMs: 0,
  })
  controller.abort()
  await expect(aborted).rejects.toBeInstanceOf(AbortError)
  const pending = transport.bytes(request, { timeoutMs: 0 })
  // Allow the response body read to start before disposal.
  await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(3))
  client.dispose()
  await expect(pending).rejects.toBeInstanceOf(ClientDisposedError)
  await expect(transport.bytes(request)).rejects.toBeInstanceOf(
    ClientDisposedError,
  )
  expect(() => client.extend(() => ({}))).toThrow(ClientDisposedError)
  expect(cancelled).toHaveBeenCalled()
})
