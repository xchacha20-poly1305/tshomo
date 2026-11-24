import {
  DecodeError,
  InputError,
  isProxyGroup,
  OperationError,
  type Connection,
  type ConnectionMetadata,
  type ExtensionTransport,
  type MaintenanceResult,
  type Proxy,
  type ProxyGroup,
  type RequestOptions,
  type WireObject,
} from '../index.js'

export type SmartUsageRank = 'MostUsed' | 'OccasionalUsed' | 'RarelyUsed'

export type SmartBlockState = 'normal' | 'degraded' | 'blocked'

/** A Smart outbound proxy group serialized by vernesong/mihomo. */
export interface SmartGroup extends ProxyGroup {
  type: 'Smart'
  expectedStatus?: string
  emptyFallback?: string
  'policy-priority'?: string
  useLightGBM?: boolean
  collectData?: boolean
  sampleRate?: number
  preferASN?: boolean
  tolerance?: number
}

/** Connection metadata fields populated when routed through a Smart group. */
export interface SmartConnectionMetadata extends ConnectionMetadata {
  smartBlock: string
  smartTarget?: string
  wildcardTarget?: string
  exitGeoIP?: string
  exitIPASN?: string
}

/** A connection carrying Smart-specific routing metadata. */
export interface SmartConnection extends Connection {
  metadata: SmartConnectionMetadata
}

/** A node weight ranking entry returned by Smart weight endpoints. */
export interface SmartNodeRank extends WireObject {
  Name: string
  Rank: string
  Weight: number
}

/** Response from `GET /group/weights` with null per-group slices normalized to `[]`. */
export interface SmartWeightsSnapshot extends WireObject {
  weights: Record<string, SmartNodeRank[]>
  errors?: Record<string, string>
  message?: string
}

interface RawSmartWeightsSnapshot extends WireObject {
  weights: Record<string, SmartNodeRank[] | null>
  errors?: Record<string, string>
  message?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function optional(
  record: Record<string, unknown>,
  keys: string[],
  guard: (value: unknown) => boolean,
): boolean {
  return keys.every((key) => !Object.hasOwn(record, key) || guard(record[key]))
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every(isString)
}

function isSmartRankList(value: unknown): value is SmartNodeRank[] {
  return Array.isArray(value) && value.every(isSmartNodeRank)
}

function isRawWeightsMap(
  value: unknown,
): value is Record<string, SmartNodeRank[] | null> {
  return (
    isObject(value) &&
    Object.values(value).every(
      (entry) => entry === null || isSmartRankList(entry),
    )
  )
}

function isRawWeightsSnapshot(
  value: unknown,
): value is RawSmartWeightsSnapshot {
  return (
    isObject(value) &&
    Object.hasOwn(value, 'weights') &&
    isRawWeightsMap(value.weights) &&
    optional(value, ['errors'], isStringRecord) &&
    optional(value, ['message'], isString)
  )
}

function isMaintenance(value: unknown): value is MaintenanceResult {
  return isObject(value) && isString(value.status)
}

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InputError(`${label} must be a nonempty string`)
  }
}

/** Checks the Smart group shape, not backend identity or endpoint availability. */
export function isSmartGroup(proxy: Proxy): proxy is SmartGroup {
  return (
    isProxyGroup(proxy) &&
    proxy.all.every(isString) &&
    proxy.type === 'Smart' &&
    optional(
      proxy,
      ['expectedStatus', 'emptyFallback', 'policy-priority'],
      isString,
    ) &&
    optional(proxy, ['useLightGBM', 'collectData', 'preferASN'], isBoolean) &&
    optional(proxy, ['sampleRate', 'tolerance'], isNumber)
  )
}

/** Checks for Smart connection metadata (`smartBlock`), not backend identity. */
export function isSmartConnection(
  connection: Connection,
): connection is SmartConnection {
  return (
    isObject(connection.metadata) &&
    isString(connection.metadata.smartBlock) &&
    connection.metadata.smartBlock.length > 0 &&
    optional(
      connection.metadata,
      ['smartTarget', 'wildcardTarget', 'exitGeoIP', 'exitIPASN'],
      isString,
    )
  )
}

