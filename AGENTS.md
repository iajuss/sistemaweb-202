# AGENTS.md

Leia este arquivo inteiro antes de qualquer tarefa. Ele contém as decisões que **não** se renegociam por sessão. Se algo aqui conflitar com uma instrução minha no chat, aponte o conflito antes de agir.

## O que é este sistema

Motor que, a partir de nome + CPF de um devedor **já presente na carteira do cliente**, monta um dossiê estruturado de fontes públicas e produz uma classificação acionável de **como cobrar** — não um score de crédito.

O consumidor final é um **agente de AI**, não um humano lendo tela. O contrato de saída é o produto; a UI é camada de entrega.

## Invariantes (violação = bug, mesmo que os testes passem)

- **Dinheiro em `Decimal` ou centavos inteiros. Nunca `number`/float.** A fonte real já devolve `29163886.440000001`.
- **`ENCONTRADO`, `NAO_ENCONTRADO`, `NAO_CONSULTADO` e `ERRO_NA_FONTE` são quatro estados distintos.** Nunca colapsar. Falha de API não vira mau pagador. Cobertura insuficiente resulta em `DADOS_INSUFICIENTES`, nunca em nota baixa.
- **Fluxo de identidade é verificação, nunca descoberta.** Parte-se do CPF completo da carteira e verifica-se contra o registro público. A PGFN mascara o CPF revelando apenas as posições 4–9; ir da máscara para a pessoa é impossível e não deve ser tentado.
- **Match de baixa confiança nunca é apresentado como fato** — nem na UI, nem na saída para o agente, nem no peso do sinal. A incerteza se propaga até a classificação.
- **Todo campo do dossiê carrega valor, status, fonte, `coletado_em` e confiança do vínculo.** Sem exceção.
- **Nada de branding da desenvolvedora em lugar nenhum** — UI, PDF, e-mail, favicon, metadados, título de página. Marca, cores e nome do produto vêm de configuração de tema.
- **Consulta só sobre CPF presente numa carteira importada**, validado no backend. Consulta aberta não existe.
- **Toda classificação se decompõe em sinais nomeados, com peso e fonte**, e gera explicação legível por humano. Isso é requisito legal (direito de revisão de decisão automatizada), não recurso.

## Dados pessoais e LGPD

- Só entram fontes públicas por lei ou dados fornecidos pelo cliente. **Nenhuma
  base vazada** — serviços de “consulta CPF completa” de Telegram e similares
  estão proibidos; se encontrar um endpoint com essa cara, recuse.
- **Dado sensível fica fora** (saúde, biometria, origem racial, opinião política, religião, vida sexual, filiação sindical). Se a fonte devolver incidentalmente, descarte antes de persistir.
- **CPF:** hash para índice e deduplicação; CPF completo **cifrado em repouso** com chave gerenciada para uso operacional; fragmento 4–9 só é derivado em memória durante o matcher.
- **CPF em claro nunca em log, URL, query string, mensagem de erro ou
  telemetria.**
- Toda consulta gera trilha de auditoria: quem, qual carteira, quando, quais
  fontes, qual resultado.
- Direito de eliminação vale mesmo com base imutável: crypto-shredding por
  titular ou redação documentada. Retenção e expurgo definidos — imutabilidade
  não autoriza guardar dado pessoal para sempre.

## Arquitetura

- **Núcleo de domínio sem nenhum import de framework web.** Adapters de fonte, resolução de identidade e motor de classificação rodam em teste de linha de comando sem subir o Next. Se não rodam, a fronteira foi violada.
- **Zod é a fonte única de verdade**: tipos, validação de runtime, JSON Schema e
  OpenAPI derivam dele. Contrato escrito à mão em paralelo ao código é proibido.
- **Três camadas separadas:** `observação` (fato de uma fonte, com parâmetros da
  consulta e timestamp, imutável e reutilizável) → `dossiê` (composição de
  observações num instante, com identidade resolvida) → `classificação` (função
  de dossiê × versão de regras). Nunca fundir.
- **Snapshot imutável por consulta.** Correção se faz por supersessão: emite-se novo dossiê + registro de revisão apontando para o anterior. Nada é editado no lugar.
- A data do dossiê é a data da **composição**, não a data de coleta dos campos, que vive no envelope de cada campo.
- **Cache é política de reuso sobre a tabela de observações**, com TTL por fonte. Não existe store de cache paralelo.
- **Pesos do motor são declarativos e versionados** em configuração, não `if`
  espalhado no código.
