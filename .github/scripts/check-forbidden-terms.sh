#!/usr/bin/env bash
# Falha se algum termo proibido aparece no repositório (git grep, sem diferenciar caixa).
# Os termos vêm de FORBIDDEN_TERMS_B64 (base64 separado por vírgula), para que o
# termo nunca apareça literal no repositório.
set -u

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

TERMS_B64="${FORBIDDEN_TERMS_B64:-am95YQ==}"
found=0

IFS=',' read -r -a encoded <<<"$TERMS_B64"
for item in "${encoded[@]}"; do
  [ -z "$item" ] && continue
  term="$(printf '%s' "$item" | base64 -d 2>/dev/null)"
  [ -z "$term" ] && continue
  matches="$(git grep -i -n -I -F -e "$term" -- . ':(exclude).superpowers' ':(exclude)package-lock.json' 2>&1)"
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "Termo proibido encontrado (item base64: $item):" >&2
    echo "$matches" >&2
    found=1
  elif [ "$status" -ne 1 ]; then
    echo "git grep falhou (exit $status):" >&2
    echo "$matches" >&2
    exit 2
  fi
done

if [ "$found" -ne 0 ]; then
  exit 1
fi
echo "nenhum termo proibido encontrado"
