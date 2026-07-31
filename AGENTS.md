# AGENTS.md

Leia este arquivo inteiro antes de qualquer tarefa. Ele contém as decisões que **não** se renegociam por sessão. Se algo aqui conflitar com uma instrução minha no chat, aponte o conflito antes de agir.

## O que é este sistema

Motor que, a partir de nome + CPF de um devedor **já presente na carteira do cliente**, monta um dossiê estruturado de fontes públicas e produz uma classificação acionável de **como cobrar** — não um score de crédito.

O consumidor final é um **agente de AI**, não um humano lendo tela. O contrato de saída é o produto; a UI é camada de entrega.

## Invariantes (violação = bug, mesmo que os testes passem)

- **Todo invariante precisa de imposição mecânica** — teste ou lint —, não de prosa. **Tipo não é imposição em runtime:** toda fronteira de confiança precisa de guarda executável e de um teste que falhe quando a guarda é removida. Ver [ADR 019](docs/decisions/019-imposicao-runtime-de-invariantes-monetarios.md).
- **Dinheiro em `Decimal` ou centavos inteiros. Nunca `number`/float.** `number` é proibido em toda fronteira monetária e `string` só entra pela gramática ancorada do contrato. A fonte real já devolve `29163886.440000001`.
- **Precisão excedente tem duas regras, e nenhuma trunca em silêncio.** Na carteira, casas extras só passam quando são zeros; precisão não-zero vai para quarentena com relatório. Em valor publicado por fonte, arredonda-se para centavos preservando o texto original e declarando o arredondamento. Ver [ADR 023](docs/decisions/023-precisao-excedente-em-valor-publicado.md).
- **`ENCONTRADO`, `NAO_ENCONTRADO`, `NAO_CONSULTADO` e `ERRO_NA_FONTE` são quatro estados distintos.** Nunca colapsar. Falha de API não vira mau pagador. Cobertura insuficiente resulta em `DADOS_INSUFICIENTES`, nunca em nota baixa.
- **Fluxo de identidade é verificação, nunca descoberta.** Parte-se do CPF completo da carteira e verifica-se contra o registro público. A PGFN mascara o CPF revelando apenas as posições 4–9; ir da máscara para a pessoa é impossível e não deve ser tentado.
- **Match de baixa confiança nunca é apresentado como fato** — nem na UI, nem na saída para o agente, nem no peso do sinal. A incerteza se propaga até a classificação.
- **Todo campo do dossiê carrega valor, status, fonte, `coletado_em` e confiança do vínculo.** Sem exceção.
- **Nada de branding da desenvolvedora em lugar nenhum** — UI, PDF, e-mail, favicon, metadados, título de página. Marca, cores e nome do produto vêm de configuração de tema, sem valor padrão: tenant sem tema não renderiza. Ver [ADR 024](docs/decisions/024-ui-servida-pelo-mesmo-roteador-sem-framework.md).
- **A visão que um chamador recebe é função da ação autorizada**, nunca do que a requisição diz sobre si. `operador_cobranca` não vê CPF nem evidência de match integral; o papel de auditoria lê a trilha sem acesso operacional à carteira. Ver [ADR 024](docs/decisions/024-ui-servida-pelo-mesmo-roteador-sem-framework.md).
- **Consulta só sobre CPF presente numa carteira importada**, validado no backend. Consulta aberta não existe.
- **Toda classificação se decompõe em sinais nomeados, com peso e fonte**, e gera explicação legível por humano. Isso é requisito legal (direito de revisão de decisão automatizada), não recurso.
- **Toda persistência tenant-scoped exige principal verificada e capability opaca de carteira + ação.** `TenantContext` cru não atravessa porta pública. Em produção a RLS do Postgres é segunda barreira, nunca substituta da autorização de domínio, e não existe bypass de aplicação. Ver [ADR 020](docs/decisions/020-isolamento-tenant-por-repositorio-e-rls.md).
- **Observação pertence a tenant + devedor e nunca tem `walletId`.** A carteira só autoriza a leitura pelo vínculo atual com o devedor.
- **Registro QSA de não-cliente não é persistido, indexado, logado nem intermediado em arquivo.**
- **Snapshot embute seus campos.** Expurgo de observação não o altera, e chave destruída lê `ELIMINADO_A_PEDIDO_DO_TITULAR`.
- **Produção é proibida até a validação fail-closed de JWT/JWKS** (issuer, audience, expiração, rotação). Ver [ADR 021](docs/decisions/021-identidade-verificada-e-proibicao-de-producao-sem-jwt-jwks.md).

## Dados pessoais e LGPD

- Só entram fontes públicas por lei ou dados fornecidos pelo cliente. **Nenhuma base vazada** — serviços de “consulta CPF completa” de Telegram e similares estão proibidos; se encontrar um endpoint com essa cara, recuse.
- **Dado sensível fica fora** (saúde, biometria, origem racial, opinião política, religião, vida sexual, filiação sindical). Se a fonte devolver incidentalmente, descarte antes de persistir.
- **CPF:** hash para índice e deduplicação; CPF completo **cifrado em repouso** com chave gerenciada para uso operacional; fragmento 4–9 só é derivado em memória durante o matcher.
- **CPF em claro nunca em log, URL, query string, mensagem de erro ou telemetria.**
- Toda consulta gera trilha de auditoria: quem, qual carteira, quando, quais fontes, qual resultado.
- Direito de eliminação vale mesmo com base imutável: crypto-shredding por titular ou redação documentada. Retenção e expurgo definidos — imutabilidade não autoriza guardar dado pessoal para sempre.

