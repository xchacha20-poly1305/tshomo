import { extensionTransport, type ExtensionFactory } from './extensions.js'
import type { ClashClientOptions } from './options.js'
import { HttpContext } from './transport/http.js'
import { system } from './resources/system.js'
import { configs } from './resources/configs.js'
import { proxies, groups } from './resources/proxies.js'
import { proxyProviders, ruleProviders } from './resources/providers.js'
import { rules } from './resources/rules.js'
import { connections } from './resources/connections.js'
import { metrics } from './resources/metrics.js'
import { logs } from './resources/logs.js'
import { dns, cache } from './resources/dns.js'
import { storage } from './resources/storage.js'

export function createClashClient(options: ClashClientOptions) {
  const context = new HttpContext(options)
  const transport = extensionTransport(context)
  const factory = options.webSocketFactory
  return {
    system: system(context),
    configs: configs(context),
    proxies: proxies(context),
    groups: groups(context),
    proxyProviders: proxyProviders(context),
    ruleProviders: ruleProviders(context),
    rules: rules(context),
    connections: connections(context, factory),
    metrics: metrics(context, factory),
    logs: logs(context, factory),
    dns: dns(context),
    cache: cache(context),
    storage: storage(context),
    extend<T>(factory: ExtensionFactory<T>): T {
      context.check()
      return factory(transport)
    },
    dispose: () => context.dispose(),
  }
}

export type ClashClient = ReturnType<typeof createClashClient>
