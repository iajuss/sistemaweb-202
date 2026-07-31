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

## Base legal por fonte e finalidade

Uma linha por par fonte × finalidade. A matriz de fontes correspondente está em
[`fontes.md`](fontes.md).

| Fonte | Finalidade | Hipótese legal pretendida | Âncora | Situação |
|---|---|---|---|---|
| Carteira do cliente (devedor + títulos) | Delimitar quem pode ser consultado e organizar a cobrança | Execução de contrato entre cliente e devedor; tratamos na condição de **operador** | LGPD art. 7º, V | A validar pelo cliente |
| CPF completo da carteira | Verificar a máscara publicada pela fonte contra a pessoa que o cliente já tem | Mesma do item acima, com minimização: cifrado em repouso, fragmento 4–9 só em memória | LGPD art. 6º, III; ADR 002 e ADR 003 | A validar |
| PGFN Dados Abertos | Verificar existência de dívida ativa da pessoa da carteira | Legítimo interesse na cobrança de dívida própria do cliente, sobre dado público por lei | CTN art. 198, § 3º, II; LGPD art. 7º, IX | A validar |
| PGFN Lista de Devedores | Mesma verificação, universo distinto, sob os filtros do export | Idem | CTN art. 198, § 3º, II; LGPD art. 7º, IX | A validar |
| QSA/RFB | Contexto societário, sem peso na classificação (ADR 012) | Legítimo interesse sobre registro empresarial público | LGPD art. 7º, IX | Mapeada, não integrada |
| Portal da Transparência (CEIS/CEAF) | Sanção administrativa publicada | Publicidade obrigatória de sanção | Lei 12.846/2013; LAI; LGPD art. 7º, IX | Mapeada, não integrada |
| Bureaus de crédito | — | Não aplicável nesta v1 | — | Exige contrato e LIA própria |

**Limites que a finalidade impõe, e que o código já obedece:**

- Nenhuma consulta acontece fora de carteira autorizada. Consulta aberta por CPF
  não existe: o único identificador que o chamador segura é o `id_externo` do
  título, e o schema da requisição é estrito.
- Dado sensível fica fora. Se uma fonte devolver incidentalmente, é descartado
  antes de persistir.
- Registro de **não-cliente** não é persistido, indexado, logado nem
  intermediado em arquivo — vale para QSA e para as duas fontes da PGFN.
- A pontuação **ordena esforço de cobrança** e não estima pagamento. Não é score
  de crédito e não pode ser apresentada nem usada como se fosse (ADR 016).

## Direitos do titular

| Direito | Como é atendido hoje | Limite conhecido |
|---|---|---|
| **Confirmação e acesso** (art. 18, I e II) | O dossiê é a resposta: campos com valor, fonte, data de coleta e confiança do vínculo, mais a classificação e sua explicação | O pedido chega pelo cliente controlador; não há canal direto do titular nesta v1 |
| **Correção** (art. 18, III) | Por **supersessão**, nunca por edição: emite-se dossiê novo com registro de revisão apontando para o anterior (ADR 018) | O dado publicado pela fonte não é corrigido por nós; a correção vale para a composição e a classificação |
| **Anonimização, bloqueio ou eliminação** (art. 18, IV) | Crypto-shredding por titular: destruída a chave, o campo lê `ELIMINADO_A_PEDIDO_DO_TITULAR`, e o esqueleto pseudonimizado da decisão permanece (ADR 009) | O cofre de chaves é em memória nesta v1 (pendência F-5); em produção é o KMS do ADR 006 |
| **Portabilidade** (art. 18, V) | O contrato de saída é JSON derivado de Zod, com JSON Schema e OpenAPI publicados | Não há botão de exportação; a entrega é pela API |
| **Informação sobre compartilhamento** (art. 18, VII) | Nenhum dado pessoal é compartilhado com terceiro. As fontes são de leitura, e o CPF nunca vai em URL, log, mensagem de erro ou telemetria | — |
| **Revisão de decisão automatizada** (art. 20) | Toda classificação se decompõe em **sinais nomeados, com peso e fonte**, e gera explicação legível. Cobertura insuficiente devolve `DADOS_INSUFICIENTES` e nunca nota baixa | A revisão humana é do cliente; não há fluxo de contestação embutido nesta v1 |
| **Oposição** (art. 18, § 2º) | Endereçada ao cliente controlador | Sem canal direto nesta v1 |

Toda consulta grava trilha de auditoria — quem, qual carteira, quando, quais
fontes, qual resultado —, e é ela que sustenta os pedidos acima. O papel
`ENCARREGADO_LGPD` lê essa trilha e **não** tem acesso operacional à carteira;
`OPERADOR_COBRANCA` tem o inverso, e nunca vê CPF nem evidência de match
integral.

## Bloqueio de produção

**Produção está proibida** até a validação fail-closed de JWT/JWKS — assinatura,
issuer, audience, expiração e rotação (ADR 021, pendência P-1 em
[`limitacoes-v1.md`](limitacoes-v1.md)).

Não é aviso em prosa: fora de `NODE_ENV=development` a emissão de
`VerifiedPrincipal` falha fechada **a cada chamada**, então um processo iniciado
em produção não autentica ninguém e não serve dossiê nenhum. Enquanto isso valer,
nenhum dado pessoal real deve ser importado — a demonstração recusa qualquer
banco que não esteja em loopback antes mesmo de assumir o modo de
desenvolvimento.

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
