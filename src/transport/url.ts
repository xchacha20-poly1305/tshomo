import { InputError } from '../errors.js'

export type Query = Record<string, string | number | boolean | undefined>

export function baseUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new InputError('baseUrl must be an absolute HTTP(S) URL')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    input.includes('?') ||
    input.includes('#')
  ) {
    throw new InputError(
      'baseUrl must use HTTP(S) without credentials, query or fragment',
    )
  }
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/'
  }
  return url
}

export function endpoint(
  base: URL,
  segments: readonly string[],
  query: Query = {},
): URL {
  const encoded = segments.map((segment) => {
    if (
      typeof segment !== 'string' ||
      segment.length === 0 ||
      segment === '.' ||
      segment === '..'
    ) {
      throw new InputError(
        'Path segments must be nonempty and must not be dot segments',
      )
    }
    try {
      return encodeURIComponent(segment)
    } catch {
      throw new InputError('Path segments must be valid Unicode strings')
    }
  })
  const url = new URL(base)
  url.pathname += encoded.join('/')
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

export function websocketUrl(url: URL, secret?: string): string {
  const ws = new URL(url)
  ws.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (secret) {
    ws.searchParams.set('token', secret)
  }
  return ws.href
}

export function duration(
  value: number,
  label: string,
  allowZero = true,
): number {
  if (
    !Number.isFinite(value) ||
    value < (allowZero ? 0 : 1) ||
    !Number.isSafeInteger(value) ||
    value > 2_147_483_647
  ) {
    throw new InputError(
      `${label} must be an integer ${allowZero ? '>= 0' : '>= 1'} and <= 2147483647`,
    )
  }
  return value
}
