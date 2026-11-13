import { dns as decode } from '../decode.js'
import { InputError } from '../errors.js'
import type { RequestOptions } from '../options.js'
import type { HttpContext } from '../transport/http.js'
export function dns(context: HttpContext) {
  return {
    query(input: { name: string; type?: string }, options?: RequestOptions) {
      context.check('dns.query')
      if (typeof input.name !== 'string' || !input.name.trim()) {
        throw new InputError('DNS name must not be empty')
      }
      return context.json(
        'dns.query',
        { method: 'GET', path: ['dns', 'query'], query: input },
        decode,
        options,
      )
    },
  }
}
export function cache(context: HttpContext) {
  return {
    flushFakeIp: (options?: RequestOptions) =>
      context.void(
        'cache.flushFakeIp',
        { method: 'POST', path: ['cache', 'fakeip', 'flush'] },
        options,
      ),
    flushDns: (options?: RequestOptions) =>
      context.void(
        'cache.flushDns',
        { method: 'POST', path: ['cache', 'dns', 'flush'] },
        options,
      ),
  }
}
