import { DecodeError } from './errors.js'
import type {
  Config,
  Connection,
  ConnectionMetadata,
  ConnectionsSnapshot,
  Delay,
  DelayHistory,
  DnsQuestion,
  DnsRecord,
  DnsResponse,
  Hello,
  JsonValue,
  Log,
  MaintenanceResult,
  Memory,
  Proxy,
  ProxyProvider,
  Rule,
  RuleExtra,
  RuleProvider,
  SubscriptionInfo,
  Traffic,
  TunConfig,
  Version,
} from './types.js'

export type Decoder<T> = (value: unknown) => T
export type Guard<T> = (value: unknown) => value is T
export const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
export const string = (v: unknown): v is string => typeof v === 'string'
export const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const boolean = (v: unknown): v is boolean => typeof v === 'boolean'
const port = (v: unknown): v is string | number => string(v) || number(v)
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (v): v is T[] => Array.isArray(v) && v.every(guard)
}
export function optional(
  v: Record<string, unknown>,
  keys: string[],
  guard: (v: unknown) => boolean,
): boolean {
  return keys.every((key) => !Object.hasOwn(v, key) || guard(v[key]))
}
function fields(
  v: unknown,
  strings: string[] = [],
  numbers: string[] = [],
  booleans: string[] = [],
): v is Record<string, unknown> {
  return (
    object(v) &&
    optional(v, strings, string) &&
    optional(v, numbers, number) &&
    optional(v, booleans, boolean)
  )
}
export function decoder<T>(guard: Guard<T>, label: string): Decoder<T> {
  return (v) => {
    if (!guard(v)) {
      throw new DecodeError(`Invalid ${label}`)
    }
    return v
  }
}
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new DecodeError('Invalid JSON response')
  }
}
export const isJson: Guard<JsonValue> = (v): v is JsonValue =>
  v === null ||
  string(v) ||
  boolean(v) ||
  number(v) ||
  (Array.isArray(v)
    ? v.every(isJson)
    : object(v) && Object.values(v).every(isJson))
export const json = decoder(isJson, 'JSON value')
export const hello = decoder(
  (v): v is Hello => object(v) && string(v.hello),
  'hello',
)
export const version = decoder(
  (v): v is Version =>
    object(v) && string(v.version) && optional(v, ['premium', 'meta'], boolean),
  'version',
)
export const maintenance = decoder(
  (v): v is MaintenanceResult => object(v) && string(v.status),
  'maintenance result',
)
const tun = (v: unknown): v is TunConfig =>
  fields(
    v,
    ['stack', 'device'],
    [],
    ['enable', 'auto-route', 'auto-detect-interface'],
  )
export const config = decoder(
  (v): v is Config =>
    fields(
      v,
      ['mode', 'log-level', 'bind-address'],
      ['port', 'socks-port', 'redir-port', 'tproxy-port', 'mixed-port'],
      ['allow-lan', 'ipv6'],
    ) &&
    optional(v, ['tun'], tun) &&
    optional(v, ['modes', 'mode-list'], array(string)),
  'config',
)
const history = (v: unknown): v is DelayHistory =>
  object(v) && string(v.time) && number(v.delay)
export const isProxy = (v: unknown): v is Proxy =>
  fields(
    v,
    ['now', 'fixed', 'testUrl', 'icon'],
    [],
    ['udp', 'xudp', 'hidden', 'selectable'],
  ) &&
  string(v.name) &&
  string(v.type) &&
  optional(v, ['all'], array(string)) &&
  optional(v, ['extra'], object) &&
  optional(v, ['history'], array(history))
export const proxy = decoder(isProxy, 'proxy')
export const delay = decoder(
  (v): v is Delay => object(v) && number(v.delay),
  'delay',
)
export function map<T>(guard: Guard<T>): Decoder<Record<string, T>> {
  return decoder(
    (v): v is Record<string, T> => object(v) && Object.values(v).every(guard),
    'resource map',
  )
}
export function envelope<T>(key: string, decode: Decoder<T>): Decoder<T> {
  return (v) => {
    if (!object(v) || !Object.hasOwn(v, key)) {
      throw new DecodeError(`Missing ${key}`)
    }
    return decode(v[key])
  }
}
const subscription = (v: unknown): v is SubscriptionInfo =>
  fields(
    v,
    [],
    [
      'upload',
      'download',
      'total',
      'expire',
      'Upload',
      'Download',
      'Total',
      'Expire',
    ],
  )
