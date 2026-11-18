# ADR 0003: Confirmação do chamado só pela UI

- Status: aceita
- Data: 2026-11-18

## Contexto

O Anexo A exige que o funcionário confirme antes de qualquer chamado ser criado, atualizado ou reaberto. Se a confirmação fosse uma tool, a LLM poderia chamá-la sozinha, por engano ou por prompt injection, e "alucinar" um consentimento que o funcionário nunca deu.

## Decisão

O agent só **monta rascunhos** (`prepare_ticket_draft`). O chamado é criado, atualizado ou reaberto por `POST /api/drafts/:id/confirm`, disparado pelo botão **Confirmar** da UI. Não existe tool de confirmação. A criação é idempotente: o gateway envia `Idempotency-Key = draft.id`, e confirmar duas vezes gera no máximo um chamado (as tentativas seguintes recebem 409). A instrução do agent proíbe dizer que um chamado foi criado antes da confirmação.

## Alternativas consideradas

- **Tool `confirm_ticket` com uma pergunta no chat**: depende de a LLM interpretar um "sim" corretamente e de não chamar a tool antes da hora.
- **Confirmação por mensagem de texto interpretada no servidor**: ainda passa pela LLM ou por um parsing frágil de linguagem natural.

## Consequências

- O consentimento é um clique auditável, fora do alcance da LLM.
- O retry do gateway é seguro quando o serviço de chamados falha no meio do "Confirmar", porque a chave de idempotência é o id do rascunho.
- A UI precisa renderizar o rascunho e cuidar dos estados (pendente, confirmando, confirmado, cancelado, substituído, falho).
- Um rascunho substituído ou cancelado não pode mais ser confirmado.
