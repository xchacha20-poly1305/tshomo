import { memory, traffic, type Decoder } from '../decode.js'
import { DecodeError } from '../errors.js'
import type {
  Capability,
  SampleOptions,
  StreamOptions,
  WebSocketFactory,
} from '../options.js'
import type { HttpContext } from '../transport/http.js'
import { watch } from '../transport/stream.js'

async function sample<T>(
  context: HttpContext,
  factory: WebSocketFactory | undefined,
  capability: Capability,
  path: string[],
  decode: Decoder<T>,
  options: SampleOptions = {},
): Promise<T> {
  context.check(capability)
  const scope = context.scope(
    options.signal,
    options.timeoutMs ?? (context.timeoutMs || 15000),
  )
  let stream: ReturnType<typeof watch<T>> | undefined
  try {
    stream = watch(context, factory, capability, path, {}, decode, false, {
      ...options,
      signal: scope.signal,
    })
    const result = await stream[Symbol.asyncIterator]().next()
    if (scope.error()) {
      throw scope.error()
    }
    if (result.done) {
      throw new DecodeError('Stream ended before the first sample')
    }
    return result.value
  } catch (error) {
    throw scope.error() ?? error
  } finally {
    stream?.close()
    scope.finish()
  }
}

export function metrics(context: HttpContext, factory?: WebSocketFactory) {
  return {
    watchTraffic: (options?: StreamOptions) =>
      watch(
        context,
        factory,
        'metrics.watchTraffic',
        ['traffic'],
        {},
        traffic,
        false,
        options,
      ),
    watchMemory: (options?: StreamOptions) =>
      watch(
        context,
        factory,
        'metrics.watchMemory',
        ['memory'],
        {},
        memory,
        false,
        options,
      ),
    trafficSample: (options?: SampleOptions) =>
      sample(
        context,
        factory,
        'metrics.trafficSample',
        ['traffic'],
        traffic,
        options,
      ),
    memorySample: (options?: SampleOptions) =>
      sample(
        context,
        factory,
        'metrics.memorySample',
        ['memory'],
        memory,
        options,
      ),
  }
}
