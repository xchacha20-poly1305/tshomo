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
    const client = createClashClient({ baseUrl: 'http://localhost/controller/' })
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
    const patch: ConfigPatch = { tun: { enable: true }, 'mixed-port': 7890 }
    const client = createClashClient({ baseUrl: 'http://localhost' })
    const groups: Promise<import('tshomo').Proxy[]> = client.groups.list()
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
  console.log(
    'Packed ESM import, TS 7 declarations, private exports and browser bundle passed',
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
