# Casos conferíveis à mão

Lista curta dos casos que uma pessoa consegue verificar sem rodar nada — o
resultado esperado foi calculado antes de existir implementação —, com o arquivo
e o nome do teste que os prende.

Rodar tudo:

```bash
pnpm test:unit
```

## Casos obrigatórios do `AGENTS.md`

| Caso | O que prova | Onde |
|---|---|---|
| **Homônimo rejeitado** | "Jose Santos" traz `MARIA JOSE ALVES PEREIRA SOARES SANTOS`. Completude 2/6 = 0,33 está abaixo do portão de 0,60, então o registro é recusado antes de qualquer desempate | `packages/domain/src/identity/resolver.test.ts` — *confirms the only mask-compatible record whose name holds up*, *carries low confidence rather than a fact when nothing is confirmed* |
| **Máscara compatível com nome divergente** | 10⁵ CPFs compartilham um fragmento, então máscara igual e nome que não sustenta é recusa, não match | `resolver.test.ts` — *reports NAO_ENCONTRADO shape when no record fits the mask at all*; e ponta a ponta contra a planilha produzida pelo Excel em `packages/adapters/src/pgfn/list-resolution.test.ts` |
| **Duas pessoas empatadas** | Duas fichas com a mesma máscara e o mesmo nome dão `AMBIGUO` com `selected: null`. Escolher a melhor aposta erraria metade das vezes | `resolver.test.ts` — *abstains when two records fit equally well, choosing neither*, *abstains on a near tie, not only on an exact one* |
| **Fontes com erro → `DADOS_INSUFICIENTES`** | Falha de fonte não vira mau pagador, e cobertura insuficiente é categoria e nunca nota mais baixa | `packages/domain/src/dossier.test.ts` — *returns DADOS_INSUFICIENTES rather than a lower number*, *returns DADOS_INSUFICIENTES when every source errored* |
| **Sinal de baixa confiança não pesa como fato** | `PROVAVEL` e `AMBIGUO` atravessam a composição como evidência, e o valor não é atribuído | `dossier.test.ts` — *carries a PROVAVEL link through without making it a fact*, *ignores a forged isFact on a link that is not CONFIRMADO* |
| **Contrato de schema** | O contrato publicado sai do Zod, e quebra de compatibilidade exige mudança de major | `packages/contracts/src/schema-compatibility.test.ts` — *rejects a breaking fixture unless schema_version major changes* |
| **Golden test da representação para prompt** | O mesmo snapshot rende o mesmo texto para sempre; mudança de palavra fica visível no diff | `packages/contracts/src/prompt.test.ts` — *matches the golden rendering*, contra `fixtures/prompt/golden-confirmado.md` e `golden-insuficiente.md` |

## Pontuações calculadas à mão

Pesos da política `2026-07-B`: `divida_ativa_confirmada` 0,40;
`presenca_na_lista_de_devedores` 0,25; `valor_elevado_em_aberto` 0,20;
`tres_ou_mais_titulos_em_aberto` 0,15; `pgfn_regularidade_indiciada_por_delta`
−0,30; `vinculo_societario_qsa_contextual` 0,00. Faixas: `COBRANCA_INTENSIVA`
≥ 0,70, `COBRANCA_PADRAO` ≥ 0,30, abaixo `MONITORAMENTO`.

| Caso | Conta | Resultado | Onde |
|---|---|---|---|
| Casa cheia | 0,40 + 0,25 + 0,20 + 0,15 | **1,00**, `COBRANCA_INTENSIVA` | `packages/domain/src/policy/evaluate.test.ts` — *scores a full house at 1.00 and escalates* |
| Só carteira | 0,20 + 0,15 | **0,35**, `COBRANCA_PADRAO` | *scores wallet facts alone at 0.35* |
| Um sinal | 0,15 | **0,15**, `MONITORAMENTO` | *scores a single signal at 0.15 and only monitors* |
| Com delta de regularidade | 0,40 + 0,20 + 0,15 − 0,30 | **0,45**, `COBRANCA_PADRAO` e estratégia `RENEGOCIACAO_COLABORATIVA`; sem o delta seriam 0,75 e escalada | *applies when open data found the debt and the full list did not*, *recommends renegotiation and never escalation* |
| Cobertura insuficiente | qualquer pontuação | **`DADOS_INSUFICIENTES`** | *returns DADOS_INSUFICIENTES rather than a lower number* |

## Pesos da resolução de identidade

`todos_os_tokens_presentes` 0,25; `primeiro_token_coincide` 0,25;
`ultimo_token_coincide` 0,20; `ordem_preservada` 0,05; `completude` 0,25 ×
proporção. Portão: completude < 0,60 recusa. Faixas: `CONFIRMADO` ≥ 0,95,
`PROVAVEL` ≥ 0,75, `POSSIVEL` ≥ 0,55.

Exemplo conferível: carteira `JOSE SILVA` contra publicado `JOSE ALVES SILVA` —
0,25 + 0,25 + 0,20 + 0,05 + 0,25 × 2/3 = **0,9167**, ou seja `PROVAVEL`, acima de
0,75 e abaixo de 0,95, e portanto **não é fato**. A tabela completa está no topo
de `packages/domain/src/identity/resolver.test.ts`.

## Casos que valem por serem negativos

