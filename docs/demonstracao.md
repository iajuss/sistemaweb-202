# Roteiro de demonstração — 10 minutos

Como mostrar o sistema funcionando, do banco vazio até a tela, em cerca de dez
minutos. Pressupõe só o repositório clonado e o Docker instalado.

Os comandos e as saídas abaixo foram conferidos rodando, não escritos de
memória. A sequência completa, com a resposta correta de cada passo, está no
[`README.md`](../README.md) — este documento é o recorte que cabe numa
apresentação, com os pontos que valem ser apontados em voz alta.

## Antes de começar, fora dos dez minutos

Instalar dependências e subir o banco leva minutos e não mostra nada. **Faça
isto antes**, com a plateia ainda não olhando:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm exec prisma generate
```

```bash
pnpm compose:up
```

```bash
pnpm migrate
```

Além do Docker você precisa de **Node.js 22** e **pnpm 11** — o pnpm vem com o
Node por `corepack enable`. Os passos 1 e 2 são obrigatórios num clone novo; o 3
sobe PostgreSQL e Keycloak e espera os dois ficarem saudáveis; o 4 aplica as
duas migrações.

Deixe um navegador aberto e um terminal livre. Se quiser começar de um banco
genuinamente vazio, `docker compose down -v` apaga o volume — e aí os passos 3 e
4 precisam ser repetidos.

---

## 1. Um comando, do banco vazio à API no ar (1 min)

```bash
pnpm demo
```

Um comando faz o fluxo inteiro: importa a planilha Excel da carteira, roda os
dois universos da PGFN sobre as fixtures, grava as observações no PostgreSQL,
compõe um dossiê por devedor, classifica cada um e sobe a API.

O console responde:

```
Carteira carteira-demo do tenant tenant-demo
3 devedores, 0 linhas em quarentena

Prioridades da carteira:
  dossie-1  COBRANCA_PADRAO       pontuação 0.40  DEMO-001  JOSE DA SILVA
  dossie-2  MONITORAMENTO         pontuação 0.25  DEMO-010  JOSE DA SILVA SANTOS
  dossie-3  MONITORAMENTO         pontuação 0.00  DEMO-020  ANA LUCIA FERREIRA
