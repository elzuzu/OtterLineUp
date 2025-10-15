#!/usr/bin/env bash
set -euo pipefail

require_env(){ local name="$1"; [[ -n "${!name:-}" ]] || { echo "[vault-smoke] missing env $name" >&2; exit 1; }; }
mask(){ [[ -n "${GITHUB_ACTIONS:-}" ]] && printf '::add-mask::%s\n' "$1"; }
log(){ printf '[vault-smoke] %s\n' "$*" >&2; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "[vault-smoke] missing tool $1" >&2; exit 1; }; }

audit_entry(){
  local label="$1" path="$2" request_id="$3" result="${4:-success}"
  local entity_var="${label^^}_ENTITY" entity timestamp workflow run_id source_ip req_id
  entity="${!entity_var-}"
  if [[ -z "$entity" ]]; then entity="approle:${label}-trader"; fi
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  workflow="${GITHUB_WORKFLOW:-local}"
  run_id="${GITHUB_RUN_ID:-0}"
  source_ip="${VAULT_SOURCE_IP:-ci-runner}"
  req_id="${request_id:-unknown}"
  jq -c \
    --arg timestamp "$timestamp" \
    --arg request_id "$req_id" \
    --arg entity "$entity" \
    --arg path "$path" \
    --arg action "read" \
    --arg result "$result" \
    --arg source "$source_ip" \
    --arg workflow "$workflow" \
    --arg run_id "$run_id" \
    '{timestamp:$timestamp,request_id:$request_id,entity:$entity,path:$path,action:$action,result:$result,source_ip:$source,metadata:{workflow:$workflow,github_run_id:$run_id}}'
}

append_audit(){
  local entry_json="$1" audit_file="logs/secrets_audit.json"
  mkdir -p "$(dirname "$audit_file")"
  python3 - "$audit_file" "$entry_json" <<'PY'
import json
import os
import sys

path = sys.argv[1]
entry_raw = sys.argv[2]
entry = json.loads(entry_raw)
if not isinstance(entry, dict):
    raise SystemExit("audit entry must be an object")
data = []
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as fh:
        try:
            parsed = json.load(fh)
            if isinstance(parsed, list):
                data = parsed
        except json.JSONDecodeError:
            data = []
data.append(entry)
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
PY
}

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
  local token="$1" path="$2" raw_keys="$3" label="$4" response data request_id
  if ! response=$(curl -sS --fail -H "X-Vault-Token: $token" "$VAULT_ADDR/v1/$path"); then
    append_audit "$(audit_entry "$label" "$path" "" "failure")"
    echo "[vault-smoke] read failure for $label at $path" >&2; exit 1; fi
  data=$(jq '.data.data' <<<"$response")
  request_id=$(jq -r '.request_id // empty' <<<"$response")
  if [[ "$data" == "null" ]]; then
    append_audit "$(audit_entry "$label" "$path" "$request_id" "failure")"
    echo "[vault-smoke] empty payload for $label" >&2; exit 1; fi
  IFS=',' read -r -a keys <<<"$raw_keys"
  for key in "${keys[@]}"; do
    key="${key// /}"; [[ -z "$key" ]] && continue
    if ! jq -e --arg key "$key" 'has($key)' <<<"$data" >/dev/null; then
      append_audit "$(audit_entry "$label" "$path" "$request_id" "failure")"
      echo "[vault-smoke] missing key $key for $label" >&2; exit 1; fi
  done
  printf '%s\n' "$request_id"
}

revoke(){ local token="$1"; curl -sS -X POST -H "X-Vault-Token: $token" "$VAULT_ADDR/v1/auth/token/revoke-self" >/dev/null 2>&1 || true; }

main(){
  for var in VAULT_ADDR SX_ROLE_ID SX_SECRET_ID AZURO_ROLE_ID AZURO_SECRET_ID; do require_env "$var"; done
  need curl; need jq; need python3
  local sx_path="${SX_SECRET_PATH:-secret/data/trading/sx/wallet}"
  local azuro_path="${AZURO_SECRET_PATH:-secret/data/trading/azuro/wallet}"
  local sx_keys="${SX_REQUIRED_KEYS:-private_key,address,odds_api_token}"
  local azuro_keys="${AZURO_REQUIRED_KEYS:-private_key,address,liquidity_signature}"
  log "login SX"; local sx_token; sx_token=$(vault_login "$SX_ROLE_ID" "$SX_SECRET_ID" sx)
  log "login Azuro"; local azuro_token; azuro_token=$(vault_login "$AZURO_ROLE_ID" "$AZURO_SECRET_ID" azuro)
  trap 'revoke "$sx_token"; revoke "$azuro_token"' EXIT
  log "validate SX"; local sx_request; sx_request=$(verify_secret "$sx_token" "$sx_path" "$sx_keys" sx)
  append_audit "$(audit_entry sx "$sx_path" "$sx_request")"
  log "validate Azuro"; local azuro_request; azuro_request=$(verify_secret "$azuro_token" "$azuro_path" "$azuro_keys" azuro)
  append_audit "$(audit_entry azuro "$azuro_path" "$azuro_request")"
  log "secrets validation successful"
}

main "$@"
