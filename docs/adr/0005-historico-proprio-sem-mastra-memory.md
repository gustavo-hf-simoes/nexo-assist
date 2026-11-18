# ADR 0005: Histórico próprio no Postgres, sem Mastra Memory

- Status: aceita
- Data: 2026-11-18

## Contexto

A conversa muda de dono: ela começa com o agent, pode ir para um analista humano e voltar ao agent. As mensagens do analista precisam entrar no contexto quando a conversa volta. A conversa e o estado dela (com o agent, aguardando analista, com analista) precisam sobreviver a um reinício e aparecer no console do analista.

## Decisão

A fonte da verdade é a tabela `messages` do banco do app (Postgres próprio, volume nomeado). A cada turno o agent recebe as **últimas 20 mensagens** lidas dessa tabela (`conversations.history`), e o cliente nunca envia histórico. Não usamos o Mastra Memory. O estado da conversa é uma máquina de estados explícita (`conversation-state.ts`), e o trace de cada turno vai para `decision_traces`.

## Alternativas consideradas

- **Mastra Memory (thread e resource)**: resolve o histórico do agent, mas cria uma segunda cópia das mensagens, separada do que o console do analista lê, e as mensagens do analista teriam de ser injetadas nela.
- **Histórico vindo do cliente**: simples, mas inseguro (o cliente poderia forjar mensagens) e mais caro (mais tokens por requisição).

## Consequências

- Existe uma única cópia do histórico: o chat, o console e o agent leem o mesmo dado.
- Quando a conversa volta ao agent, as mensagens do analista já fazem parte do contexto.
- Perdemos recursos prontos da memória do Mastra (recall semântico, working memory). Não precisamos deles com janelas de 20 mensagens.
- A janela de 20 mensagens é fixa: conversas muito longas perdem o começo. O limite de 30 mensagens por sessão torna isso raro.
