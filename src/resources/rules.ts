import { rules as decode } from '../decode.js'
import { InputError } from '../errors.js'
import type { RequestOptions } from '../options.js'
import type { HttpContext } from '../transport/http.js'

export function rules(context: HttpContext) {
  return {
    list: (options?: RequestOptions) =>
      context.json(
        'rules.list',
        { method: 'GET', path: ['rules'] },
        decode,
        options,
      ),
    disableByIndex(
      changes: Readonly<Record<number, boolean>>,
      options?: RequestOptions,
    ) {
      context.check('rules.disableByIndex')
      for (const [key, value] of Object.entries(changes)) {
        const index = Number(key)
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          typeof value !== 'boolean'
        ) {
          throw new InputError(
            'Rule changes require nonnegative integer indices and boolean values',
          )
        }
      }
      return context.void(
        'rules.disableByIndex',
        { method: 'PATCH', path: ['rules', 'disable'], json: changes },
        options,
      )
    },
  }
}