/** Checks whether a wire value matches a Smart `NodeRankItem`. */
export function isSmartNodeRank(value: unknown): value is SmartNodeRank {
  return (
    isObject(value) &&
    isString(value.Name) &&
    isString(value.Rank) &&
    isNumber(value.Weight)
  )
}

function decodeGroupWeights(value: unknown): SmartNodeRank[] {
  if (
    !isObject(value) ||
    !Object.hasOwn(value, 'weights') ||
    !optional(value, ['message'], isString)
  ) {
    throw new DecodeError('Invalid Smart group weights')
  }
  if (value.weights === null) {
    return []
  }
  if (!isSmartRankList(value.weights)) {
    throw new DecodeError('Invalid Smart group weights')
  }
  return value.weights
}

function decodeWeightsSnapshot(value: unknown): SmartWeightsSnapshot {
  if (!isRawWeightsSnapshot(value)) {
    throw new DecodeError('Invalid Smart weights snapshot')
  }
  const weights: Record<string, SmartNodeRank[]> = {}
  for (const [group, ranks] of Object.entries(value.weights)) {
    weights[group] = ranks ?? []
  }
  return { ...value, weights }
}

function decodeMaintenance(value: unknown): MaintenanceResult {
  if (!isMaintenance(value)) {
    throw new DecodeError('Invalid maintenance result')
  }
  if (value.status !== 'ok') {
    throw new OperationError({ status: 'unsuccessful' })
  }
  return value
}

/** Opt-in extension factory for vernesong/mihomo Smart endpoints; construction performs no requests. */
export function smart(transport: ExtensionTransport) {
  return {
    groups: {
      /** Fetches cached weight rankings for all Smart groups (`GET /group/weights`). */
      listWeights(options?: RequestOptions): Promise<SmartWeightsSnapshot> {
        return transport.json(
          { method: 'GET', path: ['group', 'weights'] },
          decodeWeightsSnapshot,
          options,
        )
      },
      /** Fetches cached weight rankings for one Smart group (`GET /group/{name}/weights`). */
      getWeights(
        name: string,
        options?: RequestOptions,
      ): Promise<SmartNodeRank[]> {
        requireNonEmpty(name, 'Group name')
        return transport.json(
          { method: 'GET', path: ['group', name, 'weights'] },
          decodeGroupWeights,
          options,
        )
      },
    },
    cache: {
      /** Flushes all Smart weight/statistics caches (`POST /cache/smart/flush`). */
      flushSmart(options?: RequestOptions): Promise<void> {
        return transport.void(
          { method: 'POST', path: ['cache', 'smart', 'flush'] },
          options,
        )
      },
      /** Flushes Smart caches for one config name (`POST /cache/smart/flush/{config}`). */
      flushSmartConfig(
        config: string,
        options?: RequestOptions,
      ): Promise<void> {
        requireNonEmpty(config, 'Config name')
        return transport.void(
          { method: 'POST', path: ['cache', 'smart', 'flush', config] },
          options,
        )
      },
    },
    connections: {
      /** Marks a Smart-routed connection as blocked and closes it (`DELETE /connections/smart/{id}`). */
      block(id: string, options?: RequestOptions): Promise<void> {
        requireNonEmpty(id, 'Connection ID')
        return transport.void(
          { method: 'DELETE', path: ['connections', 'smart', id] },
          options,
        )
      },
    },
    system: {
      /** Updates the LightGBM model database (`POST /upgrade/lgbm`). */
      upgradeLgbm(options?: RequestOptions): Promise<MaintenanceResult> {
        return transport.json(
          { method: 'POST', path: ['upgrade', 'lgbm'] },
          decodeMaintenance,
          options,
        )
      },
    },
  }
}

export type SmartExtension = ReturnType<typeof smart>
