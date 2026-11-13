import {
  createClashClient,
  type ClashClientOptions,
  type ConnectionsSnapshot,
  type Log,
  type Memory,
  type Traffic,
} from '../src/index.js'

/** Call stop() on unmount/backend switch, then await done to observe errors. */
export function observeDashboard(
  options: ClashClientOptions,
  render: {
    connections(value: ConnectionsSnapshot): void
    traffic(value: Traffic): void
    memory(value: Memory): void
    log(value: Log): void
  },
) {
  const client = createClashClient(options)
  const streams = {
    connections: client.connections.watch({
      intervalMs: 1000,
    }),
    traffic: client.metrics.watchTraffic(),
    memory: client.metrics.watchMemory(),
    logs: client.logs.watch({ level: 'info' }),
  }
  const stop = () => client.dispose()
  const done = Promise.all([
    (async () => {
      for await (const value of streams.connections) {
        render.connections(value)
      }
    })(),
    (async () => {
      for await (const value of streams.traffic) {
        render.traffic(value)
      }
    })(),
    (async () => {
      for await (const value of streams.memory) {
        render.memory(value)
      }
    })(),
    (async () => {
      for await (const value of streams.logs) {
        render.log(value)
      }
    })(),
  ])
    .then(() => undefined)
    .finally(stop)
  return { client, stop, done }
}
