import type * as d from '../decode.js'
import type { Capability, DelayOptions, RequestOptions } from '../options.js'
import type { HttpContext } from './http.js'
import { duration } from './url.js'
export function delayRequest<T>(
  context: HttpContext,
  capability: Capability,
  path: string[],
  decode: d.Decoder<T>,
  input: DelayOptions = {},
  options: RequestOptions = {},
) {
  if (input.timeoutMs !== undefined) {
    duration(input.timeoutMs, 'delay timeoutMs')
  }
  const timeoutMs =
    options.timeoutMs ??
    (context.timeoutMs === 0
      ? 0
      : Math.max(context.timeoutMs, (input.timeoutMs ?? 0) + 1000))
  return context.json(
    capability,
    {
      method: 'GET',
      path,
      query: {
        url: input.url,
        timeout: input.timeoutMs,
        expected: input.expectedStatus,
      },
    },
    decode,
    { ...options, timeoutMs },
  )
}
