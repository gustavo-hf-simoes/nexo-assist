# ADR 0001: Um agent único com tools, sem RAG vetorial e sem multi-agent

- Status: aceita
- Data: 2026-11-18

## Contexto

O Nexo Assist precisa entender a mensagem do funcionário, consultar chamados, buscar na central de ajuda, montar rascunhos e transferir para um analista. A central de ajuda tem de 5 a 10 artigos curtos (o seed traz 8). O critério mais importante do PRD é a transparência: o time precisa ver o que o agent entendeu e fez em cada turno.

## Decisão

Usamos **um agent Mastra com tool-calling** (`createNexoAgent`), com oito tools de responsabilidade única: `search_my_tickets`, `get_ticket`, `search_help_center`, `classify_priority`, `prepare_ticket_draft`, `present_choices`, `handoff_to_analyst` e `record_decision`. O limite é `maxSteps: 6` por turno. A busca na central usa o full-text `portuguese` do Postgres, sem embeddings.

## Alternativas consideradas

- **RAG vetorial** (embedder e banco de vetores): com 8 artigos curtos o ganho de recall é nenhum, e o custo é um modelo a mais, latência a mais e um índice para manter.
- **Multi-agent** (um agent de triagem, um de chamados, um de ajuda): multiplica as chamadas de LLM por turno, espalha o contexto e torna o trace difícil de ler.
- **Fluxo fixo sem a LLM escolher as tools** (máquina de estados por intenção): rígido demais para linguagem natural e ruim para perguntas fora do roteiro.

## Consequências

- O trace de cada turno é uma sequência única de tool calls, fácil de mostrar na UI como chips e no console do analista.
- O custo por turno é limitado pelo `maxSteps` e por um único prompt de sistema.
- Se a central crescer para centenas de artigos, a busca full-text vai perder qualidade. Nesse ponto vale reavaliar um índice vetorial. Hoje isso seria excesso de engenharia.
- Um agent só concentra todas as instruções em `instructions.ts`. Qualquer mudança nelas deve passar pelo eval das decisões (`npm run eval`).
