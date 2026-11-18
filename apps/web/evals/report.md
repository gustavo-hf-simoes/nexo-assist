# Relatório do eval das decisões

**Status: o eval ainda não foi executado com o modelo real.** Este ambiente de desenvolvimento não tinha `GOOGLE_GENERATIVE_AI_API_KEY`, então não há taxa de aprovação nem custo em tokens medidos. Nenhum número aqui é um resultado: este arquivo é um marcador que a primeira execução completa vai substituir.

## Como gerar

Com a chave preenchida no `.env` (copie de `.env.example`):

```bash
npm run eval
```

O comando roda os 12 cenários de `apps/web/evals/scenarios.ts` contra o Gemini (modelo de `NEXO_AGENT_MODEL`), com os chamados do seed e uma busca de artigos em memória, sem depender do banco nem do serviço de chamados. Ele sai com código 1 se a taxa de aprovação ficar abaixo de `EVAL_MIN_PASS_RATE` (padrão 0.9) e com código 2 se a chave ou a configuração estiverem erradas. Para rodar um cenário só: `npm run eval -- --only "VPN no Windows 11"`.

## O que o relatório vai conter

- O modelo usado e a data da execução.
- A taxa de aprovação (aprovados sobre o total) e o mínimo exigido.
- Uma linha por cenário, com resultado, tokens gastos e tempo em milissegundos.
- A média de tokens por cenário, base do custo real por conversa.
- Para cada cenário reprovado, os motivos (tool esperada que faltou, tool proibida chamada, rascunho com campo errado, resposta com trecho indevido).

Uma execução completa com o modelo real grava este arquivo de novo. Rodar com `--only` ou com `NEXO_AGENT_MODEL=test/scripted` não grava.

## Por que não roda no CI

O eval chama a API paga do Gemini, precisa de segredo e a resposta de um LLM varia entre execuções. Por isso ele é uma checagem manual, feita antes de mudar `instructions.ts`, as tools ou o modelo. A esteira roda os testes determinísticos, que cobrem as regras (prioridade, prazo, privacidade, idempotência) sem LLM.
