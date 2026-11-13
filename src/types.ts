export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface WireObject {
  [key: string]: unknown
}
export interface Hello extends WireObject {
  hello: string
}
export interface Version extends WireObject {
  version: string
  premium?: boolean
  meta?: boolean
}
export interface MaintenanceResult extends WireObject {
  status: string
}
export interface TunConfig extends WireObject {
  enable?: boolean
  stack?: string
  device?: string
  'auto-route'?: boolean
  'auto-detect-interface'?: boolean
}
export interface Config extends WireObject {
  port?: number
  'socks-port'?: number
  'redir-port'?: number
  'tproxy-port'?: number
  'mixed-port'?: number
  'allow-lan'?: boolean
  'bind-address'?: string
  mode?: string
  modes?: string[]
  'mode-list'?: string[]
  'log-level'?: string
  ipv6?: boolean
  tun?: TunConfig
}
export type TunPatch = {
  [key: string]: JsonValue | undefined
  enable?: boolean
  stack?: string
  device?: string
  'auto-route'?: boolean
  'auto-detect-interface'?: boolean
}
export type JsonInput =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonInput | undefined }
export interface ConfigPatch {
  [key: string]: JsonInput | undefined
  port?: number
  'socks-port'?: number
  'redir-port'?: number
  'tproxy-port'?: number
  'mixed-port'?: number
  'allow-lan'?: boolean
  'bind-address'?: string
  mode?: string
  modes?: string[]
  'mode-list'?: string[]
  'log-level'?: string
  ipv6?: boolean
  tun?: TunPatch
}
export interface Delay extends WireObject {
  delay: number
}
export interface DelayHistory extends WireObject {
  time: string
  delay: number
}
export interface Proxy extends WireObject {
  name: string
  type: string
  udp?: boolean
  xudp?: boolean
  now?: string
  fixed?: string
  all?: string[]
  extra?: Record<string, unknown>
  history?: DelayHistory[]
  testUrl?: string
  icon?: string
  hidden?: boolean
  selectable?: boolean
}
export interface ProxyGroup extends Proxy {
  all: string[]
}

export function isProxyGroup(proxy: Proxy): proxy is ProxyGroup {
  return Array.isArray(proxy.all)
}

export interface SubscriptionLower extends WireObject {
  upload?: number
  download?: number
  total?: number
  expire?: number
}
export interface SubscriptionUpper extends WireObject {
  Upload?: number
  Download?: number
  Total?: number
  Expire?: number
}
export type SubscriptionInfo = SubscriptionLower | SubscriptionUpper

/** Bytes and Unix seconds, unchanged from the wire. Uppercase fields take precedence. */
export function readSubscriptionInfo(info: SubscriptionInfo): {
  upload?: number
  download?: number
  total?: number
  expire?: number
} {
  const out: {
    upload?: number
    download?: number
    total?: number
    expire?: number
  } = {}
  const fields: ['upload' | 'download' | 'total' | 'expire', string][] = [
    ['upload', 'Upload'],
    ['download', 'Download'],
    ['total', 'Total'],
    ['expire', 'Expire'],
  ]
  for (const [lower, upper] of fields) {
    const value = typeof info[upper] === 'number' ? info[upper] : info[lower]
    if (typeof value === 'number') {
      out[lower] = value
    }
  }
  return out
}

export interface ProxyProvider extends WireObject {
  name: string
  type?: string
  vehicleType?: string
  updatedAt?: string
  proxies?: Proxy[]
  testUrl?: string
  expectedStatus?: string
  subscriptionInfo?: SubscriptionInfo
}
export interface RuleProvider extends WireObject {
  name: string
  type?: string
  vehicleType?: string
  updatedAt?: string
  behavior?: string
  format?: string
  ruleCount?: number
  payload?: string[]
}
export interface Rule extends WireObject {
  type: string
  payload: string
  proxy: string
  size?: number
  uuid?: string
  index?: number
  disabled?: boolean
  extra?: RuleExtra
}
export interface RuleExtra extends WireObject {
  disabled?: boolean
  hitCount?: number
  missCount?: number
  hitAt?: string
  missAt?: string
}
export interface ConnectionMetadata extends WireObject {
  network?: string
  type?: string
  sourceIP?: string
  destinationIP?: string
  sourcePort?: string | number
  destinationPort?: string | number
  inboundPort?: string | number
  host?: string
  dnsMode?: string
  processPath?: string
}
export interface Connection extends WireObject {
  id: string
  metadata: ConnectionMetadata
  upload: number
  download: number
  start: string | number
  chains: string[]
  rule?: string
  rulePayload?: string
}
export interface ConnectionsSnapshot extends WireObject {
  downloadTotal: number
  uploadTotal: number
  connections: Connection[] | null
  memory?: number
}
export interface Traffic extends WireObject {
  up: number
  down: number
}
export interface Memory extends WireObject {
  inuse: number
  oslimit?: number
}
export interface Log extends WireObject {
  type: string
  payload: string
}
export interface DnsQuestion extends WireObject {
  Name: string
  Qtype: number
  Qclass: number
}
export interface DnsRecordLower extends WireObject {
  name: string
  type: number
  ttl: number
  data: string
}
export interface DnsRecordUpper extends WireObject {
  name: string
  type: number
  TTL: number
  data: string
}
export type DnsRecord = DnsRecordLower | DnsRecordUpper
export interface DnsBase extends WireObject {
  server?: string
  TC?: boolean
  RD?: boolean
  RA?: boolean
  AD?: boolean
  CD?: boolean
  Answer?: DnsRecord[]
  Authority?: DnsRecord[]
  Additional?: DnsRecord[]
}
export type DnsResponse = DnsBase &
  (
    | { Status: number; Question: DnsQuestion[] }
    | { status: number; Question: DnsQuestion[] }
    | { status: number; question: DnsQuestion[] }
  )
