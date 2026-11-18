# ADR 0006: Serviço de chamados separado e resiliente

- Status: aceita
- Data: 2026-11-18

## Contexto

Na vida real o sistema de chamados é um legado: outro processo, outro banco, e ele falha. O agent não pode perder um chamado nem criar chamados duplicados quando o serviço oscila, e as conversas e os chamados precisam sobreviver a um reinício.

## Decisão

- `services/tickets` (Hono) é um **processo e um banco separados** (`nexo_tickets`) do app (`nexo_app`), no mesmo Postgres do Docker mas em bancos distintos. Ele simula o legado, inclusive com **injeção de falha** (`TICKET_SERVICE_FAILURE_RATE`, `TICKET_SERVICE_LATENCY_MS`).
- O app fala com ele por uma **porta** (`TicketGateway`) e um adaptador HTTP com `Authorization: Bearer TICKET_SERVICE_TOKEN`, retry e idempotência (`Idempotency-Key`).
- Toda leitura exige `requesterId`; chamado de outro usuário responde "não encontrado".
- Se o serviço estiver fora, as tools devolvem `tickets_unavailable` e o agent avisa o funcionário, em vez de inventar uma resposta.
- Os testes unitários usam `FakeTicketGateway`, sem rede.

## Alternativas consideradas

- **Tabelas de chamados no banco do app**: mais simples, mas apaga a fronteira que o desafio pede e esconde os problemas de falha parcial.
- **Fila assíncrona** (outbox e worker): mais robusta, porém muito além do escopo; o retry com idempotência cobre o caso do "Confirmar" no meio de uma falha.

## Consequências

- O fluxo "o serviço cai no meio do Confirmar" é testável: com o retry, o chamado nasce uma única vez.
- O adaptador HTTP e o serviço têm testes próprios, e o resto do app depende só da porta.
- O custo operacional é subir dois processos em desenvolvimento (ver o README).
- O retry tem limite: se o serviço ficar fora por mais tempo que isso, o rascunho fica como falho e o funcionário pode tentar de novo.
