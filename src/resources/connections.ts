import { connections as decode } from '../decode.js'
import { InputError } from '../errors.js'
import type {
  ConnectionsWatchOptions,
  RequestOptions,
  WebSocketFactory,
} from '../options.js'
import type { HttpContext } from '../transport/http.js'
import { watch } from '../transport/stream.js'
import { duration } from '../transport/url.js'

export function connections(context: HttpContext, factory?: WebSocketFactory) {
  return {
    snapshot: (options?: RequestOptions) =>
      context.json(
        'connections.snapshot',
        { method: 'GET', path: ['connections'] },
        decode,
        options,
      ),
    close: (id: string, options?: RequestOptions) =>
      context.void(
        'connections.close',
        { method: 'DELETE', path: ['connections', id] },
        options,
      ),
    closeAll: (options?: RequestOptions) =>
      context.void(
        'connections.closeAll',
        { method: 'DELETE', path: ['connections'] },
        options,
      ),
    watch(options: ConnectionsWatchOptions = {}) {
      if (
        options.transport !== undefined &&
        options.transport !== 'websocket'
      ) {
        throw new InputError('Connections only support WebSocket subscriptions')
      }
      if (options.intervalMs !== undefined) {
        duration(options.intervalMs, 'intervalMs', false)
      }
      return watch(
        context,
        factory,
        'connections.watch',
        ['connections'],
        { interval: options.intervalMs },
        decode,
        false,
        options,
      )
    },
  }
}
