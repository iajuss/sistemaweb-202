# Dossiê dossier-1

- prompt_version: 1.0.0
- schema_version: 2.0.0
- plano de fontes: 2026-07-A
- versão do resolvedor: 2026-07-A
- composto em: 2026-07-31T12:00:00.000Z

A data acima é a da composição. Cada campo declara separadamente quando
foi coletado.

## Cobertura

Veredito: **SUFICIENTE**
Slices conclusivas: 5 de 5

- CARTEIRA_CLIENTE: ENCONTRADO [obrigatória]
- PGFN_DADOS_ABERTOS: ENCONTRADO [obrigatória]
- PGFN_LISTA_DEVEDORES_MANUAL: ENCONTRADO [opcional]

Cobertura suficiente para classificar.

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
- **pgfn_dados_abertos_inscricoes** = INS-subject-1
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_dados_abertos_presente** = sim
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_dados_abertos_valor_consolidado** = R$ 1000.00
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_DADOS_ABERTOS (slices: SIDA|SP, PREVIDENCIARIO|SP, FGTS|SP)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_presente** = sim
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_valor_selecionado** = R$ 1000.00
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z
- **pgfn_lista_valor_total** = R$ 1000.00
  - estado da fonte: ENCONTRADO
  - fonte: PGFN_LISTA_DEVEDORES_MANUAL (slices: LISTA_MANUAL)
  - vínculo CONFIRMADO, confiança 1
  - coletado em: 2026-07-20T00:00:00.000Z

Campo com vínculo não confirmado tem o valor retido de propósito: alguém
publicou aquele dado, mas ninguém estabeleceu que é desta pessoa.

## Classificação

- categoria: **COBRANCA_INTENSIVA**
- estratégia primária: **CONTATO_DIRETO_PRIORITARIO**
- prioridade operacional: 0
- política: 2026-07-A
- pontuação: 1
- confiança global: 1

A pontuação ordena esforço de cobrança entre devedores. Ela não estima se
alguém vai pagar, e não deve ser apresentada nem usada como se estimasse.

### Sinais

- divida_ativa_confirmada: aplicado, peso 0.4, contribuição 0.4, sentido AGRAVANTE, fonte pgfn_dados_abertos_presente
- presenca_na_lista_de_devedores: aplicado, peso 0.25, contribuição 0.25, sentido AGRAVANTE, fonte pgfn_lista_presente
- valor_elevado_em_aberto: aplicado, peso 0.2, contribuição 0.2, sentido AGRAVANTE, fonte carteira_valor_em_aberto
- multiplos_titulos_em_aberto: aplicado, peso 0.15, contribuição 0.15, sentido AGRAVANTE, fonte carteira_titulos
- pgfn_regularidade_indiciada_por_delta: não aplicado, peso -0.3, contribuição 0, sentido MITIGADOR, fonte pgfn_dados_abertos_presente+pgfn_lista_presente
- vinculo_societario_qsa_contextual: não aplicado, peso 0, contribuição 0, sentido CONTEXTUAL, fonte qsa_vinculo

### Explicação

Categoria COBRANCA_INTENSIVA com pontuação 1. Sinais aplicados: divida_ativa_confirmada (agravante, peso 0.4, fonte pgfn_dados_abertos_presente); presenca_na_lista_de_devedores (agravante, peso 0.25, fonte pgfn_lista_presente); valor_elevado_em_aberto (agravante, peso 0.2, fonte carteira_valor_em_aberto); multiplos_titulos_em_aberto (agravante, peso 0.15, fonte carteira_titulos). A pontuação ordena esforço de cobrança e não prevê pagamento.