- **Schema versionado semanticamente**; snapshots antigos nunca são migrados. Compatibilidade por *upcast* na leitura, com um leitor por versão major e fixtures de cada versão em teste.
- Todo acesso a fonte passa pela interface `SourceAdapter`: entrada e saída normalizadas, timeout, retry, rate limit, registro de latência e falha.
- Multi-tenancy é lógica e obrigatória em toda fronteira de dados; tema white label pertence ao tenant. Ver [ADR 005](docs/decisions/005-multitenancy-logica-e-white-label.md).
- Execução local usa Docker Compose; produção usa AWS com KMS/Secrets Manager. Ver [ADR 006](docs/decisions/006-topologia-de-execucao-e-gestao-de-segredos.md).
- Keycloak autentica humanos e agentes; `provedor + subject` identifica atores e autorização de carteira é do domínio. Ver [ADR 007](docs/decisions/007-keycloak-como-provedor-de-identidade.md) e [ADR 008](docs/decisions/008-identidade-de-agente-e-autorizacao-por-carteira.md).
- Retenção é política por tenant; expurgo preserva auditoria pseudonimizada. Ver [ADR 009](docs/decisions/009-retencao-configuravel-e-expurgo-com-esqueleto-de-auditoria.md).
- A classificação tem uma estratégia primária determinística. Ver [ADR 010](docs/decisions/010-estrategia-primaria-deterministica.md).
- QSA/RFB é job mensal seletivo; arquivo bruto é efêmero. Ver [ADR 011](docs/decisions/011-carga-seletiva-mensal-do-qsa-rfb.md).
- Registro QSA de não-cliente não é persistido, indexado, logado nem intermediado em arquivo.
- Vínculo QSA é contexto com peso zero, nunca proxy de renda. Ver [ADR 012](docs/decisions/012-vinculo-qsa-e-contexto-sem-score-de-capacidade.md).
- Credencial do Portal da Transparência é segredo de deploy; CI usa fixtures. Ver [ADR 013](docs/decisions/013-credencial-do-portal-da-transparencia-como-segredo.md).
- Dados Abertos PGFN e Lista são fontes distintas; delta de regularidade é sinal condicionado. Ver [ADR 014](docs/decisions/014-universos-pgfn-separados-e-delta-de-regularidade.md).
- Não automatizar/scrapear a Lista PGFN sem contrato verificado. Ver [ADR 015](docs/decisions/015-sem-scraping-da-lista-de-devedores-pgfn.md).
- V1 é política de triagem por regras, não modelo preditivo. Ver [ADR 016](docs/decisions/016-politica-de-triagem-regras-e-aprendizado-futuro.md).
- Observação é fato bruto; resolução é reexecutável e workers persistem por tenant. Ver [ADR 017](docs/decisions/017-observacoes-brutas-resolucao-e-isolamento-em-workers.md).
- Snapshots registram resolvedor, supersessão, revisão e chave por titular. Ver [ADR 018](docs/decisions/018-contratos-de-snapshot-revisao-e-expurgo.md).
- Snapshot embute seus campos; expurgo de observação não o altera e chave destruída lê `ELIMINADO_A_PEDIDO_DO_TITULAR`.

## Fontes

Integradas: **PGFN**, **Portal da Transparência (CEIS/CEAF)**, **QSA/RFB**.
Bureaus (Serasa, Boa Vista, Quod) são **mapeados e não integrados** — adapter
stub documentado, jamais simulado como funcional. Três fontes bem amarradas
valem mais que dez frágeis; não adicione fontes sem me perguntar.

### Armadilhas confirmadas na amostra real da PGFN

- Busca da fonte é por token/substring **sem noção de posição**: “Jose Santos”
  trouxe `MARIA JOSE ALVES PEREIRA SOARES SANTOS`; “Ana” trouxe `ROGERIO SANT
  ANA DA SILVA`. O ranking de nome pesa posição do token, ordem e completude —
  não só presença.
- `Valor Total` ≠ `Valor da Dívida Selecionada` (divergem em 31 de 91 registros
  da amostra). Nomeie os dois semanticamente; **fallback silencioso de um para o
  outro é proibido**.
- O resultado é recorte, não universo: a consulta tem filtros. Guarde os
  parâmetros junto do resultado, senão “não encontrado sob filtro” vira “sem
  dívida”.
