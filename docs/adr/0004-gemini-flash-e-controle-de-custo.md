# ADR 0004: Gemini Flash e controle de custo

- Status: aceita; a escolha do modelo foi substituída pela ADR 0007 (cadeia de modelos gratuitos)
- Data: 2026-11-18

## Contexto

O agent faz vários passos de tool-calling por turno e atende conversas curtas de suporte. Precisamos de baixo custo e baixa latência, tool calling confiável e saída estruturada sólida. O projeto exige o Google Gemini. O deploy exposto à internet precisa de proteção contra abuso, e o custo por conversa precisa ser previsível.

## Decisão

- **Modelo:** Gemini Flash, escolhido pelo model router do Mastra e configurado por `NEXO_AGENT_MODEL` (o padrão no código é `google/gemini-3.8-flash`). Trocar de modelo ou de provedor é uma mudança de variável de ambiente, sem mudar código.
- **Limites de custo:** `maxSteps: 6` por turno, as últimas 20 mensagens como contexto, 30 mensagens por sessão (`SESSION_MESSAGE_LIMIT`), `DAILY_LLM_TURN_LIMIT` global por dia e nenhum histórico vindo do cliente (a fonte da verdade é o banco do servidor).
- **Segurança de execução:** se a confiança do turno ficar abaixo de `AGENT_MIN_CONFIDENCE` (0.6), o código transfere para o analista. Com a conversa fora do estado `agent`, a LLM nem é chamada.
- **Transparência:** `record_decision` é a última tool de todo turno (`intent`, `understanding`, `action`, `confidence`, `rationale`) e o trace é persistido.
- **Teste sem LLM:** `NEXO_AGENT_MODEL=test/scripted` usa um modelo roteirizado, só para testes e E2E.

## Alternativas consideradas

- **Um modelo maior (Pro)**: melhor raciocínio, mas o custo e a latência por turno sobem sem necessidade nestes cenários curtos.
- **Outro provedor**: viável por causa do model router, mas o requisito pede o Gemini.
- **Sem limites de custo**: simples, mas inaceitável em um deploy público.

## Consequências

- O custo por conversa é limitado: no pior caso, 30 mensagens por sessão, 6 passos por turno e 20 mensagens de contexto. O README traz uma **estimativa** do custo, não um valor medido. A medição real sai do `npm run eval`, que imprime os tokens por cenário.
- O modelo `test/scripted` é liberado por configuração só fora de produção: com `NODE_ENV=production`, a configuração o recusa e o app não sobe.
- O limite de 30 mensagens conta por sessão de login, então um novo login zera a contagem. Também é um trade-off conhecido.
- O id exato do modelo vigente deve ser confirmado ao fazer o deploy.
