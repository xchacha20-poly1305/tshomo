import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
export async function localServer(
  handler?: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(
    handler ??
      ((_request, response) => {
        response.writeHead(404).end()
      }),
  )
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit('connection', ws, request),
    )
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No port')
  }
  return {
    server,
    wss,
    baseUrl: `http://127.0.0.1:${address.port}/controller/`,
    async close() {
      for (const ws of wss.clients) {
        ws.terminate()
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()))
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
