import {
  InputError,
  type ExtensionTransport,
  type RequestOptions,
  type Rule,
} from '../index.js'

/** A rule exposing the UUID used by reF1nd's toggle endpoint. */
export interface RefindRule extends Rule {
  uuid: string
}

/** Checks the rule shape, not the backend's identity or endpoint availability. */
export function isRefindRule(rule: Rule): rule is RefindRule {
  return typeof rule.uuid === 'string' && rule.uuid.length > 0
}

/** Opt-in extension factory; construction performs no requests. */
export function refind(transport: ExtensionTransport) {
  return {
    rules: {
      /** Toggles the current state once. Non-idempotent; do not automatically retry. */
      toggleByUuid(uuid: string, options?: RequestOptions): Promise<void> {
        if (typeof uuid !== 'string' || uuid.length === 0) {
          throw new InputError('Rule UUID must be a nonempty string')
        }
        return transport.void({ method: 'PUT', path: ['rules', uuid] }, options)
      },
    },
  }
}

export type RefindExtension = ReturnType<typeof refind>
