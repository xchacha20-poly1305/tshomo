export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}
export interface DelayOptions {
  url?: string
  timeoutMs?: number
  expectedStatus?: string
}
export type CapabilityState = 'supported' | 'unsupported' | 'unknown'
export type Capability =
  | 'system.hello'
  | 'system.getVersion'
  | 'system.gc'
  | 'system.restart'
  | 'system.upgradeCore'
  | 'system.upgradeUi'
  | 'system.updateGeo'
  | 'configs.get'
  | 'configs.patch'
  | 'configs.load'
  | 'configs.reload'
  | 'configs.updateGeo'
  | 'proxies.list'
  | 'proxies.get'
  | 'proxies.select'
  | 'proxies.clearFixed'
  | 'proxies.delay'
  | 'groups.list'
  | 'groups.get'
  | 'groups.delay'
  | 'proxyProviders.list'
  | 'proxyProviders.get'
  | 'proxyProviders.update'
  | 'proxyProviders.healthCheck'
  | 'proxyProviders.getProxy'
  | 'proxyProviders.delayProxy'
  | 'rules.list'
  | 'rules.disableByIndex'
  | 'ruleProviders.list'
  | 'ruleProviders.update'
  | 'connections.snapshot'
  | 'connections.close'
  | 'connections.closeAll'
  | 'connections.watch'
  | 'dns.query'
  | 'cache.flushFakeIp'
  | 'cache.flushDns'
  | 'metrics.trafficSample'
  | 'metrics.memorySample'
  | 'metrics.watchTraffic'
  | 'metrics.watchMemory'
  | 'logs.watch'
  | 'storage.getBytes'
  | 'storage.putBytes'
  | 'storage.delete'
  | 'storage.getJson'
  | 'storage.putJson'
export interface SocketEvents {
  open: unknown
  message: { readonly data: unknown }
  error: unknown
  close: { readonly code: number }
}
export interface ClashSocket {
  readonly readyState: number
  addEventListener<K extends keyof SocketEvents>(
    type: K,
    listener: (event: SocketEvents[K]) => void,
  ): void
  removeEventListener<K extends keyof SocketEvents>(
    type: K,
    listener: (event: SocketEvents[K]) => void,
  ): void
  close(): void
}
/** The URL contains the token. Factories must not log it. */
export type WebSocketFactory = (url: string) => ClashSocket
export interface ClashClientOptions {
  baseUrl: string
  secret?: string
  fetch?: typeof globalThis.fetch
  webSocketFactory?: WebSocketFactory
  requestTimeoutMs?: number
  capabilities?: Partial<Record<Capability, CapabilityState>>
}
export type StreamState =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed'
export interface ClashStream<T> extends AsyncIterable<T, undefined, undefined> {
  readonly state: StreamState
  close(): void
}
export interface StreamOptions {
  signal?: AbortSignal
  transport?: 'websocket' | 'http-json'
  connectTimeoutMs?: number
  idleTimeoutMs?: number
  maxFrameBytes?: number
  reconnect?:
    | false
    | { maxAttempts: number; initialDelayMs?: number; maxDelayMs?: number }
  onStateChange?: (state: StreamState) => void
}
export interface ConnectionsWatchOptions extends Omit<
  StreamOptions,
  'transport'
> {
  transport?: 'websocket'
  intervalMs?: number
}
export interface LogsWatchOptions extends StreamOptions {
  level?: string
}
export interface SampleOptions extends StreamOptions {
  timeoutMs?: number
}
export type ConfigLoadInput =
  { path: string; payload?: never } | { payload: string; path?: never }
export interface ConfigLoadOptions {
  force?: boolean
}
export interface UpgradeOptions {
  channel?: string
  force?: boolean
}
