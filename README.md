# tshomo

A framework-independent TypeScript ESM client for Clash-compatible controller APIs.
It provides typed resource methods, response validation, cancellable requests, and
async iterable subscriptions without runtime package dependencies.

## Getting started

The package is currently private (`0.0.0`). Build and pack it from this checkout:

```sh
bun install --frozen-lockfile
bun run build
bun pm pack
```

Install the generated archive in your application:

```sh
bun add /absolute/path/to/tshomo/tshomo-0.0.0.tgz
```

Use Node.js 22 or newer, or a browser with Fetch and WebSocket support. The package
exports ESM and TypeScript declarations; there is no CommonJS entry point.

```ts
import { createClashClient } from 'tshomo'

const client = createClashClient({
  baseUrl: 'http://127.0.0.1:9090',
  secret: 'your-controller-secret',
})

try {
  const version = await client.system.getVersion()
  const proxies = await client.proxies.list()
  console.log(version.version, Object.keys(proxies))
} finally {
  client.dispose()
}
```

`baseUrl` must be an absolute HTTP(S) URL without embedded credentials, query
parameters, or a fragment. Reverse-proxy path prefixes such as
`https://example.com/controller/` are preserved. Omit `secret` for a controller
that does not require authentication. Creating a client performs no network I/O.

## Resources

Methods are grouped by resource on the client:

| Resource         | Operations                                                          |
| ---------------- | ------------------------------------------------------------------- |
| `system`         | Greeting, version, garbage collection, restart, core/UI/geo updates |
| `configs`        | Read, patch, load, reload, and update geo data                      |
| `proxies`        | List, inspect, select, clear fixed selection, and measure delay     |
| `groups`         | List, inspect, and measure group delays                             |
| `proxyProviders` | List, inspect, update, health-check, and test provider proxies      |
| `ruleProviders`  | List and update                                                     |
| `rules`          | List and enable/disable by index                                    |
| `connections`    | Snapshot, watch, close one, and close all                           |
| `metrics`        | Traffic/memory samples and subscriptions                            |
| `logs`           | Subscribe with an optional level filter                             |
| `dns`, `cache`   | DNS queries and DNS/FakeIP cache flushing                           |
| `storage`        | Read, write, and delete bytes or JSON                               |

For example, select a proxy or update configuration:

```ts
await client.proxies.select('GLOBAL', 'DIRECT')
await client.configs.patch({ 'mixed-port': 7890, tun: { enable: true } })
```

The controller determines which operations are available. This client does not
automatically detect capabilities. Declare known unavailable methods with
`capabilities: { 'system.restart': 'unsupported' }` when creating a client to
reject them locally. Unspecified capabilities are attempted normally.

Smart, refind, honk, and script APIs are outside the current scope. Compatibility
tests use local servers and source-derived fixtures, not live controller runs;
see [fixture provenance](test/fixtures/README.md).

## Subscriptions and cleanup

Streams connect when iteration starts and support one consumer. WebSocket is the
default transport. Logs, traffic, and memory also support explicit
`transport: 'http-json'` for controllers that expose streaming JSON over HTTP;
connection subscriptions require WebSocket. There is no automatic transport fallback.

```ts
const traffic = client.metrics.watchTraffic({
  reconnect: { maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 5000 },
})

try {
  for await (const sample of traffic) {
    console.log(sample.up, sample.down)
    // Replace this condition with your application's stop condition.
    break
  }
} finally {
  traffic.close()
  client.dispose()
}
```

Reconnect is opt-in. Stream options include `signal`, `connectTimeoutMs`,
`idleTimeoutMs`, `maxFrameBytes`, and `onStateChange`. Metric and connection
streams retain the latest pending snapshot. Logs queue up to 256 entries, then
fail with `BufferOverflowError` if the consumer falls behind.

`break` closes an iterator. Call `stream.close()` to stop one subscription, or
`client.dispose()` to close all subscriptions and cancel pending requests.
Disposed clients cannot be reused. For coordinated subscriptions, see
[`examples/dashboard.ts`](examples/dashboard.ts).

## Requests and errors

The default request timeout is 15 seconds. Set `requestTimeoutMs` on the client,
or pass `{ signal, timeoutMs }` as a method's request options. A request timeout
of `0` disables its timer. For example:

```ts
import { ClashError, HttpError } from 'tshomo'

try {
  await client.configs.get({ timeoutMs: 5000 })
} catch (error) {
  if (error instanceof HttpError) {
    console.error('Controller returned HTTP', error.status)
  } else if (error instanceof ClashError) {
    console.error(error.kind, error.message)
  } else {
    throw error
  }
}
```

Error subclasses distinguish input, HTTP, network, timeout, cancellation,
decoding, capability, and stream failures. Catch `ClashError` for its stable
`kind` discriminator. A custom `fetch` or `webSocketFactory` can be supplied in
client options.

## Browser configuration

HTTP authentication uses `Authorization: Bearer …`; WebSocket authentication
uses the `token` query parameter. Do not log URLs received by a custom WebSocket
factory. Configure cross-origin controllers to allow your application's origin,
methods, and authorization/content-type headers. HTTPS applications should use
an HTTPS controller endpoint, which produces WSS subscription URLs.

## Development

Use Bun 1.4.4 for dependency management and scripts.

```sh
bun run typecheck     # Check source, tests, and examples
bun run lint          # ESLint and Prettier checks
bun run test          # Vitest unit and local integration tests
bun run test:package  # Build and verify the packed distribution
bun run format       # Apply formatting
```

Install Playwright browsers and system dependencies on a supported Linux system,
then run the browser suite:

```sh
bun run playwright install --with-deps chromium firefox webkit
bun run test:browser
```

See [AGENTS.md](AGENTS.md) for project structure and coding conventions.

## License

[MIT](LICENSE)
