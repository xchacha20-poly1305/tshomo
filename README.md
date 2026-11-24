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

Smart, reF1nd, honk, and script APIs are outside the core API scope. Optional
reF1nd and Smart example extensions are available below. Compatibility tests combine local
HTTP/WebSocket fixtures with real embedded sing-box and mihomo servers; see
[fixture provenance](test/fixtures/README.md) and
[kernel compatibility tests](#kernel-compatibility-tests).

## Caller-defined extensions

The tshomo core does not identify forks or maintain a registry of their markers
and features. Responses retain unknown fields so callers can implement their own
detection. A marker is evidence for the caller to interpret; tshomo does not
infer capabilities from branding or automatically probe custom endpoints.

Use `client.extend(factory)` to define custom operations. The factory runs
synchronously and returns your inferred extension type without changing the
client's built-in resources:

```ts
import type { RequestOptions } from 'tshomo'

const custom = client.extend((transport) => ({
  async detect(options?: RequestOptions) {
    const version = await client.system.getVersion(options)
    return version['custom-marker'] === true
  },
  getCount(options?: RequestOptions) {
    return transport.json(
      { method: 'GET', path: ['custom', 'count'] },
      (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error('Expected a finite count')
        }
        return value
      },
      options,
    )
  },
}))

if (await custom.detect()) {
  console.log(await custom.getCount())
}
```

The example marker and endpoint are caller-defined. You can also inspect proxy,
rule, or other response fields in ordinary functions without creating an extension.

`ExtensionTransport` exposes `json(request, decoder, options?)`,
`bytes(request, options?)`, and `void(request, options?)`. Requests specify an HTTP
method, raw `path` segments relative to the base URL, optional `query`, and either
`json` or `bytes` as a body. GET and HEAD requests cannot carry bodies. Each path
segment is encoded separately; pass names as raw strings rather than pre-encoding
them. JSON bodies use `Content-Type: application/json`; byte bodies have no
Content-Type header. `json` requires a `Decoder<T>` that validates an `unknown`
response. Decoder failures become `DecodeError`; business response semantics are
entirely the extension's responsibility.

Extensions share the client's authentication, fetch implementation, request
timeout, cancellation, HTTP errors, and response cleanup. `client.dispose()`
cancels pending extension requests and rejects subsequent requests. The transport
does not expose credentials or accept arbitrary URLs or headers. Core
`capabilities` settings apply to built-in operations; callers own any capability
policy for their extensions. Extension factories can be reused across clients,
and the public `ExtensionFactory<T>`, `ExtensionTransport`, and `ExtensionRequest`
types allow them to be distributed as separate packages.

### Published example: reF1nd

`tshomo/extensions/refind` is an opt-in submodule shipped in the same package.
It demonstrates a reusable extension using only tshomo's public API. The core
entry point neither imports nor registers it.

```ts
import { createClashClient } from 'tshomo'
import { isRefindRule, refind } from 'tshomo/extensions/refind'

const client = createClashClient({ baseUrl: 'http://127.0.0.1:9090' })
const extension = client.extend(refind)
try {
  const rules = await client.rules.list()
  const toggleable = rules.filter(isRefindRule)
  // Show these rules in your UI. On an explicit user toggle:
  const selected = toggleable.find((rule) => rule.uuid === selectedUuid)
  if (selected) {
    await extension.rules.toggleByUuid(selected.uuid)
    const refreshed = await client.rules.list()
    console.log(refreshed)
  }
} finally {
  client.dispose()
}
```

`selectedUuid` is supplied by your application. `isRefindRule(rule)` narrows a
core `Rule` to `RefindRule` by checking for a nonempty UUID. This checks response
shape, not backend identity or endpoint support; the application decides whether
to enable the extension. Other rules remain available through `client.rules`.

The extension implements `rules.toggleByUuid(uuid, options?)` via
`PUT /rules/{uuid}` with no request body and a 204 response. This endpoint flips
the server's current state; it does not accept a desired `disabled` value.
Do not automatically retry it after an ambiguous failure. Re-read rules to
reconcile state. `disabled` can be omitted when false; test it with `=== true`.
The server includes both DNS and routing rules in `GET /rules`.

Protocol references: reF1nd/sing-box
[stable rules implementation](https://github.com/reF1nd/sing-box/blob/732618a5989cd2566f072c374fe2f619200f33f9/experimental/clashapi/rules.go)
and [testing rules implementation](https://github.com/reF1nd/sing-box/blob/17397d022647b73378705e1f91ff031dddaaec21/experimental/clashapi/rules.go).
Tests reproduce these contracts using a local server. The kernel suite also
checks UUID toggles against a real reF1nd-testing-next test server at revision
`56e25a64031f8130995f87abdc05ff5ed24fdd55`. Other custom reF1nd endpoints are
outside this example's scope.
See [examples/refind.ts](examples/refind.ts) for a caller-side helper.

### Published example: Smart

`tshomo/extensions/smart` is an opt-in submodule shipped in the same package for
`vernesong/mihomo` Smart endpoints. It uses only tshomo's public API and is not
imported or registered by the core entry point.

```ts
import { createClashClient } from 'tshomo'
import { isSmartConnection, isSmartGroup, smart } from 'tshomo/extensions/smart'

const client = createClashClient({ baseUrl: 'http://127.0.0.1:9090' })
const extension = client.extend(smart)
try {
  const proxies = await client.proxies.list()
  const smartGroups = Object.values(proxies).filter(isSmartGroup)
  const snapshot = await extension.groups.listWeights()
  console.log(smartGroups.length, snapshot.weights)

  const active = await client.connections.snapshot()
  const blockable = (active.connections ?? []).filter(
    (conn) => isSmartConnection(conn) && conn.metadata.smartBlock === 'normal',
  )
  if (blockable[0]) {
    await extension.connections.block(blockable[0].id)
  }
} finally {
  client.dispose()
}
```

Core `client.proxies.select`, `client.proxies.clearFixed`, and
`client.groups.delay` already work on Smart groups. `isSmartGroup(proxy)` and
`isSmartConnection(connection)` check wire shapes (`type === 'Smart'` with a
string `all` array, and non-empty `metadata.smartBlock`), not backend identity.

The extension implements:

- `groups.listWeights(options?)` via `GET /group/weights`: normalizes Go `nil`
  per-group slices (`null`) to `[]` while preserving `errors`, `message`, and
  unknown wire fields.
- `groups.getWeights(name, options?)` via `GET /group/{name}/weights`: unwraps
  `weights` (normalizing `null` to `[]`).
- `cache.flushSmart(options?)` via `POST /cache/smart/flush` (204).
- `cache.flushSmartConfig(config, options?)` via
  `POST /cache/smart/flush/{config}` (204).
- `connections.block(id, options?)` via `DELETE /connections/smart/{id}` (204):
  marks `smartBlock` as `"blocked"` and closes the connection.
- `system.upgradeLgbm(options?)` via `POST /upgrade/lgbm`: decodes
  `MaintenanceResult` and rejects non-`ok` statuses with `OperationError`
  (omitted by the server when running in `embedMode`).

Protocol references: `vernesong/mihomo` (`Alpha` branch, commit
`1348c4d2dee81f6941443b3d8b8a78a602b3d89c`)
[groups.go](https://github.com/vernesong/mihomo/blob/1348c4d2dee81f6941443b3d8b8a78a602b3d89c/hub/route/groups.go),
[cache.go](https://github.com/vernesong/mihomo/blob/1348c4d2dee81f6941443b3d8b8a78a602b3d89c/hub/route/cache.go),
[connections.go](https://github.com/vernesong/mihomo/blob/1348c4d2dee81f6941443b3d8b8a78a602b3d89c/hub/route/connections.go),
and
[upgrade.go](https://github.com/vernesong/mihomo/blob/1348c4d2dee81f6941443b3d8b8a78a602b3d89c/hub/route/upgrade.go).
The kernel suite also checks Smart groups, weights, cache flushes, LightGBM
model updates, and connection blocking against a real `vernesong/mihomo` test
server at revision `1348c4d2dee81f6941443b3d8b8a78a602b3d89c`.
See [examples/smart.ts](examples/smart.ts) for caller-side helpers.

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

## Kernel compatibility tests

`bun run test:kernels` builds and starts two real Go test servers, one using
sing-box replaced with reF1nd/sing-box `reF1nd-testing-next`, the other using
mihomo replaced with `vernesong/mihomo` `Alpha` (`1348c4d2dee81f6941443b3d8b8a78a602b3d89c`).
The dependencies and checksums are pinned in separate Go modules under
[`test/servers/`](test/servers/README.md). This suite also runs in CI.

The shared client tests cover configurations, empty and populated lists, proxy
selection and delays, providers, rules, DNS, connection snapshots and closure,
Bearer and WebSocket authentication, and traffic/memory/log subscriptions over
WebSocket and HTTP JSON. Storage round trips run against mihomo; the pinned
sing-box branch returns HTTP 404 for that optional API. Kernel-specific rule
operations are tested explicitly; there is no automatic fork detection.

The test servers have separate temporary data directories, dynamically assigned
loopback ports, a local DNS responder and a local HTTPS delay target. They do not
use a host daemon, enable TUN, or change the system proxy. Restart, configuration
file reload, core/UI upgrades and geodata downloads are outside this suite.

## Development

Use Bun 1.4.4 for dependency management and scripts.

```sh
bun run typecheck     # Check source, tests, and examples
bun run lint          # ESLint and Prettier checks
bun run test          # Vitest unit and local integration tests
bun run test:package  # Build and verify the packed distribution
bun run test:kernels  # Build real Go test servers and run both kernel contracts
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
