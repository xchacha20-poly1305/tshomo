import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'

const root = process.cwd()
const temp = await mkdtemp(join(tmpdir(), 'tshomo-package-'))
try {
  execFileSync('bun', ['pm', 'pack', '--destination', temp], {
    cwd: root,
    stdio: 'pipe',
  })
  const metadata = JSON.parse(await readFile('package.json', 'utf8'))
  const archive = join(temp, `${metadata.name}-${metadata.version}.tgz`)
  const consumer = join(temp, 'consumer')
  await mkdir(consumer)
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ type: 'module', private: true }),
  )
  execFileSync('bun', ['add', '--offline', archive], {
    cwd: consumer,
    stdio: 'pipe',
  })
  const installed = JSON.parse(
    await readFile(join(consumer, 'node_modules/tshomo/package.json'), 'utf8'),
  )
  if (Object.keys(installed.dependencies ?? {}).length) {
    throw new Error('Unexpected runtime dependency')
  }
  const entry = `
    const originalFetch = globalThis.fetch
    globalThis.fetch = () => {
      throw new Error('Import/constructor performed I/O')
    }
    const { createClashClient } = await import('tshomo')
    const { refind, isRefindRule } = await import('tshomo/extensions/refind')
    const {
      smart,
      isSmartGroup,
      isSmartConnection,
      isSmartNodeRank,
    } = await import('tshomo/extensions/smart')
    const client = createClashClient({ baseUrl: 'http://localhost/controller/' })
    const extension = client.extend(refind)
    const smartExtension = client.extend(smart)
    if (typeof extension.rules.toggleByUuid !== 'function' || isRefindRule({ type: 'x', payload: '', proxy: 'x' })) {
      throw new Error('Invalid reF1nd extension exports')
    }
    if (
      typeof smartExtension.groups.listWeights !== 'function' ||
      typeof smartExtension.groups.getWeights !== 'function' ||
      typeof smartExtension.cache.flushSmart !== 'function' ||
      typeof smartExtension.cache.flushSmartConfig !== 'function' ||
      typeof smartExtension.connections.block !== 'function' ||
      typeof smartExtension.system.upgradeLgbm !== 'function' ||
      isSmartGroup({ name: 'x', type: 'Selector', all: [] }) ||
      isSmartConnection({ id: '1', upload: 0, download: 0, start: 0, chains: [], metadata: {} }) ||
      isSmartNodeRank(null)
    ) {
      throw new Error('Invalid Smart extension exports')
    }
    client.dispose()
    globalThis.fetch = originalFetch
    if (!client.proxies || !client.logs) {
      throw new Error('Missing exports')
    }
  `
  await writeFile(join(consumer, 'check.mjs'), entry)
  execFileSync(process.execPath, ['check.mjs'], {
    cwd: consumer,
    stdio: 'inherit',
  })
  await writeFile(
    join(consumer, 'check.ts'),
    `import { createClashClient, type ConfigPatch } from 'tshomo'
    import { refind, isRefindRule, type RefindExtension, type RefindRule } from 'tshomo/extensions/refind'
    import {
      smart,
      isSmartGroup,
      isSmartConnection,
      isSmartNodeRank,
      type SmartExtension,
      type SmartGroup,
      type SmartConnection,
      type SmartNodeRank,
      type SmartWeightsSnapshot,
    } from 'tshomo/extensions/smart'
    const patch: ConfigPatch = { tun: { enable: true }, 'mixed-port': 7890 }
    const client = createClashClient({ baseUrl: 'http://localhost' })
    const groups: Promise<import('tshomo').Proxy[]> = client.groups.list()
    const custom = client.extend((transport) => ({
      count: () => transport.json({ method: 'GET', path: ['custom'] }, (value) => {
        if (typeof value !== 'number') {
          throw new Error('Expected number')
        }
        return value
      }),
    }))
    const count: Promise<number> = custom.count()
    void count
    async function streamTypes() {
      const result = await client.metrics.watchTraffic()[Symbol.asyncIterator]().next()
      // @ts-expect-error Iterator return values must not default to any.
      const wrong: string = result.value
      // @ts-expect-error Check done before accessing a yielded value.
      result.value.up
      if (!result.done) {
        const up: number = result.value.up
        void up
      } else {
        const completed: undefined = result.value
        void completed
      }
      void wrong
    }
    void streamTypes
    const refindClient: RefindExtension = client.extend(refind)
    const toggled: Promise<void> = refindClient.rules.toggleByUuid('uuid')
    void toggled
    function narrowRule(rule: import('tshomo').Rule) {
      if (isRefindRule(rule)) {
        const narrowed: RefindRule = rule
        const uuid: string = narrowed.uuid
        return uuid
      }
    }
    void narrowRule
    // @ts-expect-error fork extension must not leak into core exports
    import { refind as coreRefind } from 'tshomo'
    // @ts-expect-error smart extension must not leak into core exports
    import { smart as coreSmart } from 'tshomo'
    void coreRefind
    void coreSmart
    const smartClient: SmartExtension = client.extend(smart)
    const weights: Promise<SmartWeightsSnapshot> = smartClient.groups.listWeights()
    const groupWeights: Promise<SmartNodeRank[]> = smartClient.groups.getWeights('Smart')
    const flushed: Promise<void> = smartClient.cache.flushSmart()
    const flushedCfg: Promise<void> = smartClient.cache.flushSmartConfig('cfg')
    const blocked: Promise<void> = smartClient.connections.block('id')
    const lgbm: Promise<import('tshomo').MaintenanceResult> = smartClient.system.upgradeLgbm()
    void weights
    void groupWeights
    void flushed
    void flushedCfg
    void blocked
    void lgbm
    function narrowSmart(proxy: import('tshomo').Proxy, conn: import('tshomo').Connection) {
      if (isSmartGroup(proxy)) {
        const g: SmartGroup = proxy
        void g.useLightGBM
      }
      if (isSmartConnection(conn)) {
        const c: SmartConnection = conn
        void c.metadata.smartBlock
      }
      if (isSmartNodeRank({ Name: 'A', Rank: 'MostUsed', Weight: 1 })) {
        return true
      }
      return false
    }
    void narrowSmart
    void groups
    void client.configs.patch(patch)
    // @ts-expect-error incorrect known config field
    const bad: ConfigPatch = { 'mixed-port': 'invalid' }
    void bad
    // @ts-expect-error unsupported subpath must stay private
    import('tshomo/transport/http.js')
  `,
  )
  execFileSync(
    resolve('node_modules/.bin/tsc'),
    [
      '--noEmit',
      '--strict',
      '--exactOptionalPropertyTypes',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'check.ts',
    ],
    { cwd: consumer, stdio: 'inherit' },
  )
  const bundle = await build({
    absWorkingDir: consumer,
    entryPoints: ['check.mjs'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    metafile: true,
  })
  if (
    Object.values(bundle.metafile.outputs).some(
      (output) => output.imports.length,
    )
  ) {
    throw new Error('Unexpected external import in browser bundle')
  }
  const coreBundle = await build({
    absWorkingDir: consumer,
    stdin: {
      contents: "export { createClashClient } from 'tshomo'",
      resolveDir: consumer,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    metafile: true,
  })
  if (
    Object.keys(coreBundle.metafile.inputs).some(
      (path) =>
        path.endsWith('/extensions/refind.js') ||
        path.endsWith('/extensions/smart.js'),
    )
  ) {
    throw new Error('Core entry point loaded an optional extension')
  }
  console.log(
    'Packed ESM import, TS 7 declarations, private exports and browser bundle passed',
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
