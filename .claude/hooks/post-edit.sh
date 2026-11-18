#!/usr/bin/env bash
# Hook PostToolUse (Edit|Write): typecheck e testes relacionados do workspace editado.
# Saída 0 = ok ou nada a verificar; 2 = falhou (stderr volta para o Claude).
# Desligar: SKIP_POST_EDIT_HOOK=1
set -u

[ "${SKIP_POST_EDIT_HOOK:-0}" = "1" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ROOT="$(printf '%s' "$ROOT" | tr "\\\\" "/")"
MAX_LINES=60

payload="$(cat)"
file="$(printf '%s' "$payload" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const i = JSON.parse(raw).tool_input ?? {};
      process.stdout.write(String(i.file_path ?? i.path ?? ""));
    } catch {}
  });' 2>/dev/null)"

file="$(printf '%s' "$file" | tr "\\\\" "/")"
[ -z "$file" ] && exit 0

# Normaliza d:/x e D:/x para /d/x (Git Bash) e compara sem diferenciar caixa.
to_posix() {
  local p="$1"
  if [[ "$p" =~ ^([A-Za-z]):/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]}"
    p="/$(printf '%s' "$drive" | tr 'A-Z' 'a-z')/${BASH_REMATCH[2]}"
  fi
  printf '%s' "$p"
}
file="$(to_posix "$file")"
root="$(to_posix "$ROOT")"

lower_file="$(printf '%s' "$file" | tr 'A-Z' 'a-z')"
lower_root="$(printf '%s' "$root" | tr 'A-Z' 'a-z')"

case "$lower_file" in
  "$lower_root"/*) rel="${file:${#root}+1}" ;;
  /*) exit 0 ;;
  *) rel="$file" ;;
esac

case "$rel" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
case "$rel" in
  *node_modules/*|*/dist/*|*/.next/*|*.d.ts) exit 0 ;;
esac

case "$rel" in
  apps/web/*) ws="apps/web" ;;
  services/tickets/*) ws="services/tickets" ;;
  packages/domain/*) ws="packages/domain" ;;
  *) exit 0 ;;
esac

if [ ! -d "$ROOT/node_modules" ]; then
  echo "[post-edit] node_modules ausente: typecheck e testes NAO foram verificados ($rel). Rode npm ci." >&2
  exit 0
fi
if [ ! -f "$ROOT/$ws/tsconfig.json" ]; then
  exit 0
fi

cd "$ROOT" || exit 0

if ! out="$(npx --no-install tsc --noEmit -p "$ws" 2>&1)"; then
  {
    echo "[post-edit] TYPECHECK FALHOU em $ws apos editar $rel"
    printf '%s\n' "$out" | head -n "$MAX_LINES"
  } >&2
  exit 2
fi

# Testes: só se o vitest estiver instalado.
if [ -x "$ROOT/node_modules/.bin/vitest" ] || [ -x "$ROOT/$ws/node_modules/.bin/vitest" ]; then
  if ! out="$(cd "$ROOT/$ws" && npx --no-install vitest related "$ROOT/$rel" --run --passWithNoTests 2>&1)"; then
    {
      echo "[post-edit] TESTES FALHARAM em $ws apos editar $rel"
      printf '%s\n' "$out" | tail -n "$MAX_LINES"
    } >&2
    exit 2
  fi
  echo "[post-edit] typecheck e testes OK ($rel)"
else
  echo "[post-edit] typecheck OK ($rel); vitest nao instalado em $ws, testes ignorados"
fi
exit 0
