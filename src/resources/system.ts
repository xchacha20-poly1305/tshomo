import * as d from '../decode.js'
import type { RequestOptions, UpgradeOptions } from '../options.js'
import type { HttpContext } from '../transport/http.js'
export function system(context: HttpContext) {
  return {
    hello: (options?: RequestOptions) =>
      context.json(
        'system.hello',
        { method: 'GET', path: [] },
        d.hello,
        options,
      ),
    getVersion: (options?: RequestOptions) =>
      context.json(
        'system.getVersion',
        { method: 'GET', path: ['version'] },
        d.version,
        options,
      ),
    gc: (options?: RequestOptions) =>
      context.void('system.gc', { method: 'PUT', path: ['gc'] }, options),
    restart: (options?: RequestOptions) =>
      context.operation(
        'system.restart',
        { method: 'POST', path: ['restart'] },
        d.maintenance,
        options,
      ),
    upgradeCore: (input: UpgradeOptions = {}, options?: RequestOptions) =>
      context.operation(
        'system.upgradeCore',
        {
          method: 'POST',
          path: ['upgrade'],
          query: { channel: input.channel, force: input.force },
        },
        d.maintenance,
        options,
      ),
    upgradeUi: (options?: RequestOptions) =>
      context.operation(
        'system.upgradeUi',
        { method: 'POST', path: ['upgrade', 'ui'] },
        d.maintenance,
        options,
      ),
    updateGeo: (options?: RequestOptions) =>
      context.void(
        'system.updateGeo',
        { method: 'POST', path: ['upgrade', 'geo'] },
        options,
      ),
  }
}
