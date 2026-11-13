import * as d from '../decode.js'
import type { DelayOptions, RequestOptions } from '../options.js'
import type { HttpContext } from '../transport/http.js'
import { delayRequest } from '../transport/delay.js'
export function proxyProviders(context: HttpContext) {
  const root = ['providers', 'proxies']
  return {
    list: (options?: RequestOptions) =>
      context.json(
        'proxyProviders.list',
        { method: 'GET', path: root },
        d.envelope('providers', d.map(d.isProxyProvider)),
        options,
      ),
    get: (name: string, options?: RequestOptions) =>
      context.json(
        'proxyProviders.get',
        { method: 'GET', path: [...root, name] },
        d.proxyProvider,
        options,
      ),
    update: (name: string, options?: RequestOptions) =>
      context.void(
        'proxyProviders.update',
        { method: 'PUT', path: [...root, name] },
        options,
      ),
    healthCheck: (name: string, options?: RequestOptions) =>
      context.void(
        'proxyProviders.healthCheck',
        { method: 'GET', path: [...root, name, 'healthcheck'] },
        options,
      ),
    getProxy: (provider: string, name: string, options?: RequestOptions) =>
      context.json(
        'proxyProviders.getProxy',
        { method: 'GET', path: [...root, provider, name] },
        d.proxy,
        options,
      ),
    delayProxy: (
      provider: string,
      name: string,
      input?: DelayOptions,
      options?: RequestOptions,
    ) =>
      delayRequest(
        context,
        'proxyProviders.delayProxy',
        [...root, provider, name, 'healthcheck'],
        d.delay,
        input,
        options,
      ),
  }
}
export function ruleProviders(context: HttpContext) {
  return {
    list: (options?: RequestOptions) =>
      context.json(
        'ruleProviders.list',
        { method: 'GET', path: ['providers', 'rules'] },
        d.ruleProviders,
        options,
      ),
    update: (name: string, options?: RequestOptions) =>
      context.void(
        'ruleProviders.update',
        { method: 'PUT', path: ['providers', 'rules', name] },
        options,
      ),
  }
}
