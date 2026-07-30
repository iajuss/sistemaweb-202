# LGPD e retenção

> **Status:** este documento registra decisões e premissas técnicas. Não é
> parecer jurídico e permanece pendente de validação por jurídico/DPO do cliente.

## Finalidade e limites

O tratamento é limitado à carteira de devedores fornecida pelo cliente, para
organizar a cobrança e explicar a recomendação produzida. Não há consulta aberta
por CPF, dado sensível é descartado antes da persistência e fontes não públicas
ou sem contrato verificável não são usadas.

CPF completo fica cifrado em repouso para a finalidade operacional de verificar
fontes mascaradas; hash serve apenas a índice/deduplicação. CPF em claro não é
registrado em URL, log, mensagem de erro ou telemetria. Todo acesso registra o
ator efetivo, humano ou agente, carteira, fontes e resultado.

As bases legais, contratos e avaliação de legítimo interesse exigem validação do
cliente antes de produção. A política técnica não declara que uma hipótese legal
está comprovada.

## Fonte PGFN: base documental

Para Dados Abertos PGFN, a própria fonte declara que “os débitos inscritos em
dívida ativa não estão cobertos por sigilo” (CTN, art. 198, § 3º, II), e informa
publicação trimestral sob a LAI e o Decreto nº 8.777/2016; também declara que CPF
de pessoa física é parcialmente mascarado em atenção à LGPD. A finalidade técnica
é consultar apenas pessoas já ancoradas em carteira autorizada, registrar
procedência e jamais reidentificar a partir da máscara.

Fonte: https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos

## Premissa técnica, não validada juridicamente

| Classe | Padrão | Âncora |
|---|---|---|
| Carteira (devedor + títulos) | Enquanto a dívida for exigível; teto de 5 anos do vencimento, ou fim do contrato com o cliente. | Prescrição da pretensão de cobrança de dívida líquida: Código Civil, art. 206, § 5º, I. |
| Observações (resposta bruta de fonte) | 12 meses. | Dado rederivável; envelhecido, vira risco de decidir sobre fato desatualizado. |
| Dossiês e classificações | 24 meses completos; depois, redação preservando o registro da decisão. | Sustenta o direito de revisão: LGPD, art. 20, sem manter carga pessoal indefinidamente. |
| Logs de auditoria | 24 meses, piso de 6 meses. | Guarda de registros de acesso a aplicação: Marco Civil, art. 15. |
| Linhas em quarentena | 30 dias. | Dado que o sistema não deveria ter aceitado; existe só para o cliente corrigir o import. |

### Pendente de validação jurídica

Estas são exatamente as cinco linhas que o cliente deve validar com seu
jurídico/DPO antes da produção:

1. Carteira (devedor + títulos): enquanto a dívida for exigível, com teto de 5
   anos do vencimento ou fim do contrato.
2. Observações (resposta bruta de fonte): 12 meses.
3. Dossiês e classificações: 24 meses completos, seguidos de redação com
   preservação do registro da decisão.
4. Logs de auditoria: 24 meses, respeitado piso de 6 meses.
5. Linhas em quarentena: 30 dias.

## Mecanismo técnico de expurgo

A política é configurável por tenant e versionada. O job de expurgo produz evento
de auditoria sem carga pessoal, aplica crypto-shredding por titular e mantém o
esqueleto pseudonimizado de decisão — data, versão de regras, fontes e sinais.
Testes devem provar a remoção da carga vencida e a preservação desse esqueleto.
Séries somente agregadas e irreversivelmente anonimizadas podem ser retidas para
métrica sem prazo.
