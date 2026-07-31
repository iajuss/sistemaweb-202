# Dossiê dossier-1

- prompt_version: 1.0.0
- schema_version: 2.0.0
- plano de fontes: 2026-07-A
- versão do resolvedor: nenhuma (nada resolvido)
- composto em: 2026-07-31T12:00:00.000Z

A data acima é a da composição. Cada campo declara separadamente quando
foi coletado.

## Cobertura

Veredito: **DADOS_INSUFICIENTES**
Slices conclusivas: 2 de 5

- CARTEIRA_CLIENTE: ENCONTRADO [obrigatória]
- PGFN_DADOS_ABERTOS: ERRO_NA_FONTE (não conclusiva) [obrigatória]
- PGFN_LISTA_DEVEDORES_MANUAL: NAO_ENCONTRADO [opcional]

**Cobertura insuficiente.** Falha ou ausência de consulta numa fonte não é indício de mau pagador, e não deve ser lida como nota baixa. Nenhuma recomendação acionável é emitida neste estado.

## Campos

- **carteira_titulos** = TIT-1, TIT-2, TIT-3
  - estado da fonte: ENCONTRADO
  - fonte: CARTEIRA_CLIENTE (slices: CARTEIRA)
  - vínculo NAO_APLICAVEL, confiança 1
  - coletado em: 2026-07-25T00:00:00.000Z
- **carteira_valor_em_aberto** = R$ 80000.00
  - estado da fonte: ENCONTRADO
  - fonte: CARTEIRA_CLIENTE (slices: CARTEIRA)
  - vínculo NAO_APLICAVEL, confiança 1
  - coletado em: 2026-07-25T00:00:00.000Z
- **pgfn_dados_abertos_inscricoes** = (valor retido: vínculo não confirmado)
  - estado da fonte: ERRO_NA_FONTE
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_dados_abertos_presente** = (valor retido: vínculo não confirmado)
  - estado da fonte: ERRO_NA_FONTE
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_dados_abertos_valor_consolidado** = (valor retido: vínculo não confirmado)
  - estado da fonte: ERRO_NA_FONTE
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_presente** = (valor retido: vínculo não confirmado)
  - estado da fonte: NAO_ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_valor_selecionado** = (valor retido: vínculo não confirmado)
  - estado da fonte: NAO_ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_valor_total** = (valor retido: vínculo não confirmado)
  - estado da fonte: NAO_ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo NAO_RESOLVIDO, não confirmado, confiança 0
  - coletado em: 2026-07-20T00:00:00.000Z

Campo com vínculo não confirmado tem o valor retido de propósito: alguém
publicou aquele dado, mas ninguém estabeleceu que é desta pessoa.

## Classificação

- categoria: **DADOS_INSUFICIENTES**
- estratégia primária: **COLETAR_MAIS_DADOS**
- prioridade operacional: 3
- política: 2026-07-A
- pontuação: 0.35
- confiança global: 0.4

A pontuação ordena esforço de cobrança entre devedores. Ela não estima se
alguém vai pagar, e não deve ser apresentada nem usada como se estimasse.

### Sinais

- divida_ativa_confirmada: não aplicado, peso 0.4, contribuição 0, sentido AGRAVANTE, fonte pgfn_dados_abertos_presente
- presenca_na_lista_de_devedores: não aplicado, peso 0.25, contribuição 0, sentido AGRAVANTE, fonte pgfn_lista_presente
- valor_elevado_em_aberto: aplicado, peso 0.2, contribuição 0.2, sentido AGRAVANTE, fonte carteira_valor_em_aberto
- multiplos_titulos_em_aberto: aplicado, peso 0.15, contribuição 0.15, sentido AGRAVANTE, fonte carteira_titulos
- pgfn_regularidade_indiciada_por_delta: não aplicado, peso -0.3, contribuição 0, sentido MITIGADOR, fonte pgfn_dados_abertos_presente+pgfn_lista_presente
- vinculo_societario_qsa_contextual: não aplicado, peso 0, contribuição 0, sentido CONTEXTUAL, fonte qsa_vinculo

### Explicação

Cobertura insuficiente: PGFN_DADOS_ABERTOS não concluiu. Nenhuma classificação acionável é emitida sob cobertura incompleta; falha de fonte não é indício de mau pagador. Slices conclusivas: 2 de 5.
