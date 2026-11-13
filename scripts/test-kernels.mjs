import './build-test-servers.mjs'
import { spawn } from 'node:child_process'

const child = spawn(
  'bun',
  ['run', 'test', 'test/integration/kernels.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, TSHOMO_TEST_KERNELS: '1' },
  },
)
child.on('error', (error) => {
  throw error
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
