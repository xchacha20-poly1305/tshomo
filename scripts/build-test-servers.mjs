import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const run = promisify(execFile)
const output = resolve('test/servers/bin')
await mkdir(output, { recursive: true })
await Promise.all(
  ['sing-box', 'mihomo'].map(async (kernel) => {
    const args = ['build', '-mod=readonly', '-trimpath']
    if (kernel === 'sing-box') {
      args.push('-tags', 'with_clash_api')
    } else {
      args.push(
        '-ldflags',
        '-X github.com/metacubex/mihomo/constant.Version=v1.19.34',
      )
    }
    args.push(
      '-o',
      resolve(output, kernel + (process.platform === 'win32' ? '.exe' : '')),
      '.',
    )
    const { stdout, stderr } = await run('go', args, {
      cwd: resolve('test/servers', kernel),
    })
    process.stdout.write(stdout)
    process.stderr.write(stderr)
    console.log(`Built ${kernel} test server`)
  }),
)
