#!/usr/bin/env bash
set -euo pipefail

require_env(){ local name="$1"; [[ -n "${!name:-}" ]] || { echo "[vault-smoke] missing env $name" >&2; exit 1; }; }
mask(){ [[ -n "${GITHUB_ACTIONS:-}" ]] && printf '::add-mask::%s\n' "$1"; }
log(){ printf '[vault-smoke] %s\n' "$*" >&2; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "[vault-smoke] missing tool $1" >&2; exit 1; }; }

vault_login(){
  local role_id="$1" secret_id="$2" label="$3" payload response token
  payload=$(jq -n --arg role_id "$role_id" --arg secret_id "$secret_id" '{role_id:$role_id,secret_id:$secret_id}')
  response=$(curl -sS --fail -H "Content-Type: application/json" -d "$payload" "$VAULT_ADDR/v1/auth/approle/login") || {
    echo "[vault-smoke] login failed for $label" >&2; exit 1; }
  token=$(jq -r '.auth.client_token // empty' <<<"$response")
  [[ -n "$token" ]] || { echo "[vault-smoke] missing token for $label" >&2; exit 1; }
  mask "$token"; printf '%s' "$token"
}

verify_secret(){
  local token="$1" path="$2" raw_keys="$3" label="$4" response data
  response=$(curl -sS --fail -H "X-Vault-Token: $token" "$VAULT_ADDR/v1/$path") || {
    echo "[vault-smoke] read failure for $label at $path" >&2; exit 1; }
  data=$(jq '.data.data' <<<"$response")
  [[ "$data" != "null" ]] || { echo "[vault-smoke] empty payload for $label" >&2; exit 1; }
  IFS=',' read -r -a keys <<<"$raw_keys"
  for key in "${keys[@]}"; do
    key="${key// /}"; [[ -z "$key" ]] && continue
    jq -e --arg key "$key" 'has($key)' <<<"$data" >/dev/null || {
      echo "[vault-smoke] missing key $key for $label" >&2; exit 1; }
  done
}

revoke(){ local token="$1"; curl -sS -X POST -H "X-Vault-Token: $token" "$VAULT_ADDR/v1/auth/token/revoke-self" >/dev/null 2>&1 || true; }

main(){
  for var in VAULT_ADDR SX_ROLE_ID SX_SECRET_ID AZURO_ROLE_ID AZURO_SECRET_ID; do require_env "$var"; done
  need curl; need jq
  local sx_path="${SX_SECRET_PATH:-secret/data/trading/sx/wallet}"
  local azuro_path="${AZURO_SECRET_PATH:-secret/data/trading/azuro/wallet}"
  local sx_keys="${SX_REQUIRED_KEYS:-private_key,address,odds_api_token}"
  local azuro_keys="${AZURO_REQUIRED_KEYS:-private_key,address,liquidity_signature}"
  log "login SX"; local sx_token; sx_token=$(vault_login "$SX_ROLE_ID" "$SX_SECRET_ID" sx)
  log "login Azuro"; local azuro_token; azuro_token=$(vault_login "$AZURO_ROLE_ID" "$AZURO_SECRET_ID" azuro)
  trap 'revoke "$sx_token"; revoke "$azuro_token"' EXIT
  log "validate SX"; verify_secret "$sx_token" "$sx_path" "$sx_keys" sx
  log "validate Azuro"; verify_secret "$azuro_token" "$azuro_path" "$azuro_keys" azuro
  log "secrets validation successful"
}

main "$@"
