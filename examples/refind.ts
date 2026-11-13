import type { ClashClient, RequestOptions } from '../src/index.js'
import { isRefindRule, refind } from '../src/extensions/refind.js'

/** Call only when the user explicitly requests a toggle on a known reF1nd backend. */
export async function toggleRefindRule(
  client: ClashClient,
  uuid: string,
  options?: RequestOptions,
) {
  const extension = client.extend(refind)
  const rules = await client.rules.list(options)
  const rule = rules.find((rule) => isRefindRule(rule) && rule.uuid === uuid)
  if (!rule) {
    throw new Error('No rule with the requested UUID')
  }
  await extension.rules.toggleByUuid(uuid, options)
  // Re-read server state instead of assuming a target state or retrying a toggle.
  return client.rules.list(options)
}
