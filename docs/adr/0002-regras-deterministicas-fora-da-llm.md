# ADR 0002: Regras de negócio determinísticas fora da LLM

- Status: aceita
- Data: 2026-11-18

## Contexto

O Anexo A do PRD define prioridade, prazos de SLA, janela de reabertura, detecção de duplicidade e privacidade dos chamados. Essas regras precisam estar certas sempre e ser testáveis. Uma LLM pode errar a conta de um prazo em horário útil ou ser convencida por uma mensagem a "ajustar" a prioridade.

## Decisão

A LLM só **informa fatos** (`impact`, `blocksWork`, `sameDayDeadline`, tipo e categoria) e o **código calcula o resto**: `classifyPriority`, `computeDueAt`, `canReopen` e `isOverdue` vivem em `packages/domain` (TypeScript puro, sem I/O). A tool `prepare_ticket_draft` calcula a prioridade e o prazo do rascunho no servidor. A detecção de duplicidade também é código (mesmo tipo e categoria, ou duas palavras significativas em comum no título).

A privacidade segue o mesmo princípio: o `employeeId` vem **só** do `RequestContext` (a sessão), nunca do input de uma tool, e o serviço de chamados exige `requesterId` em toda leitura. Chamado de outro usuário responde "não encontrado".

## Alternativas consideradas

- **Deixar a LLM calcular prioridade e prazo, guiada pelo prompt**: barato de escrever, impossível de garantir, e um erro de prazo viraria uma promessa errada ao funcionário.
- **Validar a resposta da LLM depois** (a LLM calcula e o código confere): duplica a lógica e ainda deixa a LLM propor valores que o código teria de corrigir.

## Consequências

- As regras têm testes unitários rápidos e sem LLM, e a prioridade é a mesma em qualquer modelo.
- O prompt fica curto: ele descreve a conversa, não as fórmulas.
- Trocar uma regra (um prazo, por exemplo) é uma mudança de código em um lugar só.
- O custo é que o modelo precisa extrair bem os fatos. É isso que o eval das decisões mede (cenário 01, prioridade alta; cenário 12, crítica).
- Limitação conhecida: o cálculo de horário útil ignora feriados (ver o README).
