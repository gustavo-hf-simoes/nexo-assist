# ADR 0007: Cadeia de modelos gratuitos (Groq + Gemini) em produção

- Status: aceita
- Data: 2026-11-19
- Substitui em parte: ADR 0004 (escolha do modelo; os limites de custo continuam valendo)

## Contexto

O deploy público precisa funcionar com custo zero, sem cartão e sem créditos de API. No free tier da API do Gemini, com a chave do projeto:

- o `gemini-3.8-flash` travava ou devolvia 429 (o turno estourava o prazo de 45 s);
- o `gemini-3.5-flash-lite` respondia, mas a cota diária acabou no meio de um único eval.

O plano gratuito da Groq não pede cartão e oferece três modelos com tool calling: `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` e `openai/gpt-oss-20b`. Cada um tem limites próprios: 30 req/min, 8 mil tokens/min e 200 mil tokens/dia. Um turno do agent consome de 5 mil a 15 mil tokens, então um modelo sozinho atende só umas 20 conversas por dia.

## Decisão

- `NEXO_AGENT_MODEL` aceita uma lista separada por vírgula. Com mais de um modelo, ela vira a cadeia de fallback do Mastra, com `maxRetries: 0` em cada modelo: um 429 de cota passa logo para o próximo, e o turno continua dentro do prazo de 45 s.
- O padrão no código é a cadeia gratuita da Groq: `groq/openai/gpt-oss-120b,groq/qwen/qwen3.8-27b,groq/openai/gpt-oss-20b`. Rodar localmente exige só a `GROQ_API_KEY`.
- A produção acrescenta `google/gemini-3.5-flash-lite` no fim. Assim o Gemini continua no caminho de execução e soma mais uma cota gratuita.
- A configuração (`env.ts`) valida cada modelo da lista: provedor suportado (`google`, `groq` ou `test`) e a chave de cada provedor usado. Um modelo `test/` em qualquer posição é recusado em produção.
- As instruções do agent ficaram explícitas para os fluxos do Anexo A. O eval contra o modelo real mostrou que modelos menores seguem regras explícitas e falham com regras implícitas.

## Alternativas consideradas

- **Ativar o billing do Gemini:** resolve a cota, mas tem custo. Descartado pelo requisito de custo zero.
- **Ollama na máquina do desenvolvedor:** custo zero, mas depende de um túnel público e da máquina ligada. Não serve para um avaliador testar a qualquer hora.
- **Modelos `:free` do OpenRouter:** sem créditos, o limite é de cerca de 50 requisições por dia, menos do que a Groq oferece.

## Consequências

- **Desvio do requisito:** o requisito pede o Gemini, e em produção a maior parte dos turnos é atendida por modelos abertos servidos pela Groq. O Gemini segue suportado: é um elo da cadeia e vira o modelo principal trocando só a variável, sem mudar código.
- A capacidade diária é a soma das cotas: cerca de 600 mil tokens/dia na Groq, mais a cota do Gemini. O `DAILY_LLM_TURN_LIMIT` fica abaixo disso, para o app avisar "limite diário" em vez de falhar.
- Modelos diferentes podem atender turnos da mesma conversa. O estado vive no banco e as regras de negócio vivem nas tools e no domínio (ADR 0002), então isso não muda o que é permitido. Pode mudar o tom das respostas.
- O trace de decisão grava o id configurado (a cadeia), não o modelo que de fato respondeu.