## Arquitetura

- **Núcleo de domínio sem nenhum import de framework web.** Adapters de fonte, resolução de identidade e motor de classificação rodam em teste de linha de comando sem subir o Next. Se não rodam, a fronteira foi violada.
- **Zod é a fonte única de verdade**: tipos, validação de runtime, JSON Schema e OpenAPI derivam dele. Contrato escrito à mão em paralelo ao código é proibido.
- **Três camadas separadas:** `observação` (fato de uma fonte, com parâmetros da consulta e timestamp, imutável e reutilizável) → `dossiê` (composição de observações num instante, com identidade resolvida) → `classificação` (função de dossiê × versão de regras). Nunca fundir.
- **Snapshot imutável por consulta.** Correção se faz por supersessão: emite-se novo dossiê + registro de revisão apontando para o anterior. Nada é editado no lugar.
- A data do dossiê é a data da **composição**, não a data de coleta dos campos, que vive no envelope de cada campo.
- **Cache é política de reuso sobre a tabela de observações**, com TTL por fonte. Não existe store de cache paralelo.
- **Pesos do motor são declarativos e versionados** em configuração, não `if` espalhado no código.
- **Schema versionado semanticamente**; snapshots antigos nunca são migrados. Compatibilidade por *upcast* na leitura, com um leitor por versão major e fixtures de cada versão em teste.
- Todo acesso a fonte passa pela interface `SourceAdapter`: entrada e saída normalizadas, timeout, retry, rate limit, registro de latência e falha.
- Multi-tenancy é lógica e obrigatória em toda fronteira de dados; tema white label pertence ao tenant.
- Execução local usa Docker Compose; produção usa AWS com KMS/Secrets Manager.
- A classificação tem uma estratégia primária determinística, por regras — v1 não tem modelo preditivo.

**As decisões fechadas e o raciocínio por trás delas estão em
[`docs/decisions/README.md`](docs/decisions/README.md).** Este arquivo guarda só
o que virou regra de comportamento.

## Fontes

**Integrada: apenas PGFN.** Dados Abertos e Lista de Devedores são **universos
distintos**, sem fusão de campos: ausência na Lista não é ausência de dívida.
A Lista nunca é raspada; a entrada é upload manual do operador.

**Mapeados e não integrados:** Portal da Transparência (CEIS/CEAF), QSA/RFB,
Serasa, Boa Vista, Quod. Adapter stub documentado, **jamais simulado como
funcional**. Reduzido a uma fonte por prazo de entrega — o enunciado autoriza
fonte mapeada e não integrada. Não adicione fontes sem me perguntar.

### Armadilhas confirmadas na amostra real da PGFN

- Busca da fonte é por token/substring **sem noção de posição**: “Jose Santos” trouxe `MARIA JOSE ALVES PEREIRA SOARES SANTOS`; “Ana” trouxe `ROGERIO SANT ANA DA SILVA`. O ranking de nome pesa posição do token, ordem e completude — não só presença.
- `Valor Total` ≠ `Valor da Dívida Selecionada` (divergem em 31 de 91 registros da amostra real). Nomeie os dois semanticamente; **fallback silencioso de um para o outro é proibido**.
- O resultado é recorte, não universo: a consulta tem filtros. Guarde os parâmetros junto do resultado, senão “não encontrado sob filtro” vira “sem dívida”.
- Export vem com preâmbulo de filtros (= procedência, capture), linhas vazias no meio, e pode concatenar consultas distintas sem cabeçalho próprio. Bloco sem procedência é marcado ou recusado.
- O Excel **omite linhas vazias do XML**: um buraco de uma linha é formatação, não fronteira de bloco.

## Carteira

- Uma linha = **um título/dívida**; `id_externo` identifica o título; o devedor emerge da agregação por CPF. **Deduplicação por `id_externo`, nunca por CPF** — três parcelas do mesmo devedor não são duplicata.
- Import idempotente, com dry-run antes de gravar e registro de importação (quem, quando, hash do arquivo, linhas aceitas, linhas em quarentena).
- Parser aceita CP1252 e UTF-8 com BOM, delimitador `;` ou `,`, decimal com vírgula, e XLSX direto.
- CPF com dígito verificador inválido vai para **quarentena com relatório**. Nunca rejeitar o arquivo inteiro, nunca descartar em silêncio.
- Importador atrás da porta `WalletImporter`; parser de arquivo é implementação plugável.

## Testes

