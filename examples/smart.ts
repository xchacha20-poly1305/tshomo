import type { ClashClient, RequestOptions } from '../src/index.js'
import {
  isSmartConnection,
  isSmartGroup,
  smart,
} from '../src/extensions/smart.js'

/** Call only against a known vernesong/mihomo Smart-enabled controller. */
export async function inspectSmartGroups(
  client: ClashClient,
  options?: RequestOptions,
) {
  const extension = client.extend(smart)
  const proxies = await client.proxies.list(options)
  const groups = Object.values(proxies).filter(isSmartGroup)
  const weights = await extension.groups.listWeights(options)
  return { groups, weights }
}

/** Blocks an active Smart-routed connection only when its current state is `normal`. */
export async function blockSmartConnection(
  client: ClashClient,
  id: string,
  options?: RequestOptions,
) {
  const extension = client.extend(smart)
  const snapshot = await client.connections.snapshot(options)
  const connection = snapshot.connections?.find(
    (item) =>
      item.id === id &&
      isSmartConnection(item) &&
      item.metadata.smartBlock === 'normal',
  )
  if (!connection) {
    throw new Error('No blockable Smart connection with the requested ID')
  }
  await extension.connections.block(connection.id, options)
}
