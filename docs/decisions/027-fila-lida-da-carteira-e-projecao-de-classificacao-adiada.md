# ADR 027 — A fila é lida da carteira; a projeção persistida de classificação fica adiada

## Contexto

A tela de prioridades — a primeira que qualquer pessoa abre — servia um **array
calculado na semeadura**. Depois que a importação de carteira ganhou tela
(ADR 024 e a terceira tela), isso deixou de ser detalhe de demonstração e virou
defeito de produto:

> O operador importa uma carteira, o sistema aceita, mostra "2 títulos criados"
> — e a fila não muda. A conclusão razoável é que a importação falhou.

**Tela que mente é pior que tela que reclama.** Um erro visível manda o operador
procurar a causa; um silêncio manda ele desconfiar do sistema inteiro.

Ao consertar, três fatos apareceram e restringem a solução:

1. **Não existe tabela de dossiê nem de classificação.** O schema tem `Tenant`,
   `Wallet`, `Debtor`, `Title`, `ActorIdentity`, `AgentWalletGrant`,
   `Observation` e `WalletImport`. Dossiês são snapshots compostos na consulta e,
   na demonstração, vivem em memória de processo.
2. **A classificação não é computável no nível de autorização da fila.**
   `composeDossierForDebtor` exige `READ_DOSSIER` porque decifra o CPF para o
   matcher. A fila é servida a quem tem `READ_ACTIONABLE` — e é exatamente essa
   a fronteira que impede um operador de alcançar documento e evidência de
   match. A tela não pode ser o lugar onde isso deixa de valer.
3. Logo, um devedor que ninguém consultou **não tem dossiê**, e a linha dele não
   tem `dossierId`.

## Decisão

**A fila lê a composição da carteira do banco, e a classificação de quem já tem
dossiê.** Quem não tem aparece como `DADOS_INSUFICIENTES`, com `dossierId`
nulo, marcado na tela como **"sem dossiê composto"**.

Três consequências que valem estar escritas:

- **Pertencimento vem dos títulos, não dos dossiês.** A carteira é a autoridade
  sobre quem está nela; o dossiê é uma resposta sobre alguém dela. Montar a fila
  a partir de dossiês só mostraria quem já foi consultado — que é precisamente o
  defeito.
- **"Não consultado" ≠ "consultado e nada encontrado".** É a mesma distinção que
  o motor já faz entre `NAO_CONSULTADO` e `NAO_ENCONTRADO`, e ela agora é
  legível na tela em vez de morrer na borda de apresentação. Uma linha em branco
  colapsaria as duas.
- **A prioridade da linha sem dossiê vem da tabela da política**
  (`priorities.DADOS_INSUFICIENTES`), nunca de uma constante na tela. Um número
  fixo ali seria segunda fonte de verdade para a mesma decisão.

### O desempate do cursor mudou

A paginação keyset desempatava por `dossierId`. Como a linha sem dossiê não tem
um, o desempate passou a ser o **`id_externo` do título**.

É seguro por três motivos: o banco impõe
`UNIQUE (tenantId, walletId, externalId)`; a fila carrega **uma linha por
devedor**, representada pelo menor `id_externo` dele, de modo que a chave é
total e estável entre leituras; e o `id_externo` **já estava** no corpo da
resposta e na tela, então o cursor não revela nada que o chamador não tenha
acabado de receber. O cursor continua sem CPF e **sem id de devedor** — que é
pseudônimo, mas ainda é sobre uma pessoa.

## O fim de linha correto, que ficou adiado

**A projeção de classificação deveria ser persistida**: uma tabela por tenant
com `dossierId`, `debtorId`, categoria, prioridade, pontuação e `composedAt`,
escrita quando um dossiê é composto e lida com `READ_ACTIONABLE`. Isso daria à
fila uma leitura única no banco, com paginação empurrada para o SQL,
`dossierId` nunca nulo para quem já foi consultado, e sobrevivência a reinício
de processo.

**Não foi feito, e o motivo é a data.** Tabela nova exige migração, política de
RLS (ADR 020), repositório com o padrão de autoridade e fábrica, inscrição no
teste arquitetural que enumera repositórios, e teste de integração de
isolamento. É a maior mudança possível na véspera da entrega, no subsistema
onde um erro custa mais caro — persistência e isolamento entre tenants.

A decisão foi tomada explicitamente pelo dono do repositório, com a alternativa
na mesa. Registrada em [`proximos-passos.md`](../proximos-passos.md).

**O que a v1 paga por isso:** a fila lê os snapshots do processo, então um
reinício apaga as classificações e todos os devedores voltam a aparecer como
"sem dossiê composto" até serem consultados de novo. Como a demonstração
resemeia o tenant a cada `pnpm demo`, isso não é visível ali — mas é real, e
some quando a projeção existir. É limite da mesma família da pendência F-5, em
que o cofre de chaves AEAD também vive no processo.

## Alternativas descartadas

* **Compor os dossiês faltantes na hora de montar a fila.** Faria a tela do
  operador exigir `READ_DOSSIER` e decifrar CPF de toda a carteira a cada
  carregamento. Troca uma tela honesta por uma escalada de privilégio.
* **Omitir da fila quem não tem dossiê.** É o defeito original com outra
  roupa: o devedor importado continua invisível.
* **Deixar a linha sem marcação visual.** Uma célula em branco lê-se como
  dossiê vazio, e o sistema inteiro é construído sobre não confundir ausência de
  consulta com ausência de dívida.
* **Manter o desempate em `dossierId` e inventar um id para a linha sem
  dossiê.** Um identificador inventado que viaja num cursor opaco é exatamente o
  tipo de dado que depois alguém trata como real.
* **Desempatar por `debtorId`.** Pseudônimo, mas sobre uma pessoa; o cursor
  declara não carregar isso.
