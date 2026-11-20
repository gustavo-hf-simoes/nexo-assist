# Deploy

Produção com custo zero: Vercel Hobby para os dois processos, Neon Free para o Postgres e o plano gratuito da Groq para o LLM. Quem publica é o GitHub Actions; o deploy automático pelo Git da Vercel fica desligado (`git.deploymentEnabled: false`).

## Topologia

| Peça | Onde | Como chega lá |
| --- | --- | --- |
| `apps/web` (Next, chat, console, agent) | Vercel, projeto `nexo-assist`, região `gru1` | `vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod` |
| `services/tickets` (Hono) | Vercel, projeto `nexo-tickets`, região `gru1` | `npm run build:vercel -w @nexo/tickets` (esbuild, Build Output API v3) + `vercel deploy --prebuilt --prod` |
| Postgres | Neon, um projeto com os bancos `nexo_app` e `nexo_tickets` | runtime pela URL *pooled*; migração e seed pela URL direta |
| LLM | Groq, plano gratuito (sem cartão) | variáveis `GROQ_API_KEY` e `NEXO_AGENT_MODEL` do projeto web |

O serviço de chamados continua sendo um processo e um banco separados do agent. Ele é público na internet, mas toda rota fora de `/health` exige o Bearer `TICKET_SERVICE_TOKEN`.

### Por que o serviço de chamados vai como bundle

O pacote é ESM com imports sem extensão e depende do `@nexo/domain` em TypeScript cru; o runtime Node da Vercel não resolve nenhum dos dois. O `scripts/build-vercel-output.ts` empacota `src/vercel-entry.ts` num único `index.cjs` e escreve o `.vercel/output` (uma função, todas as rotas para ela). O código, as rotas e as respostas são os mesmos do `npm run dev`; o teste `tests/vercel-output.test.ts` sobe o bundle e confere `/health` e a exigência do token.

### Serverless

- `DB_POOL_MAX=3` em produção: cada instância abre poucas conexões, e o pooler do Neon absorve o resto.
- O turno do agent grava a resposta depois do stream. A rota `/api/chat` registra essa gravação com `after()`, para a função não ser congelada antes de terminar, mesmo se o navegador fechar a conexão.
- O limite diário de turnos (`DAILY_LLM_TURN_LIMIT`) e a cota de 30 mensagens ficam no Postgres, então valem entre instâncias. O rate limit de login é em memória, por instância.

## Esteira

`.github/workflows/deploy.yml` roda quando a CI termina com sucesso na `main` (`workflow_run`) ou à mão (`workflow_dispatch`), sempre no commit que a CI aprovou:

1. `migrate`: `db:migrate` e `db:seed` nos dois bancos do Neon. O seed é idempotente: recoloca os dados de exemplo sem duplicar.
2. `deploy-tickets`: bundle e publicação do serviço de chamados.
3. `deploy-web`: build e publicação do web.
4. `smoke`: `GET /health` do serviço de chamados e `GET /login` do web, com algumas tentativas por causa do cold start. Roda quando as variáveis de repositório `WEB_URL` e `TICKETS_URL` existem.

Os jobs usam o environment `production` do GitHub, com estes segredos:

| Segredo | O que é |
| --- | --- |
| `VERCEL_TOKEN` | token da conta Vercel |
| `VERCEL_ORG_ID` | `orgId` do `.vercel/project.json` |
| `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_TICKETS` | `projectId` de cada projeto |
| `APP_DATABASE_URL_DIRECT`, `TICKETS_DATABASE_URL_DIRECT` | URLs diretas (sem pooler) dos dois bancos |

## Variáveis de ambiente (Production, na Vercel)

`nexo-tickets`: `TICKETS_DATABASE_URL` (pooled), `TICKET_SERVICE_TOKEN`, `TICKET_SERVICE_FAILURE_RATE=0.05`, `TICKET_SERVICE_LATENCY_MS=0`, `DB_POOL_MAX=3`.

`nexo-assist`: `APP_DATABASE_URL` (pooled), `TICKET_SERVICE_URL` (domínio de produção do `nexo-tickets`), `TICKET_SERVICE_TOKEN` (o mesmo), `SESSION_SECRET`, `GROQ_API_KEY`, `NEXO_AGENT_MODEL=groq/openai/gpt-oss-120b,groq/qwen/qwen3.8-27b,groq/openai/gpt-oss-20b`, `AGENT_MIN_CONFIDENCE=0.6`, `SESSION_MESSAGE_LIMIT=30`, `DAILY_LLM_TURN_LIMIT=150`, `DB_POOL_MAX=3`.

O `env.ts` de cada processo valida tudo com zod na subida e falha cedo se faltar algo.

## Primeira configuração

1. Neon: criar o projeto e os bancos `nexo_app` e `nexo_tickets`; copiar as URLs *pooled* e diretas.
2. Vercel: `npx vercel link` em `apps/web` (projeto `nexo-assist`, Root Directory `apps/web`) e em `services/tickets` (projeto `nexo-tickets`, framework Other); cadastrar as variáveis acima; criar um token.
3. GitHub: environment `production` com os segredos; variáveis `WEB_URL` e `TICKETS_URL` com os domínios de produção.
4. Disparar `gh workflow run deploy.yml` ou fazer push na `main`.

## Trade-offs

- Cold start: o primeiro acesso depois de um tempo parado é mais lento (função e Neon acordando).
- O plano Hobby da Vercel é para uso não comercial; serve para a demonstração.
- O login é de demonstração: qualquer pessoa com um e-mail do seed entra, inclusive como analista.
- Plano gratuito da Groq: cada modelo tem limite por minuto e por dia (200 mil tokens/dia). A cadeia em `NEXO_AGENT_MODEL` passa ao próximo modelo quando um deles devolve 429, somando as cotas, e o `DAILY_LLM_TURN_LIMIT` fica abaixo da soma, para o app avisar em vez de quebrar. Sem cartão cadastrado, não há cobrança possível.
