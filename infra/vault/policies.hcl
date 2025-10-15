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
control_group "trading-export" {
  policies            = ["export-approver"]
  shared_secret       = false
  enforcement_level   = "permissive"
}
HCL
    "export-approver" = <<'HCL'
path "secret/data/trading/*" { capabilities = ["read"] }
path "secret/metadata/trading" { capabilities = ["list"] }
path "sys/control-group/authorize" { capabilities = ["update"] }
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

  rotation_windows = {
    "sx-trader"        = "720h"
    "azuro-trader"     = "720h"
    "secrets-rotation" = "720h"
  }

  audit_devices = {
    "file-primary" = {
      type        = "file"
      description = "Primary immutable audit trail for trading secrets"
      options = {
        file_path = "/var/log/vault/vault_audit.log"
        mode      = "0640"
      }
    }
    "socket-forward" = {
      type        = "socket"
      description = "Forward audit events to SIEM over TLS"
      options = {
        address    = "siem-audit.service.consul:1514"
        tls_enable = "true"
      }
    }
  }

  alert_policies = {
    "failed-auth-burst" = {
      description = "Alert on consecutive Vault auth failures for trading roles"
      source      = "vault_audit"
      condition = {
        threshold = 5
        window    = "10m"
        filter    = "type:request error:true path:\"auth/approle/login\""
      }
      actions = ["slack://sec-operations", "pagerduty://secrets-oncall"]
    }
    "control-group-export" = {
      description = "Notify when trading secrets export requires dual approval"
      source      = "vault_audit"
      condition = {
        threshold = 1
        window    = "1m"
        filter    = "type:response path:\"sys/control-group/request\""
      }
      actions = ["slack://sec-operations"]
    }
  }
}
