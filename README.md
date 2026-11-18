# Nexo Assist

Assistente de TI em chat. O funcionário descreve o problema, e um agent (Mastra + Google Gemini) abre e acompanha chamados em um serviço de chamados separado. Quando o caso foge do que o agent resolve, a conversa passa para um analista humano, que atende pelo console.

## Como rodar

Pré-requisitos: Node 22.9 ou superior, Docker e npm.

```bash
npm ci
cp .env.example .env        # passo manual
```

Edite o `.env` e preencha:

- `GOOGLE_GENERATIVE_AI_API_KEY`: chave do Google AI Studio.
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
| `npm run eval` | Avaliação das decisões do agent contra o Gemini real (ver abaixo) |
| `bash .github/scripts/test-hooks.sh` e `bash .github/scripts/check-forbidden-terms.sh` | Checagens da esteira |

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
   rotas de API --> agent (Mastra + Gemini, 8 tools)
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

### Resultado do eval: ainda não rodado

O eval **ainda não foi executado contra o Gemini**, por falta de chave no ambiente em que esta entrega foi feita. Não há taxa de acerto nem custo medido. O arquivo `apps/web/evals/report.md` é um marcador que diz isso. Para gerar o relatório real:

```bash
npm run eval -w @nexo/web
```

O comando falha logo, com mensagem em pt-BR, se a chave não estiver definida. Com a chave, ele roda os 12 cenários, imprime o resultado de cada um e grava no `report.md` a taxa de acerto, os tokens e o tempo por cenário. O limite de aprovação é `EVAL_MIN_PASS_RATE` (padrão 0.9). A opção `--only <trecho>` roda só cenários cujo nome contém o trecho (essa execução parcial não grava o relatório).

O eval **não roda no CI**, porque exige uma chave real e cada execução tem custo em tokens, além de variar entre execuções. Ele deve ser rodado manualmente antes de mudar `instructions.ts` ou o modelo.

## Por que Gemini Flash e quanto custa

O agent usa um modelo Flash do Gemini (`NEXO_AGENT_MODEL`, padrão `google/gemini-3.8-flash`): baixa latência, tool calling confiável e custo baixo para conversas curtas. Trocar de modelo é mudar uma variável. Detalhes no ADR 0004.

**Custo por conversa: estimativa, não medição.** Fórmula:

```
custo = turnos x (tokens_entrada x preço_entrada + tokens_saída x preço_saída)
```

Premissas de forma (não medidas): conversa típica de 6 turnos; por turno, de 2 a 4 passos de tool-calling com cerca de 4.000 tokens de entrada somados e 400 de saída. Com preços **hipotéticos** de US$ 0,30 por milhão de tokens de entrada e US$ 2,50 por milhão de saída, isso dá algo na ordem de 6 x (0,0012 + 0,001) ≈ US$ 0,013 por conversa. Confira a tabela de preços vigente do modelo e substitua os números. O teto no pior caso é limitado por 30 mensagens por sessão, 6 passos por turno e 20 mensagens de contexto, além do `DAILY_LLM_TURN_LIMIT`. O `npm run eval` imprime os tokens reais por cenário, o que permite trocar esta estimativa por uma medida.

## Trade-offs

- **Login de demonstração:** qualquer senha não vazia com um e-mail do seed. Não serve para produção.
- **Limite de 30 mensagens por sessão de login:** um novo login zera a contagem.
- **Feriados:** o SLA em horário útil (seg-sex, 08:00-18:00, `America/Sao_Paulo`) ignora feriados.
- **`NEXO_AGENT_MODEL=test/scripted`:** modelo roteirizado, só para testes e E2E. É liberado por configuração e não é bloqueado em produção.
- **Polling em vez de WebSocket:** o chat e o console consultam o servidor periodicamente. Mais simples, com alguma latência.
- **Rate limit de login em memória:** 5 falhas em 60 s, por processo. Reinicia com o processo e não é compartilhado entre instâncias.
- **Busca full-text em vez de RAG:** a central tem poucos artigos (ADR 0001).
- **Histórico de 20 mensagens:** conversas longas perdem o começo.
- **Dois processos em desenvolvimento:** o `npm run dev` da raiz não sobe os dois juntos.

## O que eu faria com mais tempo

- Rodar o eval com a chave real, registrar o relatório e ajustar `instructions.ts` com base nos cenários que falharem.
- Medir tokens e custo reais por conversa e trocar a estimativa por dados.
- Autenticação real (SSO) e rate limit compartilhado (Redis ou banco).
- Calendário de feriados no cálculo de SLA.
- WebSocket ou SSE no lugar do polling.
- Bloquear o modelo `test/scripted` em produção.
- Rodar o eval em um job manual do CI, com a chave em segredo.
- Um comando único que suba os dois serviços de desenvolvimento.
