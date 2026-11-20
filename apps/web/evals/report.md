# Relatório do eval das decisões

- Modelo: `groq/openai/gpt-oss-120b,groq/qwen/qwen3.8-27b,groq/openai/gpt-oss-20b`
- Gerado em: 2026-11-19T23:13:30.052Z
- Aprovação: 9/12 (75%), mínimo exigido 90%
- Tokens por cenário (média): 9773

| Cenário | Resultado | Tokens | Tempo (ms) |
|---|---|---|---|
| 01 VPN no Windows 11 abre rascunho de incidente alta | aprovado | 28421 | 128256 |
| 02 VPN no Windows 10 resolve pelo artigo, sem rascunho | aprovado | 6072 | 44589 |
| 03 horário do service desk responde pela central de ajuda | aprovado | 6137 | 48192 |
| 04 status do chamado oferece a escolha do chamado | aprovado | 6499 | 48338 |
| 05 chamado do notebook lento está vencido e oferece analista | reprovado | 5196 | 65212 |
| 06 notebook continua lento atualiza o chamado existente | aprovado | 10371 | 82121 |
| 07 senha do SAP bloqueada de novo reabre o INC-20150 | reprovado | 7496 | 72477 |
| 08 Outlook fora da janela de reabertura abre um chamado novo | reprovado | 16037 | 121939 |
| 09 pedido de analista transfere a conversa | aprovado | 5869 | 61790 |
| 10 férias é fora do escopo de TI | aprovado | 3952 | 61575 |
| 11 chamado de outra pessoa não vaza o título | aprovado | 5857 | 61941 |
| 12 rede do andar fora do ar vira rascunho crítico | aprovado | 15365 | 131476 |

## Falhas

- 05 chamado do notebook lento está vencido e oferece analista
  - tool esperada e não chamada: get_ticket
  - nenhuma chamada de get_ticket com {"code":"INC-20311"}
- 07 senha do SAP bloqueada de novo reabre o INC-20150
  - tool esperada e não chamada: prepare_ticket_draft
  - esperava um rascunho, mas nenhum foi montado
- 08 Outlook fora da janela de reabertura abre um chamado novo
  - rascunho: category esperado "E-mail", observado "Software"

Resultado: taxa de aprovação abaixo do mínimo.