```

O que dizer enquanto roda: **nada aqui é uma segunda implementação**. O seed
chama exatamente os mesmos serviços que a API chama; o que ele acrescenta é a
fiação que um operador faria à mão.

Deixe o processo no ar. Os passos seguintes usam o navegador e um segundo
terminal.

## 2. A fila da carteira (1 min)

Abra no navegador:

```
http://127.0.0.1:3000/carteiras/carteira-demo/prioridades
```

O navegador pede usuário e senha: **`demo` / `demo`**. Qualquer par serve, e
isso é parte da demonstração — veja o passo 6.

Três devedores, ordenados por prioridade operacional e depois por pontuação.
`JOSE DA SILVA` vem primeiro em `COBRANCA_PADRAO`; os outros dois ficam em
`MONITORAMENTO`.

Aponte de passagem: **a marca e as cores são do tenant, lidas do banco.** Não
existe valor padrão — tenant sem tema configurado devolve 500, porque um padrão
embutido seria a marca de quem desenvolveu com outro nome.

## 3. O dossiê, onde está quase tudo (3 min)

Clique no primeiro título, ou vá direto a:

```
http://127.0.0.1:3000/carteiras/carteira-demo/dossies/dossie-1
```

Esta tela sustenta dois dos quatro momentos. Vá com calma aqui.

### ★ Momento 1 — o valor retido porque o vínculo foi recusado

Na tabela **Campos**, desça até as três linhas `pgfn_lista_*`:

| Campo | Valor | Fonte | Vínculo |
|---|---|---|---|
| `pgfn_dados_abertos_valor_consolidado` | R$ 29.175.886,44 | ENCONTRADO | CONFIRMADO |
| `pgfn_lista_valor_total` | **(valor retido: vínculo não confirmado)** | ENCONTRADO | **REJEITADO, não confirmado** |

**Este é o ponto central do produto.** A fonte devolveu linhas — o estado dela é
`ENCONTRADO`, não vazio. O que aconteceu é que a Lista de Devedores publica
gente com a **mesma máscara de CPF** deste devedor, e o resolvedor de identidade
olhou nome por nome e recusou todos. Alguém publicou aquele valor; ninguém
estabeleceu que é desta pessoa.

Por isso o valor **não é impresso**. Imprimi-lo, mesmo com um aviso ao lado,
convida quem lê — pessoa ou agente — a usá-lo assim mesmo. A mesma retenção vale
nas três superfícies: nesta tela, no texto que vai para o agente e no peso do
sinal, que fica em zero.

Repare também que a coluna de vínculo mostra **quais regras casaram**
(`completude_minima`, `primeiro_token_coincide`, …). Isso é a visão do analista.
Um operador de cobrança receberia **quantas** casaram, nunca quais: o trabalho
dele é decidir uma abordagem, não auditar um vínculo. E a audiência da visão
segue a ação autorizada — não há como pedir outro papel pela barra de endereço.

E: **não há CPF nenhum na tela**, inteiro ou mascarado. A página lê o nome dos
próprios títulos da carteira e não decifra documento algum.

### ★ Momento 2 — os sinais nomeados, com peso, atrás da classificação

Suba até o bloco **Classificação**:

| Sinal | Peso | Fonte | Situação |
|---|---|---|---|
| `divida_ativa_confirmada` | 0,40 | `pgfn_dados_abertos_presente` | **aplicado** |
| `presenca_na_lista_de_devedores` | 0,25 | `pgfn_lista_presente` | não aplicado |
| `valor_elevado_em_aberto` | 0,20 | `carteira_valor_em_aberto` | não aplicado |
| `tres_ou_mais_titulos_em_aberto` | 0,15 | `carteira_titulos` | não aplicado |
| `pgfn_regularidade_indiciada_por_delta` | −0,30 | delta das duas fontes | não aplicado |
| `vinculo_societario_qsa_contextual` | 0,00 | `qsa_vinculo` | não aplicado |

Pontuação **0,40**, categoria `COBRANCA_PADRAO`, política `2026-07-B`.

Três coisas para dizer:

1. **A conta é conferível à mão.** Um sinal aplicado, peso 0,40, pontuação 0,40.
   `COBRANCA_PADRAO` porque 0,40 está entre 0,30 e 0,70. Nenhum modelo, nenhum
   número que ninguém sabe explicar.
2. **Isso é exigência legal, não recurso.** O direito de revisão de decisão
   automatizada exige que uma pessoa consiga saber por que a decisão saiu assim.
   Sinal nomeado, com peso e fonte, mais a explicação por extenso, é a forma de
   atender isso.
3. **A pontuação ordena esforço de cobrança e não prevê pagamento.** A frase está
   na tela de propósito. Não é score de crédito, e a diferença não é retórica:
   não há desfecho rotulado para treinar nada.

Repare que `presenca_na_lista_de_devedores` **não** se aplicou, com peso 0,25
disponível — porque o vínculo foi recusado. É o momento 1 chegando até a nota.

## 4. O mesmo dossiê como o agente recebe (2 min)

O consumidor final não é uma tela, é um agente de AI. Num segundo terminal:

```bash
curl -s "http://127.0.0.1:3000/api/v1/dossies/dossie-1/prompt?carteira=carteira-demo" -H "Authorization: Bearer demo"
```

No PowerShell:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/dossies/dossie-1/prompt?carteira=carteira-demo" -Headers @{ Authorization = "Bearer demo" }
```

Sai markdown versionado e determinístico, preso por golden test. Os trechos que
valem apontar:

