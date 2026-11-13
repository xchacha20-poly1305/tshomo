import * as d from '../decode.js'
import type { DelayOptions, RequestOptions } from '../options.js'
import type { HttpContext } from '../transport/http.js'
import { delayRequest } from '../transport/delay.js'

export function proxies(context: HttpContext) {
  return {
    list: (options?: RequestOptions) =>
      context.json(
        'proxies.list',
        { method: 'GET', path: ['proxies'] },
        d.envelope('proxies', d.map(d.isProxy)),
        options,
      ),
    get: (name: string, options?: RequestOptions) =>
      context.json(
        'proxies.get',
        { method: 'GET', path: ['proxies', name] },
        d.proxy,
        options,
      ),
    select: (group: string, name: string, options?: RequestOptions) =>
      context.void(
        'proxies.select',
        { method: 'PUT', path: ['proxies', group], json: { name } },
        options,
      ),
    clearFixed: (group: string, options?: RequestOptions) =>
      context.void(
        'proxies.clearFixed',
        { method: 'DELETE', path: ['proxies', group] },
        options,
      ),
    delay: (name: string, input?: DelayOptions, options?: RequestOptions) =>
      delayRequest(
        context,
        'proxies.delay',
        ['proxies', name, 'delay'],
        d.delay,
        input,
        options,
      ),
  }
}

export function groups(context: HttpContext) {
  return {
    list: (options?: RequestOptions) =>
      context.json(
        'groups.list',
        { method: 'GET', path: ['group'] },
        d.envelope('proxies', d.decoder(d.array(d.isProxy), 'groups')),
        options,
      ),
    get: (name: string, options?: RequestOptions) =>
      context.json(
        'groups.get',
        { method: 'GET', path: ['group', name] },
        d.proxy,
        options,
      ),
    delay: (name: string, input?: DelayOptions, options?: RequestOptions) =>
      delayRequest(
        context,
        'groups.delay',
        ['group', name, 'delay'],
        d.map(d.number),
        input,
        options,
      ),
  }
}
