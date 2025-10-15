locals {
  policies = {
    "sx-trading" = <<'HCL'
path "secret/data/trading/sx/*" { capabilities = ["read", "list"] }
path "secret/metadata/trading/sx" { capabilities = ["list"] }
path "secret/metadata/trading/sx/*" { capabilities = ["list"] }
path "sys/leases/renew" { capabilities = ["update"] }
path "sys/leases/revoke" { capabilities = ["update"] }
HCL
    "azuro-trading" = <<'HCL'
path "secret/data/trading/azuro/*" { capabilities = ["read", "list"] }
path "secret/metadata/trading/azuro" { capabilities = ["list"] }
path "secret/metadata/trading/azuro/*" { capabilities = ["list"] }
path "sys/leases/renew" { capabilities = ["update"] }
path "sys/leases/revoke" { capabilities = ["update"] }
HCL
    "rotation-engine" = <<'HCL'
path "secret/data/trading/*" { capabilities = ["create", "update", "delete", "read", "list"] }
path "secret/metadata/trading" { capabilities = ["list"] }
path "secret/metadata/trading/*" { capabilities = ["list"] }
path "sys/leases/*" { capabilities = ["update"] }
path "sys/audit" { capabilities = ["read", "list"] }
HCL
  }

  approles = {
    "sx-trader" = {
      policies           = ["sx-trading"]
      token_ttl          = "24h"
      token_max_ttl      = "72h"
      secret_id_ttl      = "720h"
      secret_id_num_uses = 2
    }
    "azuro-trader" = {
      policies           = ["azuro-trading"]
      token_ttl          = "24h"
      token_max_ttl      = "72h"
      secret_id_ttl      = "720h"
      secret_id_num_uses = 2
    }
    "secrets-rotation" = {
      policies           = ["rotation-engine"]
      token_ttl          = "4h"
      token_max_ttl      = "24h"
      secret_id_ttl      = "720h"
      secret_id_num_uses = 0
    }
  }
}
