import { readFile } from 'node:fs/promises'
import { it, expect } from 'vitest'
import { createClashClient, readSubscriptionInfo } from '../src/index.js'
import { object } from '../src/decode.js'

it('decodes source-derived wire variants and retains unknown metadata', async () => {
  const fixtures: unknown = JSON.parse(
    await readFile(new URL('./fixtures/wire.json', import.meta.url), 'utf8'),
  )
  if (!object(fixtures)) {
    throw new Error('Bad fixture file')
  }
  const clientFor = (key: string) =>
    createClashClient({
      baseUrl: 'http://local/',
      fetch: async () => new Response(JSON.stringify(fixtures[key])),
    })
  for (const key of ['dnsUpper', 'dnsLower']) {
    const client = clientFor(key)
    expect(await client.dns.query({ name: 'example.invalid' })).toEqual(
      fixtures[key],
    )
    client.dispose()
  }
  for (const key of ['providerUpper', 'providerLower']) {
    const client = clientFor(key)
    const provider = await client.proxyProviders.get('fixture')
    expect(readSubscriptionInfo(provider.subscriptionInfo ?? {})).toEqual({
      upload: 100,
      download: 200,
      total: 1000,
      expire: 1800000000,
    })
    client.dispose()
  }
  const groups = clientFor('groups')
  expect((await groups.groups.list())[0]?.all).toEqual(['DIRECT'])
  groups.dispose()
  const delay = clientFor('groupDelay')
  expect(await delay.groups.delay('g')).toEqual(fixtures.groupDelay)
  delay.dispose()
  const rules = clientFor('ruleProviderNames')
  expect((await rules.ruleProviders.list()).fixture).toEqual({
    name: 'fixture',
  })
  rules.dispose()
  const connection = clientFor('connections')
  expect(
    (await connection.connections.snapshot()).connections?.[0]?.metadata.future,
  ).toEqual({ kept: true })
  connection.dispose()
})
