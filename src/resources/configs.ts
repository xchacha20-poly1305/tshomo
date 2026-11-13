import { config, isJson, object } from '../decode.js'
import { InputError } from '../errors.js'
import type {
  ConfigLoadInput,
  ConfigLoadOptions,
  RequestOptions,
} from '../options.js'
import type { ConfigPatch } from '../types.js'
import type { HttpContext } from '../transport/http.js'

export function configs(context: HttpContext) {
  return {
    get: (options?: RequestOptions) =>
      context.json(
        'configs.get',
        { method: 'GET', path: ['configs'] },
        config,
        options,
      ),
    patch(patch: ConfigPatch, options?: RequestOptions) {
      context.check('configs.patch')
      if (!object(patch)) {
        throw new InputError('Config patch must be an object')
      }
      // Undefined object properties mean omitted; array holes/undefined are invalid JSON inputs.
      const validate = (value: unknown): boolean =>
        value === undefined ||
        isJson(value) ||
        (object(value) && Object.values(value).every(validate))
      try {
        if (!validate(patch) || patch.tun === null) {
          throw new InputError()
        }
        config(patch)
      } catch {
        throw new InputError(
          'Config patch must contain JSON values with valid known fields',
        )
      }
      return context.void(
        'configs.patch',
        { method: 'PATCH', path: ['configs'], json: patch },
        options,
      )
    },
    load(
      input: ConfigLoadInput,
      loadOptions: ConfigLoadOptions = {},
      options?: RequestOptions,
    ) {
      context.check('configs.load')
      if (
        !object(input) ||
        Object.hasOwn(input, 'path') === Object.hasOwn(input, 'payload')
      ) {
        throw new InputError('Provide exactly one of path or payload')
      }
      const body = Object.hasOwn(input, 'path')
        ? { path: input.path }
        : { payload: input.payload }
      if (!Object.values(body).every((value) => typeof value === 'string')) {
        throw new InputError('Config path or payload must be a string')
      }
      return context.void(
        'configs.load',
        {
          method: 'PUT',
          path: ['configs'],
          query: { force: loadOptions.force },
          json: body,
        },
        options,
      )
    },
    reload: (options?: RequestOptions) =>
      context.void(
        'configs.reload',
        {
          method: 'PUT',
          path: ['configs'],
          query: { reload: true },
          json: { path: '', payload: '' },
        },
        options,
      ),
    updateGeo: (options?: RequestOptions) =>
      context.void(
        'configs.updateGeo',
        { method: 'POST', path: ['configs', 'geo'] },
        options,
      ),
  }
}
