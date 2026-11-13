import {
  createClashClient,
  type ConfigPatch,
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