```markdown
## Cobertura
Veredito: **SUFICIENTE**
Slices conclusivas: 5 de 5

- **pgfn_lista_valor_total** = (valor retido: vínculo não confirmado)
  - estado da fonte: ENCONTRADO
  - vínculo REJEITADO, não confirmado, confiança 0.5
```

**A mesma retenção do momento 1, no texto do agente.** É o mesmo dossiê, a mesma
regra, duas superfícies — e nenhum CPF em nenhuma delas, o que também tem teste.

Se sobrar meio minuto, mostre a recusa:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/carteiras/carteira-demo/dossies/lookup -H "Authorization: Bearer demo" -H "Content-Type: application/json" -d "{\"cpf\":\"52998224725\"}"
```

Responde `REQUISICAO_INVALIDA`. **Não existe consulta por CPF** em corpo, URL ou
query string: o único identificador que o chamador segura é o `id_externo` do
título, e o schema é estrito, então a recusa vem da forma e não de alguém ter
lembrado de checar aquele nome de campo. A resposta é pobre em informação de
propósito — ecoar qual chave foi rejeitada confirmaria que `cpf` é um campo que o
sistema conhece.

## 5. ★ Momento 3 — os quatro estados de fonte, que nunca colapsam (2 min)

Este é o momento que **não** aparece na tela da demonstração, e vale dizer por
quê: no seed as cinco slices são lidas com sucesso, então só dois dos quatro
estados aparecem naturalmente. Os outros dois estão presos em teste, e é lá que
se mostra:

```bash
pnpm exec vitest run packages/adapters/src/observations/projection.test.ts -t "one observation per slice" --reporter=verbose
```

Na saída, três linhas dizem o produto inteiro:

```
✓ calls a slice that was read and matched nobody NAO_ENCONTRADO
✓ calls an unread slice NAO_CONSULTADO, never NAO_ENCONTRADO
✓ calls a failed slice ERRO_NA_FONTE, and a failure is never a debt
```

Mais o quarto estado, `ENCONTRADO`, que a tela já mostrou.

**São quatro estados distintos e nenhum deles colapsa nos outros.** A diferença
importa desta forma:

- **`NAO_ENCONTRADO`** é uma afirmação: procuramos e não está lá.
- **`NAO_CONSULTADO`** é silêncio: ninguém olhou.
- **`ERRO_NA_FONTE`** é falha nossa ou da fonte: a API caiu.
- Confundir os três é o defeito clássico do gênero — **falha de API viraria mau
  pagador**, e ausência de leitura viraria ausência de dívida.

E a consequência: cobertura insuficiente resulta em `DADOS_INSUFICIENTES`, que é
uma **categoria**, nunca uma nota mais baixa. Um devedor sobre quem não se
conseguiu ler nada não vai para o fim da fila como se fosse bom pagador; ele sai
da fila de cobrança e vai para a de coletar mais dados.

## 6. A carteira entrando pela tela, com a quarentena à vista (1 min)

Feche o laço de uso: até aqui a carteira apareceu semeada por comando, e a
pergunta óbvia de quem avalia é **como o cliente carrega a dele**.

Abra `http://127.0.0.1:3000/carteiras/carteira-demo/importacoes` e envie
`fixtures/wallet/invalid-cpf.csv` — três linhas, uma com dígito verificador que
não fecha.

O que apontar, na ordem em que a tela mostra:

- **A conferência não gravou nada.** Não é promessa da tela: a função de
  dry-run não recebe store nenhum, então não tem como escrever. Só o segundo
  clique importa.
- **A linha ruim aparece por número e motivo** — linha 3, `CPF_INVALIDO` —, e
  **sem CPF nenhum**, porque o relatório é lido por uma pessoa e pode ser
  exportado. As outras duas entram: um arquivo nunca é recusado inteiro por
  causa de uma linha, e nada é descartado em silêncio.
- **Valor e vencimento em português**: `R$ 1.500,00` e `15/06/2026`. A
  formatação só acontece na borda; o domínio segue com centavos inteiros.
