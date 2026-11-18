#!/usr/bin/env bash
# Hook PreToolUse (Bash): bloqueia comandos que o projeto proíbe.
# Lê o payload JSON no stdin. Saída 0 = permitido, 2 = bloqueado (motivo no stderr).
set -u

payload="$(cat)"

reason="$(printf '%s' "$payload" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try { cmd = String(JSON.parse(raw).tool_input?.command ?? ""); } catch { return; }

  // Texto que segue por pipe para um shell/eval é executado: não pode ser descartado.
  const pipeRe = /\|\s*(?:sudo(?:\s+-\S+)*\s+)?(?:(?:ba|z|da)?sh|eval)(?=[\s)`;&\x27"]|$)/;

  // 1. Remove o corpo de heredocs (o texto entre <<X e a linha terminadora).
  const kept = [];
  let term = null;
  for (const line of cmd.split("\n")) {
    if (term !== null) {
      if (line.trim() === term) term = null;
      continue;
    }
    kept.push(line);
    const m = line.match(/<<-?\s*[\x27"]?(\w+)[\x27"]?/);
    if (m && !pipeRe.test(line)) term = m[1];
  }
  let c = kept.join("\n");
  const pipesToShell = pipeRe.test(c);

  // 2. bash -c "..." executa o texto: o conteúdo vira um comando a mais.
  const inner = [];
  const subRe = /\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`/g;
  for (const m of c.matchAll(/\b(?:(?:ba|z|da)?sh\s+-c|eval)\s+("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27)/g)) {
    const body = m[1].slice(1, -1);
    inner.push(body);
    // Aspas duplas externas expandem $(...) antes de o shell interno rodar.
    if (m[1][0] === "\"") inner.push(...(body.match(subRe) ?? []));
  }
  c = c + "\n" + inner.join("\n");

  // 3. Remove textos entre aspas de echo/printf e de mensagens de commit (são só texto),
  //    mas mantém as substituições $(...) e `...` de aspas duplas, que executam.
  const textOnly = (quoted) => {
    if (quoted[0] === "\x27") return "\"\"";
    const subs = quoted.match(/\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`/g) ?? [];
    return "\"\" " + subs.join(" ");
  };
  if (!pipesToShell) {
    c = c.replace(/\b(echo|printf)\b((?:\s+-\w+)*)\s+("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27)/g,
      (_m, cmdName, _flags, q) => cmdName + " " + textOnly(q));
  }
  c = c.replace(/(\s(?:-m|--message)(?:\s+|=))("(?:[^"\\]|\\.)*"|\x27[^\x27]*\x27)/g,
    (_m, pre, q) => pre + textOnly(q));

  const has = (re) => re.test(c);

  // Arquivos .env: qualquer variante, exceto .env.example.
  const envTok = /(^|[\s\/\x27"=<])\.env(?:\.(?!example(?:[\s\x27";&|)`]|$))[\w.-]+)?(?=$|[\s\x27";&|)`])/;
  const readers = /(?:^|[\s(`])(?:cat|less|more|head|tail|grep|egrep|fgrep|rg|sed|awk|cp|mv|source|type|bat|xxd|od|strings|node|python3?|base64|tac|nl|cut|sort|diff|tee|dd)(?=\s|$)|^\s*\(?\s*\.\s|\bgit\s+(?:add|stash|diff|show|log|blame)(?=\s|$)/;
  for (const seg of c.split(/[;&|\n]+/)) {
    if (/<\s*\S*\.env/.test(seg) && envTok.test(seg.replace(/<\s*/, " "))) { console.log("acesso a arquivos .env (use o .env.example)"); return; }
    if (readers.test(seg) && envTok.test(seg)) { console.log("acesso a arquivos .env (use o .env.example)"); return; }
  }

  // Download seguido de execução.
  if (has(/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|\n;&]*\|\s*(sudo(\s+-\S+)*\s+)?(ba|z|da)?sh(?=[\s)`;&\x27"]|$)/) ||
      has(/\b(ba|z|da)?sh\s+<\(\s*(curl|wget)\b/) ||
      has(/\b(ba|z|da)?sh\s+-c\s+["\x27]?\$\(\s*(curl|wget)\b/)) {
    console.log("download com pipe para shell"); return;
  }

  if (has(/\bnpm\s+(i|install)\s+(-g|--global)\b/)) { console.log("npm global (use dependência do projeto)"); return; }

  const git = "(?:^|[;&|\\s])git\\s+";
  if (has(new RegExp(git + "push(?:\\s.*)?\\s(?:-f|--force|--force-with-lease)(?:[\\s=]|$)"))) { console.log("git push forçado"); return; }
  if (has(new RegExp(git + "reset(?:\\s.*)?\\s--hard"))) { console.log("git reset --hard"); return; }
  if (has(new RegExp(git + "rebase(?:\\s|$)"))) { console.log("git rebase"); return; }
  if (has(new RegExp(git + "commit(?:\\s.*)?\\s--amend"))) { console.log("git commit --amend"); return; }
});' 2>/dev/null)"

if [ -n "$reason" ]; then
  echo "[guard-bash] BLOQUEADO: $reason" >&2
  exit 2
fi
exit 0