const providerBase = (v: unknown): v is Record<string, unknown> =>
  fields(v, ['type', 'vehicleType', 'updatedAt']) && string(v.name)
export const isProxyProvider = (v: unknown): v is ProxyProvider =>
  providerBase(v) &&
  optional(v, ['proxies'], array(isProxy)) &&
  optional(v, ['subscriptionInfo'], subscription) &&
  optional(v, ['testUrl', 'expectedStatus'], string)
export const proxyProvider = decoder(isProxyProvider, 'proxy provider')
const isRuleProvider = (v: unknown): v is RuleProvider =>
  providerBase(v) &&
  optional(v, ['behavior', 'format'], string) &&
  optional(v, ['ruleCount'], number) &&
  optional(v, ['payload'], array(string))
export const ruleProviders: Decoder<Record<string, RuleProvider>> = envelope(
  'providers',
  (v) => {
    if (array(string)(v)) {
      return Object.fromEntries(v.map((name) => [name, { name }]))
    }
    return map(isRuleProvider)(v)
  },
)
const ruleExtra = (v: unknown): v is RuleExtra =>
  fields(v, ['hitAt', 'missAt'], ['hitCount', 'missCount'], ['disabled'])
const isRule = (v: unknown): v is Rule =>
  fields(v, ['uuid'], ['size', 'index'], ['disabled']) &&
  string(v.type) &&
  string(v.payload) &&
  string(v.proxy) &&
  optional(v, ['extra'], ruleExtra)
export const rules = envelope('rules', decoder(array(isRule), 'rules'))
const metadata = (v: unknown): v is ConnectionMetadata =>
  fields(v, [
    'network',
    'type',
    'sourceIP',
    'destinationIP',
    'host',
    'dnsMode',
    'processPath',
  ]) && optional(v, ['sourcePort', 'destinationPort', 'inboundPort'], port)
const connection = (v: unknown): v is Connection =>
  fields(v, ['rule', 'rulePayload']) &&
  string(v.id) &&
  metadata(v.metadata) &&
  number(v.upload) &&
  number(v.download) &&
  port(v.start) &&
  array(string)(v.chains)
export const connections = decoder(
  (v): v is ConnectionsSnapshot =>
    object(v) &&
    number(v.downloadTotal) &&
    number(v.uploadTotal) &&
    (v.connections === null || array(connection)(v.connections)) &&
    optional(v, ['memory'], number),
  'connections snapshot',
)
export const traffic = decoder(
  (v): v is Traffic => object(v) && number(v.up) && number(v.down),
  'traffic',
)
export const memory = decoder(
  (v): v is Memory =>
    object(v) && number(v.inuse) && optional(v, ['oslimit'], number),
  'memory',
)
export const log = decoder(
  (v): v is Log => object(v) && string(v.type) && string(v.payload),
  'log',
)
const question = (v: unknown): v is DnsQuestion =>
  object(v) && string(v.Name) && number(v.Qtype) && number(v.Qclass)
const rr = (v: unknown): v is DnsRecord =>
  object(v) &&
  string(v.name) &&
  number(v.type) &&
  string(v.data) &&
  (number(v.TTL) || number(v.ttl)) &&
  optional(v, ['TTL', 'ttl'], number)
export const dns = decoder(
  (v): v is DnsResponse =>
    fields(v, ['server'], [], ['TC', 'RD', 'RA', 'AD', 'CD']) &&
    optional(v, ['Answer', 'Authority', 'Additional'], array(rr)) &&
    optional(v, ['Status', 'status'], number) &&
    optional(v, ['Question', 'question'], array(question)) &&
    ((number(v.Status) && array(question)(v.Question)) ||
      (number(v.status) &&
        (array(question)(v.Question) || array(question)(v.question)))),
  'DNS response',
)