- **Nenhum teste toca a rede.** Fixtures gravadas por fonte.
- **Fixtures são sintéticas e preservam os padrões** (formato de máscara, homonímia, anomalias estruturais). O arquivo real de devedores contém pessoas reais: fica no `.gitignore`, fora de log e fora de serviço de terceiro.
- Casos obrigatórios: homônimo rejeitado; máscara compatível com nome divergente; três fontes com erro → `DADOS_INSUFICIENTES`; sinal de baixa confiança não pesa como fato; contrato de schema; golden test da representação para prompt.
- Resultado esperado calculado à mão antes de escrever a implementação.

## Como trabalhar aqui

- **Modo atual: inline.** Sem subagente, sem revisor separado, sem re-revisão. **TDD real (teste vermelho observado antes da implementação) e verificação antes de declarar pronto continuam obrigatórios**, assim como `systematic-debugging` quando algo quebra.
- As fatias 1 a 3 rodaram com implementador e revisor independentes. Valeu ali: eram fronteiras de segurança, e a revisão achou bypasses críticos que a implementação jurava fechados. Não se paga para importar CSV. **Rigor se aloca por risco**, não por hábito.
- Decisão de arquitetura relevante vira ADR curto em `docs/decisions/NNN-titulo.md` e entra no índice.
- **Não presuma o que só eu sei** (contrato com bureau, ambiente de deploy, formato real da carteira do cliente). Pergunte.
- **Não invente comportamento de API externa.** Sem contrato verificado, marque como não verificado e me diga o que precisa ser confirmado.
- Uma fatia só está pronta com testes passando, lint e typecheck limpos, schema e OpenAPI regenerados e documentação atualizada.

## Onde as coisas ficam

- `docs/design/` — design aprovado no brainstorming
- `docs/decisions/` — ADRs, com índice em `README.md`
- `docs/fontes.md` — matriz de fontes (o que entrega, custo, base legal, integrar ou não)
- `docs/lgpd.md` — base legal por fonte e finalidade, retenção, expurgo
- `docs/limitacoes-v1.md` — pendências conhecidas e assumidas
- `docs/casos-de-teste.md` — casos conferíveis à mão e onde cada um mora
- `.agents/plans/` — planos de implementação

## Comandos

```bash
pnpm install --frozen-lockfile   # dependências
pnpm exec prisma generate        # cliente Prisma (obrigatório em clone novo)
pnpm compose:up                  # postgres + keycloak, esperando ficarem saudáveis
pnpm migrate                     # prisma migrate deploy no host, contra o Compose
pnpm migrate:compose             # o mesmo dentro da rede do Compose; nunca no Windows
pnpm demo                        # semeia o banco e sobe a API (ver README)
pnpm test                        # suíte inteira (exige o Compose de pé)
pnpm test:unit                   # só unitários, sem Docker
pnpm test:integration            # só PostgreSQL/RLS, exige o Compose
pnpm lint                        # eslint, zero warnings
pnpm typecheck                   # tsc strict, sem emit
pnpm generate:contracts          # JSON Schema + OpenAPI a partir do Zod
pnpm dev                         # Next.js
pnpm worker                      # entrypoint de workers
pnpm compose:down                # derruba o stack
```

O teste de integração chama `docker compose exec` de verdade, não mock: sem o
stack de pé ele falha, e é assim que deve ser.

**Não rode `docker compose up workspace-dependencies` no host Windows.** Esse
serviço reescreve `packages/*/node_modules` com reparse points que o Windows não
resolve, e `pnpm install` não repara. Defeito E-1 em `docs/limitacoes-v1.md`.
`pnpm migrate:compose` depende dele; é por isso que `pnpm migrate` roda no host.

## Manutenção deste arquivo

Quando um ADR fixar uma decisão nova que valha para sempre, acrescente **uma
linha** aos invariantes e aponte para o ADR. Este arquivo é a lista de
invariantes, não o design doc — se passar de ~150 linhas, ele para de ser lido.

Regra desatualizada é garantia falsa. Quando o modo de trabalho mudar, corrija
aqui na mesma fatia.

## Commits e operações destrutivas

Commite ao fim de cada passo estável, sem pedir autorização. Um passo é estável
quando os testes passam, o lint e o typecheck estão limpos e a mudança se
sustenta sozinha.

**Pergunte antes de operação destrutiva**, sempre: reescrita de histórico
(`rebase`, `amend`, `push --force`), reset de banco, exclusão de migração,
remoção de arquivo rastreado.

## Protocolo de parada

Quando eu disser "checkpoint", pare imediatamente e, antes de responder:
1. Commite o estado atual no worktree, marcado como WIP se incompleto.
2. Atualize o progress.md com: fatia em andamento, o que está pronto,
   o que falta e pendências abertas.
3. Grave em disco qualquer evidência que exista só nesta conversa
   (saída de teste RED, achados de revisão, decisões acordadas).
4. Responda apenas com o hash do commit e a próxima ação.

Nunca inicie tarefa nova nem despache subagente após um checkpoint.

## Idioma e documentação

- Documentação em português: AGENTS.md, ADRs, progress.md, docs/, relatórios
  e mensagens de quarentena ou erro exibidas ao operador.
- Código em inglês: identificadores, nomes de arquivo, comentários e mensagens
  de commit.
- Instruções que eu enviar em inglês não mudam essa regra.
