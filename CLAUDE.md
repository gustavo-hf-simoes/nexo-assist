# Nexo Assist

Assistente de TI em chat: o funcionário descreve o problema, o agent (Mastra + Google Gemini) abre e acompanha chamados no serviço de chamados. Monorepo TypeScript com npm workspaces.

## Mapa de pastas

- `apps/web`: Next.js (UI do chat, rotas de API, agent). Config em `src/server/config/env.ts`.
- `services/tickets`: serviço de chamados (Hono), processo e banco separados do agent.
- `packages/domain`: regras de negócio puras (tipos, categorias, prioridades, SLA).
- `infra/`, `docker-compose.yml`: Postgres com volume nomeado.
- `.claude/`: settings e hooks. `.github/`: CI, dependabot e scripts de verificação.

## Comandos

- `npm ci`: instala dependências.
- `npm run lint | typecheck | test | build`: qualidade (rodam em todos os workspaces).
- `npm run test:integration`: Testcontainers (precisa de Docker).
- `npm run db:up | db:migrate | db:seed`: banco local.
- `npm run e2e`: Playwright.
- `bash .github/scripts/test-hooks.sh` e `bash .github/scripts/check-forbidden-terms.sh`: checagens da esteira.

## Regras de ouro

- TypeScript `strict`, com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`; sem `any` e sem `@ts-ignore`.
- Nenhuma credencial no código: tudo passa por `src/server/config/env.ts` (zod), falhando cedo se faltar. `.env.example` lista todas as variáveis.
- O serviço de chamados é um processo e um banco separados do agent. Conversas, chamados e estado sobrevivem a reinício.
- Tipos de chamado: `INC` e `REQ`. Categorias exatas: `Acesso`, `Rede e VPN`, `Hardware`, `Software`, `E-mail`, `Outros`.
- Prazos: Crítica 1 h (conta 24 h), Alta 4 h úteis, Média 3 dias úteis, Baixa 5 dias úteis. Útil: seg-sex 08:00-18:00, `America/Sao_Paulo`. Reabertura em até 7 dias após resolver.
- A informação de um chamado só chega a quem o abriu; chamado de outro usuário responde "não encontrado". Escopo só TI.
- Limite de 30 mensagens por sessão. Conversa com o analista: o agent não responde.
- Criação de chamado idempotente (`Idempotency-Key = draft.id`); confirmar duas vezes gera no máximo um chamado (409 depois).
- UI em pt-BR, datas `pt-BR` e `America/Sao_Paulo`, fontes `Schibsted Grotesk` e `Newsreader`, cores do protótipo. Identificadores de código em inglês.
- Nenhum termo do projeto de origem da esteira no repositório (o CI confere).

## Nomenclatura

- Arquivos em `kebab-case`; um módulo por responsabilidade.
- Sem `export default` fora de `app/` (exigência do Next). Exceção: `services/tickets/src/vercel-entry.ts`, entrada da função na Vercel, que a plataforma exige como default.

## Testes

Teste junto com o código: cada comportamento novo entra com seu teste no mesmo commit (TDD: falha primeiro, depois passa).

## Commits

- Conventional Commits, em português, um commit por task (ex.: `feat: adiciona o cálculo de SLA`).
- Sem squash, amend ou force-push.
- Só faça commit quando for pedido.
