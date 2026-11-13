import {
  refind,
  isRefindRule,
  type RefindExtension,
  type RefindRule,
} from '../../src/extensions/refind.js'
import {
  createClashClient,
  type ConfigPatch,
  type Config,
  type DnsResponse,
  type Connection,
  type Proxy,
  type ProxyGroup,
  isProxyGroup,
} from '../../src/index.js'

const client = createClashClient({
  baseUrl: 'https://example.invalid/controller/',
})
const patch: ConfigPatch = {
  'mixed-port': 7890,
  tun: { enable: true, extension: { value: 1 } },
  future: ['field'],
}
void client.configs.patch(patch)
// @ts-expect-error Known field remains numeric.
const bad: ConfigPatch = { 'mixed-port': '7890' }
// @ts-expect-error Known nested field remains boolean.
const badTun: ConfigPatch = { tun: { enable: 'yes' } }
void bad
void badTun

async function declarations(proxy: Proxy, connection: Connection) {
  // @ts-expect-error Connections are not an HTTP JSON stream.
  client.connections.watch({ transport: 'http-json' })
  const group: Record<string, number> = await client.groups.delay('group')
  const single: number = (await client.proxies.delay('proxy')).delay
  const groups: Proxy[] = await client.groups.list()
  // @ts-expect-error No Axios response envelope.
  ;(await client.system.getVersion()).data.version
  // @ts-expect-error Unknown extension requires narrowing.
  proxy.future.method()
  if (isProxyGroup(proxy)) {
    const narrowed: ProxyGroup = proxy
    narrowed.all.join(',')
  }
  const port: string | number | undefined = connection.metadata.sourcePort
  const stored: string = await client.storage.getJson('key', (value) => {
    if (typeof value !== 'string') {
      throw new Error('not string')
    }
    return value
  })
  return { group, single, groups, port, stored }
}

void declarations

async function streamTypes() {
  const result = await client.metrics
    .watchTraffic()
    [Symbol.asyncIterator]()
    .next()
  // @ts-expect-error A completed stream has no value; check done first.
  const unchecked: number = result.value.up
  // @ts-expect-error Iterator values must not leak any through the return type.
  const wrong: string = result.value
  if (!result.done) {
    const up: number = result.value.up
    // @ts-expect-error Yielded traffic fields remain numeric.
    const badUp: string = result.value.up
    void up
    void badUp
  } else {
    const completed: undefined = result.value
    void completed
  }
  void unchecked
  void wrong
}

void streamTypes

const extension = client.extend((transport) => {
  // @ts-expect-error The extension facade does not expose credentials.
  void transport.secret
  return {
    count: () =>
      transport.json({ method: 'GET', path: ['custom'] }, (value) => {
        if (typeof value !== 'number') {
          throw new Error('Expected a number')
        }
        return value
      }),
  }
})
const count: Promise<number> = extension.count()
// @ts-expect-error The decoder determines the response type.
const wrongCount: Promise<string> = extension.count()
void count
void wrongCount

const refindClient: RefindExtension = client.extend(refind)
const toggled: Promise<void> = refindClient.rules.toggleByUuid('uuid')
// @ts-expect-error Toggle does not accept a target disabled state.
void refindClient.rules.toggleByUuid('uuid', true)

function narrowRefindRule(rule: import('../../src/index.js').Rule) {
  if (isRefindRule(rule)) {
    const narrowed: RefindRule = rule
    const uuid: string = narrowed.uuid
    return uuid
  }
  return undefined
}

void toggled
void narrowRefindRule

const singBoxConfig: Config = {
  tun: null,
}
const invalidConfig: Config = {
  tun: {
    // @ts-expect-error Known TUN fields still require their declared types.
    enable: 'yes',
  },
}
const invalidTunValue: Config = {
  // @ts-expect-error TUN is nullable, not an arbitrary primitive.
  tun: false,
}
const emptyGroup: Proxy = {
  name: 'empty',
  type: 'LoadBalance',
  all: null,
}
// @ts-expect-error Null group membership must be narrowed before array access.
emptyGroup.all.join(',')
const singBoxDns: DnsResponse = {
  Status: 0,
  Question: [],
  Server: 'internal',
}
const invalidDns: DnsResponse = {
  Status: 0,
  Question: [],
  // @ts-expect-error The capitalized DNS server field is typed too.
  Server: 42,
}
void singBoxConfig
void invalidConfig
void invalidTunValue
void singBoxDns
void invalidDns
