import type * as d from '../decode.js'
import type { Capability, DelayOptions, RequestOptions } from '../options.js'
import type { HttpContext } from './http.js'
import { duration } from './url.js'

const DEFAULT_DELAY_TIMEOUT_MS = 5000

export function delayRequest<T>(
  context: HttpContext,
  capability: Capability,
  path: string[],
  decode: d.Decoder<T>,
  input: DelayOptions = {},
  options: RequestOptions = {},
) {
  // sing-box requires a timeout
  const delayTimeoutMs = input.timeoutMs ?? DEFAULT_DELAY_TIMEOUT_MS
  duration(delayTimeoutMs, 'delay timeoutMs')
  const timeoutMs =
    options.timeoutMs ??
    (context.timeoutMs === 0
      ? 0
      : Math.max(context.timeoutMs, delayTimeoutMs + 1000))
  return context.json(
    capability,
    {
      method: 'GET',
      path,
      query: {
        url: input.url,
        timeout: delayTimeoutMs,
        expected: input.expectedStatus,
      },
    },
    decode,
    { ...options, timeoutMs },
  )
}
