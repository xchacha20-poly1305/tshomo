/** Stable discriminants; messages and contexts never contain transport URLs. */
export type ErrorKind =
  | 'input'
  | 'http'
  | 'network'
  | 'timeout'
  | 'abort'
  | 'decode'
  | 'operation'
  | 'unsupported-transport'
  | 'unsupported-capability'
  | 'stream'
  | 'buffer-overflow'
  | 'client-disposed'

export class ClashError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class InputError extends ClashError {
  constructor(message = 'Invalid input') {
    super('input', message)
  }
}

export class HttpError extends ClashError {
  constructor(
    readonly method: string,
    readonly resource: string,
    readonly status: number,
    readonly serverMessage?: string,
  ) {
    super(
      'http',
      `HTTP ${status} (${method} ${resource})${serverMessage ? `: ${serverMessage}` : ''}`,
    )
  }
}

export class NetworkError extends ClashError {
  constructor(cause?: unknown) {
    super(
      'network',
      'Transport request failed',
      cause === undefined ? undefined : { cause },
    )
  }
}

export class TimeoutError extends ClashError {
  constructor() {
    super('timeout', 'Operation timed out')
  }
}

export class AbortError extends ClashError {
  // Only transport-sanitized reasons may be supplied here.
  constructor(cause?: unknown) {
    super(
      'abort',
      'Operation cancelled',
      cause === undefined ? undefined : { cause },
    )
  }
}

export class DecodeError extends ClashError {
  constructor(message = 'Invalid response data') {
    super('decode', message)
  }
}

export class OperationError extends ClashError {
  constructor(readonly result: Readonly<Record<string, unknown>>) {
    super('operation', 'Server reported an unsuccessful operation')
  }
}

export class UnsupportedTransportError extends ClashError {
  constructor() {
    super('unsupported-transport', 'Requested transport is unavailable')
  }
}

export class UnsupportedCapabilityError extends ClashError {
  constructor(readonly capability: string) {
    super('unsupported-capability', `Unsupported capability: ${capability}`)
  }
}

export class StreamError extends ClashError {
  constructor(
    message = 'Stream connection failed',
    readonly recoverable = true,
  ) {
    super('stream', message)
  }
}

export class BufferOverflowError extends ClashError {
  constructor() {
    super('buffer-overflow', 'Log buffer capacity exceeded')
  }
}

export class ClientDisposedError extends ClashError {
  constructor() {
    super('client-disposed', 'Client has been disposed')
  }
}