- **É o mesmo importador do passo 1.** A tela chama exatamente as funções que o
  `pnpm demo` chamou para semear, pela mesma autorização `IMPORT_WALLET`. Não
  existe um segundo caminho de importação para manter em dia.

Se perguntarem por que a interface é tão simples: é decisão, e está escrita em
[`docs/limitacoes-v1.md`](limitacoes-v1.md). O enunciado nomeia um agente de AI
como consumidor e não pede interface; as telas consomem os mesmos handlers e a
mesma autorização da API, então a UI é camada de entrega sobre uma fonte de
verdade só.

## 7. ★ Momento 4 — o que o sistema recusa fazer (1 min)

Fecha com honestidade, e isso conta a favor:

- **A senha `demo`/`demo` não é conferida, e qualquer par serve.** A identidade
  de desenvolvimento não autentica ninguém. Isso é deliberado e está bloqueado
  por código: fora de `NODE_ENV=development` **nenhuma principal verificada é
  emitida em nenhuma chamada**, então o servidor não sobe em produção. A
  validação de JWT/JWKS é a pendência P-1, e é a única que bloqueia entrega
  real.
- **Uma fonte integrada, não cinco.** PGFN em dois universos distintos, que
  nunca se fundem. As outras estão mapeadas e documentadas com custo e base
  legal em [`docs/fontes.md`](fontes.md), com adapter stub — e **jamais
  simuladas como funcionais**.
- **A lista completa do que a v1 não faz** está em
  [`docs/limitacoes-v1.md`](limitacoes-v1.md), com o que cada item é, por que não
  é alcançável hoje e o que dispara o fechamento.

Se perguntarem "e os testes": 585 unitários, que rodam sem Docker, e 13 de
integração contra o PostgreSQL real — não contra mock.

```bash
pnpm test:unit
```

## Encerrando

`Ctrl+C` no terminal do `pnpm demo`, e:

```bash
pnpm compose:down
```

Isso para os containers e **preserva** o volume do banco.

---

## Colinha de tempo

| Passo | O que | Tempo |
|---|---|---|
| — | `install`, `prisma generate`, `compose:up`, `migrate` | **antes**, fora dos 10 min |
| 1 | `pnpm demo` — do banco vazio à API no ar | 1 min |
| 2 | Tela de prioridades | 1 min |
| 3 | Tela do dossiê — **momentos 1 e 2** | 3 min |
| 4 | Endpoint de prompt e a recusa de consulta por CPF | 2 min |
| 5 | Os quatro estados de fonte — **momento 3** | 1,5 min |
| 6 | Tela de importação, com a quarentena à vista | 1 min |
| 7 | O que o sistema recusa fazer — **momento 4** | 0,5 min |

Se o tempo apertar, o passo 6 é o que mais rende cortado pela metade: mostre a
conferência e a linha em quarentena, e pule a confirmação.

## Se algo der errado ao vivo

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `pnpm demo` falha com `EADDRINUSE` | Já existe uma demonstração na porta 3000 | `PORT=3001 pnpm demo`, e troque a porta nas URLs |
| `Cannot find package '@panella/domain'` | Defeito de ambiente E-1: o serviço `workspace-dependencies` do Compose reescreveu `packages/*/node_modules` | Apague `packages/*/node_modules`, rode `pnpm install --frozen-lockfile` e depois `pnpm exec prisma generate` |
| `typecheck` acusa `implicitly has an 'any' type` | Defeito de ambiente E-2: o Prisma Client não está gerado | `pnpm exec prisma generate` |
| A tela devolve 500 `TEMA_NAO_CONFIGURADO` | O tenant não tem tema, e não existe padrão embutido | Rode `pnpm demo` de novo: ele semeia o tema do tenant |
| O navegador devolve 401 numa rota `/api/` | Barra de endereço não manda cabeçalho `Authorization` | Use a linha de comando; só as **telas** pedem credencial ao navegador |
