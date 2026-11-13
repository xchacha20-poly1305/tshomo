# Fixture 来源

`wire.json` 是根据源码手工构造的脱敏样例，**不是实际内核抓包**。地址使用文档地址与保留域名，计数和名称为测试数据。

| Fixture            | 来源与固定 revision                                                                                         | 源码位置                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| groups、groupDelay | mihomo `9f053c49075de076d83d3e5918241e410f7e9adf`；sing-box fork `c79439156daaf64f53800a162d1f9741b2d5012a` | `hub/route/groups.go`；`experimental/clashapi/api_meta_group.go`                                   |
| dnsUpper           | 同上两个内核                                                                                                | `hub/route/dns.go`；`experimental/clashapi/dns.go`，实际为 `Status/Question/TTL`                   |
| dnsLower           | clashapi-go `ae04120f91a1616574f8067c2173f3607774ade6`                                                      | `client.go` 的 DNSResponse / DnsRR 声明；仅兼容参考类型，不证明目标内核使用小写                    |
| providerUpper      | 上述 mihomo / sing-box fork                                                                                 | `adapter/provider/subscription_info.go`；`adapter/provider.go` 的 SubscriptionInfo 无小写 JSON tag |
| providerLower      | 上述 clashapi-go                                                                                            | `client.go` 的 SubscriptionInfo JSON tag                                                           |
| ruleProviderNames  | 上述 clashapi-go                                                                                            | `client.go` 的 RuleProvidersResponse.UnmarshalJSON 兼容分支                                        |
| connections        | 上述 clashapi-go；zashboard `9e77e239b76a717a75ae73cd608f139a83f4c9f8`                                      | `client.go`、`src/types/index.d.ts`；端口变体按两端类型建模                                        |

HTTP NDJSON 的依据为 mihomo `hub/route/server.go` 与 sing-box `experimental/clashapi/server.go`、`api_meta.go` 中的 JSON encoder 和 flush 行为。分片、EOF 与清理测试由本地服务构造，不代表真实内核生命周期已验证。
