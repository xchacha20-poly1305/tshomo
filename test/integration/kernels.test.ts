import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpsServer } from 'node:https'
import { createConnection, createServer } from 'node:net'
import { createSocket } from 'node:dgram'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createTypebox } from '@zhexin/typebox'
import { createOutbounds } from '@zhexin/typebox/outbound'
import { expect, it } from 'vitest'
import {
  createClashClient,
  HttpError,
  type ClashStream,
} from '../../src/index.js'
import { refind } from '../../src/extensions/refind.js'

const kernels = ['sing-box', 'mihomo'] as const

// reF1nd provider options are outside the upstream configuration modeled by TypeBox.
interface InlineTestProvider {
  type: 'inline'
  tag: string
  health_check: { enabled: false; url: string; timeout: '2s' }
  outbounds: ReturnType<typeof createOutbounds>
}

async function unusedPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No TCP port allocated')
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

async function first<T>(stream: ClashStream<T>) {
  try {
    const result = await stream[Symbol.asyncIterator]().next()
    if (result.done) {
      throw new Error('Controller closed before its first sample')
    }
    return result.value
  } finally {
    stream.close()
  }
}

// This suite owns temporary controllers and only sends traffic to loopback endpoints.
// It never attaches to a host daemon or changes the system proxy.
it.skipIf(process.env.TSHOMO_TEST_KERNELS !== '1').each(kernels)(
  'checks the %s test server against the public client',
  async (kernel) => {
    const binary = resolve(
      'test/servers/bin',
      kernel + (process.platform === 'win32' ? '.exe' : ''),
    )
    const directory = await mkdtemp(join(tmpdir(), `tshomo-${kernel}-`))
    const children: ChildProcess[] = []
    const clients: ReturnType<typeof createClashClient>[] = []
    const certPath = join(directory, 'cert.pem')
    const keyPath = join(directory, 'key.pem')
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
      ],
      { stdio: 'ignore' },
    )
    const target = createHttpsServer(
      { key: await readFile(keyPath), cert: await readFile(certPath) },
      (_request, response) => {
        // URL tests report integer milliseconds and reject a zero delay.
        setTimeout(() => response.writeHead(204).end(), 20)
      },
    )
    target.listen(0, '127.0.0.1')
    await once(target, 'listening')
    const address = target.address()
    if (!address || typeof address === 'string') {
      throw new Error('No HTTPS target port')
    }
    const targetPort = address.port
    const targetUrl = `https://127.0.0.1:${targetPort}/generate_204`
    const providerName = 'inline / % ? #'
    const groupName = 'selector / % ? #'

    const dnsServer = createSocket('udp4')
    dnsServer.on('message', (query, peer) => {
      const header = Buffer.from(query.subarray(0, 12))
      header.writeUInt16BE(0x8180, 2)
      header.writeUInt16BE(1, 6)
      header.writeUInt16BE(0, 8)
      header.writeUInt16BE(0, 10)
      const answer = Buffer.from([
        0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 192, 0, 2, 1,
      ])
      dnsServer.send(
        Buffer.concat([header, query.subarray(12), answer]),
        peer.port,
        peer.address,
      )
    })
    dnsServer.bind(0, '127.0.0.1')
    await once(dnsServer, 'listening')
    const dnsPort = dnsServer.address().port

    async function start(populated: boolean) {
      const port = await unusedPort()
      const proxyPort = await unusedPort()
      const dataDir = join(directory, String(port))
      await mkdir(dataDir)
      const configPath = join(directory, `config-${port}.json`)
      const singBoxConfig = createTypebox({
        log: { level: 'debug' },
        certificate: { certificate_path: [certPath] },
        dns: {
          servers: [
            {
              type: 'hosts',
              tag: 'hosts',
              predefined: { 'demo.test': '192.0.2.1' },
            },
          ],
        },
        inbounds: [
          {
            type: 'mixed',
            tag: 'mixed',
            listen: '127.0.0.1',
            listen_port: proxyPort,
          },
        ],
        outbounds: createOutbounds(
          populated
            ? [
                {
                  type: 'selector',
                  tag: groupName,
                  outbounds: ['direct', 'block'],
                  default: 'direct',
                },
                { type: 'direct', tag: 'direct' },
                { type: 'block', tag: 'block' },
              ]
            : [
                { type: 'direct', tag: 'direct' },
                { type: 'block', tag: 'block' },
              ],
        ),
        route: {
          final: populated ? groupName : 'direct',
          ...(populated
            ? {
                rule_set: [
                  {
                    type: 'inline',
                    tag: 'inline-rules',
                    rules: [{ domain: ['demo.test'] }],
                  },
                ],
                rules: [{ rule_set: ['inline-rules'], outbound: 'direct' }],
              }
            : {}),
        },
        experimental: {
          clash_api: {
            external_controller: `127.0.0.1:${port}`,
            secret: 'local-test-secret',
            default_mode: 'rule',
          },
          cache_file: {
            enabled: true,
            path: join(directory, `cache-${port}.db`),
          },
        },
      })
      const singBoxProviders: InlineTestProvider[] = populated
        ? [
            {
              type: 'inline',
              tag: providerName,
              health_check: {
                enabled: false,
                url: targetUrl,
                timeout: '2s',
              },
              outbounds: createOutbounds([
                {
                  type: 'direct',
                  tag: 'provider-direct',
                },
              ]),
            },
          ]
        : []
      const mihomoConfig = {
        'external-controller': `127.0.0.1:${port}`,
        secret: 'local-test-secret',
        'mixed-port': proxyPort,
        'bind-address': '127.0.0.1',
        'allow-lan': false,
        'log-level': 'debug',
        ipv6: false,
        mode: 'rule',
        'find-process-mode': 'off',
        'geo-auto-update': false,
        'proxy-groups': populated
          ? [{ name: groupName, type: 'select', proxies: ['direct', 'block'] }]
          : [],
        proxies: [
          { name: 'direct', type: 'direct' },
          { name: 'block', type: 'reject' },
        ],
        'proxy-providers': populated
          ? {
              [providerName]: {
                type: 'inline',
                'health-check': {
                  enable: false,
                  url: targetUrl,
                  timeout: 2000,
                },
                payload: [
                  {
                    name: 'provider-direct',
                    type: 'direct',
                  },
                ],
              },
            }
          : {},
        'rule-providers': populated
          ? {
              'inline-rules': {
                type: 'inline',
                behavior: 'domain',
                payload: ['demo.test'],
              },
            }
          : {},
        rules: populated ? ['RULE-SET,inline-rules,direct'] : [],
        dns: {
          enable: true,
          'use-hosts': false,
          'use-system-hosts': false,
          'default-nameserver': ['127.0.0.1'],
          nameserver: [`udp://127.0.0.1:${dnsPort}`],
        },
      }
      const config =
        kernel === 'sing-box'
          ? { ...singBoxConfig, providers: singBoxProviders }
          : mihomoConfig
      await writeFile(configPath, JSON.stringify(config))
      const child = spawn(
        binary,
        ['-config', configPath, '-data-dir', dataDir],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            SSL_CERT_FILE: certPath,
            SSL_CERT_DIR: directory,
          },
        },
      )
      children.push(child)
      let output = ''
      child.stdout?.on('data', (bytes: Buffer) => {
        output = (output + bytes.toString()).slice(-10000)
      })
      child.stderr?.on('data', (bytes: Buffer) => {
        output = (output + bytes.toString()).slice(-10000)
      })
      let spawnError: Error | undefined
      child.on('error', (error) => {
        spawnError = error
      })
      const client = createClashClient({
        baseUrl: `http://127.0.0.1:${port}`,
        secret: 'local-test-secret',
      })
      clients.push(client)
      for (let attempt = 0; attempt < 100; attempt++) {
        if (spawnError || child.exitCode !== null) {
          throw new Error(
            `${kernel} startup failed: ${spawnError?.message ?? output}`,
          )
        }
        try {
          await client.system.getVersion({ timeoutMs: 100 })
          return { client, port, proxyPort }
        } catch {
          await delay(25)
        }
      }
      throw new Error(`${kernel} startup timed out: ${output}`)
    }

    try {
      const empty = await start(false)
      expect((await empty.client.system.getVersion()).version).not.toBe('')
      expect((await empty.client.system.hello()).hello).toBeTypeOf('string')
      const emptyConfig = await empty.client.configs.get()
      if (kernel === 'sing-box') {
        expect(emptyConfig.tun).toBeNull()
      }
      expect(await empty.client.rules.list()).toEqual([])
      expect(
        (await empty.client.groups.list()).map((group) => group.name),
      ).not.toContain(groupName)
      expect(await empty.client.proxyProviders.list()).not.toHaveProperty(
        providerName,
      )
      expect(await empty.client.ruleProviders.list()).toEqual({})
      expect(
        (await empty.client.connections.snapshot()).connections ?? [],
      ).toEqual([])
      const unauthenticated = createClashClient({
        baseUrl: `http://127.0.0.1:${empty.port}`,
        secret: 'wrong',
      })
      try {
        await expect(unauthenticated.system.getVersion()).rejects.toMatchObject(
          { status: 401 },
        )
      } finally {
        unauthenticated.dispose()
      }

      const { client, proxyPort } = await start(true)
      const proxies = await client.proxies.list()
      expect(proxies[groupName]?.all).toEqual(['direct', 'block'])
      expect(await client.groups.get(groupName)).toEqual(proxies[groupName])
      expect((await client.groups.list()).map((group) => group.name)).toContain(
        groupName,
      )
      await client.proxies.select(groupName, 'block')
      expect((await client.proxies.get(groupName)).now).toBe('block')
      await client.proxies.select(groupName, 'direct')
      await client.configs.patch({ mode: 'rule' })
      expect((await client.configs.get()).mode).toBe('rule')

      // Omitting timeoutMs used to produce HTTP 400 on all three calls.
      expect(
        (await client.proxies.delay('direct', { url: targetUrl })).delay,
      ).toBeGreaterThan(0)
      expect(
        (await client.groups.delay(groupName, { url: targetUrl })).direct,
      ).toBeGreaterThan(0)
      const provider = await client.proxyProviders.get(providerName)
      const providerProxyName = provider.proxies?.[0]?.name
      if (!providerProxyName) {
        throw new Error('Expected a proxy from the inline provider')
      }
      expect(
        (
          await client.proxyProviders.delayProxy(
            providerName,
            providerProxyName,
            { url: targetUrl },
          )
        ).delay,
      ).toBeGreaterThan(0)
      expect(
        (await client.proxyProviders.list())[providerName]?.proxies?.[0]?.name,
      ).toBe(providerProxyName)
      expect(provider.name).toBe(providerName)
      await client.proxyProviders.update(providerName)
      await client.proxyProviders.healthCheck(providerName)
      expect(
        (await client.ruleProviders.list())['inline-rules']?.ruleCount,
      ).toBeGreaterThan(0)
      await client.ruleProviders.update('inline-rules')
      // sing-box has the healthcheck route but does not expose this mihomo endpoint.
      if (kernel === 'sing-box') {
        await expect(
          client.proxyProviders.getProxy(providerName, providerProxyName),
        ).rejects.toBeInstanceOf(HttpError)
      } else {
        expect(
          (
            await client.proxyProviders.getProxy(
              providerName,
              'provider-direct',
            )
          ).name,
        ).toBe(providerProxyName)
      }

      const rules = await client.rules.list()
      expect(rules.length).toBeGreaterThan(0)
      if (kernel === 'sing-box') {
        const rule = rules[0]
        if (!rule?.uuid) {
          throw new Error('Expected UUID routing rules from this sing-box fork')
        }
        const extension = client.extend(refind)
        await extension.rules.toggleByUuid(rule.uuid)
        expect((await client.rules.list())[0]?.disabled).toBe(true)
        await extension.rules.toggleByUuid(rule.uuid)
        expect((await client.rules.list())[0]?.disabled).toBeUndefined()
      } else {
        await client.rules.disableByIndex({ 0: true })
        expect((await client.rules.list())[0]?.extra?.disabled).toBe(true)
        await client.rules.disableByIndex({ 0: false })
        expect((await client.rules.list())[0]?.extra?.disabled).toBe(false)
      }
      const dns = await client.dns.query({ name: 'demo.test' })
      if (kernel === 'sing-box') {
        expect(dns.Server).toBe('internal')
      }
      expect(dns.Answer?.[0]?.data).toBe('192.0.2.1')
      await client.cache.flushDns()
      await client.cache.flushFakeIp()
      if (kernel === 'mihomo') {
        await client.storage.putJson('audit / % ? #', { value: [1, true] })
        expect(await client.storage.getJson('audit / % ? #')).toEqual({
          value: [1, true],
        })
        await client.storage.putBytes(
          'audit-bytes',
          new TextEncoder().encode('{"raw":true}'),
        )
        expect(
          new TextDecoder().decode(
            await client.storage.getBytes('audit-bytes'),
          ),
        ).toBe('{"raw":true}')
        await client.storage.delete('audit-bytes')
        await client.storage.delete('audit / % ? #')
        expect(await client.storage.getJson('audit / % ? #')).toBeNull()
      } else {
        // This pinned branch does not expose the optional storage API.
        await expect(client.storage.getJson('audit')).rejects.toMatchObject({
          status: 404,
        })
      }

      for (const transport of ['websocket', 'http-json'] as const) {
        expect(
          (await client.metrics.trafficSample({ transport, timeoutMs: 3000 }))
            .up,
        ).toBeTypeOf('number')
        expect(
          (await client.metrics.memorySample({ transport, timeoutMs: 3000 }))
            .inuse,
        ).toBeTypeOf('number')
        const logs = client.logs.watch({
          transport,
          level: 'debug',
          signal: AbortSignal.timeout(3000),
        })
        // HTTP log handlers flush headers with their first entry, so generate
        // entries while the stream connects instead of waiting for headers.
        const generateLogs = async () => {
          for (let attempt = 0; attempt < 50; attempt++) {
            if (logs.state === 'closed' || logs.state === 'failed') {
              return
            }
            await delay(25)
            await client.dns.query({ name: 'demo.test' })
          }
        }
        const [entry] = await Promise.all([first(logs), generateLogs()])
        expect(entry.payload).toBeTypeOf('string')
      }

      const socket = createConnection(proxyPort, '127.0.0.1')
      try {
        await once(socket, 'connect')
        socket.write(
          `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`,
        )
        const [header] = await once(socket, 'data')
        expect(String(header)).toContain('200')
        const snapshot = await first(
          client.connections.watch({
            intervalMs: 100,
            signal: AbortSignal.timeout(3000),
          }),
        )
        const connection = snapshot.connections?.[0]
        expect(['string', 'number']).toContain(
          typeof connection?.metadata.sourcePort,
        )
        expect(connection?.chains).toContain(
          kernel === 'sing-box' ? 'direct' : 'DIRECT',
        )
        if (!connection) {
          throw new Error('Missing active connection')
        }
        await client.connections.close(connection.id)
      } finally {
        socket.destroy()
      }
      await client.connections.closeAll()
    } finally {
      dnsServer.close()
      clients.forEach((client) => client.dispose())
      await Promise.all(
        children.map(async (child) => {
          if (child.exitCode !== null || !child.pid) {
            return
          }
          const exited = once(child, 'exit')
          child.kill('SIGTERM')
          await exited
        }),
      )
      target.closeAllConnections()
      await new Promise<void>((resolve) => target.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  },
  20000,
)
