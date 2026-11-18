#!/usr/bin/env bash
# Hook PreToolUse (Bash): bloqueia comandos que o projeto proíbe.
# Lê o payload JSON no stdin. Saída 0 = permitido, 2 = bloqueado (motivo no stderr).
set -u

payload="$(cat)"
cmd="$(printf '%s' "$payload" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try { process.stdout.write(String(JSON.parse(raw).tool_input?.command ?? "")); } catch {}
  });' 2>/dev/null)"

[ -z "$cmd" ] && exit 0

block() {
  echo "[guard-bash] BLOQUEADO: $1" >&2
  exit 2
}

has() { printf '%s' "$cmd" | grep -Eq "$1"; }

# Segredos: .env e .env.local (o .env.example é liberado).
has '(^|[^[:alnum:]_.-])\.env($|[^.[:alnum:]_-]|\.local)' && block "acesso a arquivos .env (use o .env.example)"

# Download seguido de execução.
has '(curl|wget|iwr|Invoke-WebRequest)[^|]*\|[[:space:]]*(ba|z)?sh' && block "download com pipe para shell"

# Instalação global.
has 'npm[[:space:]]+(i|install)[[:space:]]+(-g|--global)' && block "npm global (use dependência do projeto)"

# Histórico do git: sem force push, reset --hard, rebase e amend.
has '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]].*)?[[:space:]](-f|--force|--force-with-lease)([[:space:]=]|$)' && block "git push forçado"
has '(^|[;&|[:space:]])git[[:space:]]+reset([[:space:]].*)?[[:space:]]--hard' && block "git reset --hard"
has '(^|[;&|[:space:]])git[[:space:]]+rebase([[:space:]]|$)' && block "git rebase"
has '(^|[;&|[:space:]])git[[:space:]]+commit([[:space:]].*)?[[:space:]]--amend' && block "git commit --amend"

exit 0
