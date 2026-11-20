# Nexo Assist

Assistente de TI em chat ([demo](https://nexo-assist-amber.vercel.app)). O funcionário descreve o problema, e um agent (Mastra + LLM com tool calling: Groq ou Gemini) abre e acompanha chamados em um serviço de chamados separado. Quando o caso foge do que o agent resolve, a conversa passa para um analista humano, que atende pelo console.

## Como rodar

Pré-requisitos: Node 22.9 ou superior, Docker e npm.

```bash
npm ci
cp .env.example .env        # passo manual
```

Edite o `.env` e preencha:

- `GOOGLE_GENERATIVE_AI_API_KEY`: chave do Google AI Studio, para modelos `google/...`.
- `GROQ_API_KEY`: chave gratuita da Groq, para modelos `groq/...`. O deploy usa uma cadeia de três modelos gratuitos (ver "Modelo e custo").
- `SESSION_SECRET`: no mínimo 32 caracteres. Gere com `openssl rand -base64 48`.

Depois:

```bash
npm run db:up        # Postgres no Docker (volume nomeado)
npm run db:migrate   # migra os dois bancos (app e chamados)
npm run db:seed      # usuários, artigos da central e chamados de exemplo
```

Suba os dois processos, cada um em um terminal (o `npm run dev` da raiz roda os workspaces em sequência e ficaria preso no primeiro):

```bash
npm run dev -w @nexo/tickets   # serviço de chamados
npm run dev -w @nexo/web       # chat, console e agent
```

### Porta do Postgres

O `docker-compose.yml` publica o Postgres em `${POSTGRES_PORT:-5432}`, e as URLs do `.env.example` usam 5432. Se a 5432 já estiver ocupada na sua máquina, defina `POSTGRES_PORT=5433` e troque a porta nas duas URLs de banco do `.env`. O E2E local (`playwright.config.ts`) assume 5433, a menos que você defina `E2E_DB_PORT`. No CI a porta é 5432.

### Comandos

| Comando | O que faz |
| --- | --- |
| `npm run lint \| typecheck \| test \| build` | Qualidade, em todos os workspaces |
| `npm run test:integration` | Testes com Testcontainers (precisa de Docker) |
| `npm run e2e` | Playwright. Antes, rode `npx playwright install chromium`. O global-setup migra e popula os dois bancos (idempotente) e reinicia o usuário do E2E (diego.ramos) e a conversa de seed da Ana |
| `npm run eval` | Avaliação das decisões do agent contra o modelo real (ver abaixo) |
| `bash .github/scripts/test-hooks.sh` e `bash .github/scripts/check-forbidden-terms.sh` | Checagens da esteira |

## Deploy

**Demo:** https://nexo-assist-amber.vercel.app. Entre como `ana.souza@nexo.com.br` (funcionária) ou `rafael.lima@nexo.com.br` (analista), com qualquer senha não vazia. Use duas janelas, uma delas anônima, para ver o chat e o console ao mesmo tempo.

Produção na Vercel (web e serviço de chamados em projetos separados) com Postgres no Neon, publicada por GitHub Actions depois que a CI passa na `main` (`.github/workflows/deploy.yml`). Topologia, segredos e trade-offs em [docs/deploy.md](docs/deploy.md).

## Usuários de exemplo

O e-mail é `<id>@nexo.com.br`. A senha pode ser qualquer texto não vazio.

| Id | Perfil |
| --- | --- |
| ana.souza | Funcionária, Windows 11, Financeiro |
| carla.mendes | Funcionária, RH, Windows 11 |
| bruno.tavares | Funcionário, macOS 14 |
| diego.ramos | Funcionário, Ubuntu 22.04, Engenharia |
| elisa.prado | Funcionária, Windows 11 |
| fabio.nunes | Funcionário, Windows 10, Logística |
| gabriela.rocha | Funcionária, Windows 11, Jurídico |
| rafael.lima | Analista N1 |
| julia.castro | Analista N2 |

O login é uma **autenticação de demonstração**: qualquer senha preenchida entra com um e-mail do seed. Não é autenticação de produção.

## Arquitetura

```
 Navegador (chat do funcionário / console do analista)
        |  HTTP + polling
        v
 apps/web (Next.js)
   rotas de API --> agent (Mastra + LLM, 8 tools)
        |                      |
        |                      +--> TicketGateway (porta)
        v                                 |  HTTP, Bearer, retry, Idempotency-Key
   Postgres nexo_app                      v
   (conversas, mensagens,        services/tickets (Hono)
    rascunhos, traces)             Postgres nexo_tickets
                                   (chamados, falha injetável)

 packages/domain: tipos, categorias, prioridade e SLA (TypeScript puro)
```

O app e o serviço de chamados são processos e bancos distintos. Conversas, chamados e estado sobrevivem a reinício.

## Como o agent decide

**Fluxo de um turno**

1. A rota recebe a mensagem, confere sessão, limite de 30 mensagens e o estado da conversa. Se a conversa está com o analista, o agent não responde.
2. O servidor carrega as últimas 20 mensagens do banco (o cliente nunca manda histórico) e chama o agent com `maxSteps: 6`.
3. O agent usa as tools, responde em pt-BR e encerra chamando `record_decision` (intenção, entendimento, ação, confiança e justificativa).
4. O servidor persiste a resposta, os cards e o trace da decisão.

**Tools:** `search_my_tickets`, `get_ticket`, `search_help_center`, `classify_priority`, `prepare_ticket_draft`, `present_choices`, `handoff_to_analyst`, `record_decision`.

**Regras fora da LLM.** A LLM informa fatos; prioridade, prazo, reabertura e duplicidade são calculados em código (`packages/domain`). O `employeeId` vem só da sessão. Chamado de outro usuário responde "não encontrado".

**Confirmação só pela UI.** O agent apenas monta rascunhos. O chamado nasce em `POST /api/drafts/:id/confirm`, com `Idempotency-Key = draft.id`: confirmar duas vezes gera no máximo um chamado (409 depois).

**Política de confiança.** Confiança abaixo de 0.6 transfere a conversa para o analista. Também há transferência a pedido do usuário, para chamado crítico e para chamado vencido.

Os motivos estão em `docs/adr/`.

## Como a qualidade foi garantida

- **Unitários:** regras de domínio (prioridade, SLA, reabertura), tools, mapeamento do chat, avaliador e runner do eval. O agent roda sem rede com o modelo roteirizado.
- **Integração:** repositórios e o serviço de chamados contra Postgres real, com Testcontainers.
- **E2E:** Playwright cobre o fluxo do chat e do console com o modelo roteirizado.
- **Esteira:** lint, typecheck, testes, verificação de termos proibidos e dos hooks.
- **Avaliação das decisões (eval):** 12 cenários em `apps/web/evals/scenarios.ts` conferem quais tools o agent chama, com quais argumentos, a intenção, o rascunho, a transferência e o texto da resposta.

### Resultado do eval

Rodada completa em 19/11/2026 com a cadeia gratuita da Groq (`gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b`): **75% (9 de 12)**, abaixo do mínimo de 90%. Média de **9.773 tokens por cenário**.

| Falha | Causa | Ajuste feito |
|---|---|---|
| 05: status do chamado do notebook lento | respondeu só com a busca, sem `get_ticket` (que traz o prazo) | regra: status sempre por `get_ticket` |
| 07: senha do SAP bloqueada de novo | não montou o rascunho de reabertura nessa rodada (passou numa rodada isolada antes) | regra: reabrir sem pedir confirmação antes |
| 08: Outlook parou de sincronizar | categoria `Software` em vez de `E-mail` | exemplos por categoria nas regras |

Depois dos ajustes, o cenário 05 passou numa rodada isolada. Os cenários 07 e 08 não foram medidos de novo. **A taxa final depois dos ajustes não foi medida, e foi uma escolha.** As rodadas anteriores, com regras menos explícitas, deram 42% a 67% por modelo. A maior parte das falhas vinha de regras implícitas nas instruções, não do modelo.

**Por que o eval parou aqui.** O PRD não pede eval: ele pede "uso consciente do modelo, pensando em custo por conversa". O eval é uma ferramenta de desenvolvimento, usada para calibrar as instruções. Cada rodada completa gasta cerca de 117 mil tokens (12 cenários x 9.773), mais de metade da cota diária gratuita de um modelo da Groq. Como a chave é a mesma da demo, rodar o eval tira cota de quem está testando o app. Prioridade: a cota fica para a avaliação manual e para a demo. O código continua no repositório, mas o eval não roda no CI, no deploy nem em nenhum ambiente publicado; só roda quando alguém executa o comando abaixo à mão.

Para rodar (de preferência com uma chave separada da demo):

```bash
npm run eval -w @nexo/web
```

O comando falha logo, com mensagem em pt-BR, se faltar a chave de algum provedor da cadeia. Com as chaves, ele roda os 12 cenários e grava no `apps/web/evals/report.md` a taxa de acerto, os tokens e o tempo por cenário. O limite de aprovação é `EVAL_MIN_PASS_RATE` (padrão 0.9). A opção `--only <trecho>` roda só os cenários cujo nome contém o trecho e não grava o relatório, o que custa uma fração da rodada completa. Um 429 por limite de minuto espera 60 s e tenta de novo, até 3 vezes; um limite diário não é repetido.

## Modelo e custo

O agent usa uma cadeia de modelos do plano gratuito da Groq, sem cartão, configurada em `NEXO_AGENT_MODEL` (lista separada por vírgula). Quando um modelo devolve 429 por cota, o próximo atende. Em produção, o `google/gemini-3.5-flash-lite` entra como último elo. Trocar de modelo ou de provedor é mudar só a variável. Detalhes e o desvio em relação ao requisito do Gemini estão na ADR 0007.

**Custo: zero.** Nenhum provedor tem cartão ou billing ativo, então não há cobrança possível. O limite real é a cota diária: cerca de 200 mil tokens por modelo na Groq, o que dá umas 60 conversas curtas por dia somando os três modelos, com os 9.773 tokens medidos por cenário. O `DAILY_LLM_TURN_LIMIT` fica abaixo disso, para o app avisar em vez de falhar. Se fosse um modelo pago, o custo por conversa seria `tokens medidos x preço por token` do modelo escolhido.

## Trade-offs

- **Login de demonstração:** qualquer senha não vazia com um e-mail do seed. Não serve para produção.
- **Limite de 30 mensagens por sessão de login:** um novo login zera a contagem.
- **Feriados:** o SLA em horário útil (seg-sex, 08:00-18:00, `America/Sao_Paulo`) ignora feriados.
- **`NEXO_AGENT_MODEL=test/scripted`:** modelo roteirizado, só para testes e E2E. A configuração o recusa quando `NODE_ENV=production` (falha ao subir). O E2E usa `next dev`, então não é afetado.
- **Polling em vez de WebSocket:** o chat e o console consultam o servidor periodicamente. Mais simples, com alguma latência.
- **Rate limit de login em memória:** 5 falhas em 60 s, por processo. Reinicia com o processo e não é compartilhado entre instâncias.
- **Busca full-text em vez de RAG:** a central tem poucos artigos (ADR 0001).
- **Histórico de 20 mensagens:** conversas longas perdem o começo.
- **Dois processos em desenvolvimento:** o `npm run dev` da raiz não sobe os dois juntos.

## O que eu faria com mais tempo

- Medir a taxa final do eval com uma chave só para ele, sem tocar na cota da demo.
- Medir tokens e custo reais por conversa e trocar a estimativa por dados.
- Autenticação real (SSO) e rate limit compartilhado (Redis ou banco).
- Calendário de feriados no cálculo de SLA.
- WebSocket ou SSE no lugar do polling.
- Um comando único que suba os dois serviços de desenvolvimento.