| Caso | O que prova | Onde |
|---|---|---|
| Ausência resolvida | Lista devolve linhas e o resolvedor recusa todas: isso é **ausência**, não presença, e é o que faz o delta de regularidade disparar | `evaluate.test.ts` — *applies when the list returned records and the resolver refused every one*; `dossier.test.ts` — bloco *absenceEstablished* |
| Export filtrado | Preâmbulo com natureza da dívida ou faixa de valor torna o export recorte, e "não encontrado sob filtro" nunca vira "sem dívida" | `packages/adapters/src/pgfn/list-importer.test.ts` — bloco *derivePgfnListQueryScope* |
| Bloco sem procedência | Bloco que chega sem preâmbulo é marcado, nunca fundido com os filtros do bloco de cima | `list-importer.test.ts` — *never lets a block inherit the provenance of the block above it* |
| Dois valores publicados | `Valor Total` e `Valor da Dívida Selecionada` divergem em 31 de 91 registros reais e continuam dois campos, sem fallback silencioso | `list-importer.test.ts` — *keeps the two published amounts as two fields* |
| CPF fora de toda visão | Nenhum papel recebe CPF inteiro, pontuado ou fragmento 4–9; a projeção recusa renderizar se um documento aparecer em campo livre | `packages/contracts/src/role-view.test.ts` — bloco *no role ever receives the document* |
| Sem CPF no prompt | O texto que vai ao agente não carrega CPF em forma nenhuma | `prompt.test.ts` |
| Papéis separados | Auditoria sem acesso operacional, operador sem trilha nem evidência de match | `packages/domain/src/authorization.test.ts` e `role-view.test.ts` |

## Importação de carteira pela tela

| Caso | O que prova | Onde |
|---|---|---|
| A conferência não grava | O arquivo é conferido inteiro e o store não recebe nada — nem título, nem registro de importação | `apps/web/src/http/import-routes.test.ts` — *lists the accepted titles without saving one* |
| Quarentena por linha e motivo | A linha com dígito verificador que não fecha aparece por número e por `CPF_INVALIDO`, e o resto do arquivo entra | idem — *shows the quarantined line by number and by reason* |
| Nenhum CPF na tela | Nem inteiro, nem pontuado, nem o fragmento 4–9, em nenhuma das duas tabelas | idem — *never shows a CPF, accepted or quarantined* |
| Importa o que foi conferido | O commit grava exatamente as linhas que a conferência mostrou aceitas | idem — *imports exactly the rows the operator saw accepted* |
| Preparo não se replica | O token da conferência é gasto no primeiro commit; o segundo é recusado | idem — *refuses to replay a token already committed* |
| Preparo não atravessa tenant | Um token conferido por um tenant não é devolvido a outro, nem a outra carteira do mesmo tenant | `apps/web/src/http/import-staging.test.ts` |
| Upload truncado é recusado | Sem o delimitador de fecho, o corpo não vira carteira pela metade | `apps/web/src/http/multipart.test.ts` — *refuses a truncated upload* |
| Formato vem dos bytes | Um XLSX é reconhecido pela assinatura zip, não pela extensão nem pelo `content-type` do navegador | `packages/adapters/src/wallet-importers/wallet-file.test.ts` |
| Upload real por socket | `FormData` de verdade sobre `node:http`, não fixture de upload | `apps/web/src/http/server.test.ts` — bloco *the import screen answers over a socket* |

## Guardas de runtime e o invariante que as substitui

| Caso | O que prova | Onde |
|---|---|---|
| Cinco guardas alcançáveis | Cada guarda removida derruba **exatamente um** teste nomeado (ver [`limitacoes-v1.md`](limitacoes-v1.md)) | `authorize-actor.test.ts`, `tenant-repository.test.ts`, `authorization.test.ts` |
| Emissor único | `AuthorizedOperation` é construído num lugar só, e contexto e identidade saem da mesma referência — o que tornava duas guardas inalcançáveis (ADR 026) | `packages/application/src/authorize-actor.test.ts` — bloco *the single issuer of AuthorizedOperation* |

## Dinheiro

| Caso | Esperado | Onde |
|---|---|---|
| Formatação brasileira | `2917588644` centavos → `R$ 29.175.886,44` | `packages/contracts/src/format.test.ts` |
| Precisão excedente publicada | `29163886,440000001` arredonda para centavos, preserva o texto original e declara o arredondamento (ADR 023) | `packages/domain/src/source-money.test.ts` |
| Precisão excedente na carteira | Casas extras não-zero mandam a linha para quarentena com relatório, e nunca truncam | `packages/domain/src/wallet.test.ts` |
| Nada de float | Os módulos monetários não contêm `Number(`, `parseFloat` nem `parseInt` | `source-money.test.ts` e `format.test.ts` |

## Integração com PostgreSQL

Exigem o Compose de pé (passos 3 e 4 do [`README`](../README.md)):

```bash
pnpm test:integration
```

| Caso | O que prova | Onde |
|---|---|---|
| Isolamento entre tenants | Dois tenants importam o mesmo arquivo, existem seis títulos e a leitura devolve três: é filtro, não banco vazio | `packages/adapters/src/repositories/prisma-wallet-repository.integration.test.ts` |
| RLS como segunda barreira | `SELECT` direto de tenant A sobre linha de tenant B é negado pelo banco, com a autorização de aplicação já tendo negado antes | `postgres-rls.integration.test.ts` |
| Auditoria append-only | `dossie_app` tem `INSERT, SELECT` em `WalletImport` e nada mais; o teste lê `information_schema` e falha se `UPDATE` ou `DELETE` reaparecerem | `prisma-wallet-repository.integration.test.ts` |
| CPF cifrado em repouso | `"Debtor"::text LIKE '%CPF%'` devolve zero linhas | idem |
