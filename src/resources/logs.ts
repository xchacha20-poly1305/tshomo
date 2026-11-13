import { log } from '../decode.js'
import type { LogsWatchOptions, WebSocketFactory } from '../options.js'
import type { HttpContext } from '../transport/http.js'
import { watch } from '../transport/stream.js'
export function logs(context: HttpContext, factory?: WebSocketFactory) {
  return {
    watch: (options: LogsWatchOptions = {}) =>
      watch(
        context,
        factory,
        'logs.watch',
        ['logs'],
        { level: options.level },
        log,
        true,
        options,
      ),
  }
}