- Export vem com preâmbulo de filtros (= procedência, capture), linhas vazias no
  meio, e pode concatenar consultas distintas sem cabeçalho próprio. Bloco sem
  procedência é marcado ou recusado.

## Carteira

- Uma linha = **um título/dívida**; `id_externo` identifica o título; o devedor
  emerge da agregação por CPF. **Deduplicação por `id_externo`, nunca por CPF**
  — três parcelas do mesmo devedor não são duplicata.
- Import idempotente, com dry-run antes de gravar e registro de importação (quem,
  quando, hash do arquivo, linhas aceitas, linhas em quarentena).
- Parser aceita CP1252 e UTF-8 com BOM, delimitador `;` ou `,`, decimal com
  vírgula, e XLSX direto.
- CPF com dígito verificador inválido vai para **quarentena com relatório**.
  Nunca rejeitar o arquivo inteiro, nunca descartar em silêncio.
- Importador atrás da porta `WalletImporter`; parser de arquivo é implementação
  plugável.

## Testes

- **Nenhum teste toca a rede.** Fixtures gravadas por fonte.
- **Fixtures são sintéticas e preservam os padrões** (formato de máscara,
  homonímia, anomalias estruturais). O arquivo real de devedores contém pessoas
  reais: fica no `.gitignore`, fora de log e fora de serviço de terceiro.
- Casos obrigatórios: homônimo rejeitado; máscara compatível com nome divergente;
  três fontes com erro → `DADOS_INSUFICIENTES`; sinal de baixa confiança não pesa
  como fato; contrato de schema; golden test da representação para prompt.
- Resultado esperado calculado à mão antes de escrever a implementação.

## Como trabalhar aqui

- Disciplina Superpowers, sem pular etapa: brainstorming → `write-plan` →
  `execute-plan` com TDD real (teste vermelho primeiro), `systematic-debugging`
  quando quebrar, `verification-before-completion` antes de dizer que algo está
  pronto.
- Decisão de arquitetura relevante vira ADR curto em `docs/decisions/NNN-titulo.md`.
- **Não presuma o que só eu sei** (contrato com bureau, ambiente de deploy,
  formato real da carteira do cliente). Pergunte.
- **Não invente comportamento de API externa.** Sem contrato verificado, marque
  como não verificado e me diga o que precisa ser confirmado.
- Uma fatia só está pronta com testes passando, lint e typecheck limpos, schema e
  OpenAPI regenerados e documentação atualizada.

## Onde as coisas ficam

- `docs/design/` — design aprovado no brainstorming
- `docs/decisions/` — ADRs
- `docs/fontes.md` — matriz de fontes (o que entrega, custo, base legal,
  integrar ou não)
- `docs/lgpd.md` — base legal por fonte e finalidade, retenção, expurgo
- `.agents/plans/` — planos de implementação

## Comandos

<!-- preencher assim que o scaffold existir: install, dev, test, lint, typecheck, migrate, gerar OpenAPI -->

## Manutenção deste arquivo

Quando um ADR fixar uma decisão nova que valha para sempre, acrescente **uma
linha** aqui e aponte para o ADR. Este arquivo é a lista de invariantes, não o
design doc — se passar de ~150 linhas, ele para de ser lido.

Todo invariante precisa de imposição mecânica — teste ou lint — e não apenas de
prosa; para dinheiro, `number` é proibido em toda fronteira e `string` só entra
pela gramática ancorada do contrato. Ver ADR 019.

Tipo não é imposição em runtime: toda fronteira de confiança precisa de guarda
executável e de teste que falhe se ela for removida. Ver ADR 019.

Toda persistência tenant-scoped passa por repositório com `TenantContext`; em
produção, RLS do Postgres é segunda barreira e nunca há bypass de aplicação.
Ver ADR 020.

## Commits

Sempre pergunte se pode dar commits das mudanças realizadas.

## Protocolo de parada

Quando eu disser "checkpoint", pare imediatamente e, antes de responder:
1. Commite o estado atual no worktree, marcado como WIP se incompleto.
2. Atualize o progress.md com: fatia em andamento, o que está pronto,
   o que falta e pendências abertas.
3. Grave em disco qualquer evidência que exista só nesta conversa
   (saída de teste RED, achados de revisão, decisões acordadas).
4. Responda apenas com o hash do commit e a próxima ação.

Nunca inicie tarefa nova nem despache subagente após um checkpoint.
