# O que a v1 não faz

Lista de pendências conhecidas e assumidas. Cada item traz **o que é**, **por
que não é alcançável hoje** e **o que dispara a necessidade de fechar**.
Revisada item a item na leitura final de entrega, em 2026-07-31.

**A superfície HTTP existe agora**, e com ela caiu o motivo que boa parte desta
lista dava para não ser exercitável. Versões anteriores deste documento diziam
que nenhum item era alcançável porque não havia rota; isso deixou de ser
verdade quando as três rotas de API e as duas telas entraram no ar. Cada linha
abaixo declara o motivo que vale **hoje**, não o motivo que valia antes de a
superfície existir — e um item mudou de estado por causa disso (I-3, agora
fechado, registrado no fim do documento).

O que **não** mudou é o bloqueio de produção: fora de `NODE_ENV=development`
nenhuma `VerifiedPrincipal` é emitida, em nenhuma chamada, então o servidor não
autentica ninguém em produção (ADR 021). É esse fecho que segura a maior parte
do risco desta lista.

## Bloqueio de produção

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| P-1 | Verificação de token JWT/JWKS ausente: assinatura, issuer, audience e expiração não são validadas (ADR 021). | As rotas **já leem** o cabeçalho `Authorization`, mas só o esquema (`Bearer` ou `Basic`): nenhuma credencial é conferida, e a identidade servida é a de desenvolvimento. O que impede isso de virar furo é o fecho do ADR 021 — fora de `NODE_ENV=development` nenhuma principal é emitida em nenhuma chamada, então um processo iniciado em produção não serve dossiê nenhum. A demonstração ainda recusa banco fora de loopback antes de assumir o modo de desenvolvimento. | **Qualquer deploy.** É a única pendência que bloqueia entrega real, e enquanto ela existir nenhum dado pessoal real deve ser importado. |

## Autorização

| # | Severidade | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|---|
| I-2 | Important | Ator `HUMAN` é autorizado só por papel: `authorization.ts:60-66` ignora `walletId` e `authorize-actor.ts:197-199` retorna antes de consultar a concessão, então um `ANALISTA_DOSSIE` alcançaria toda carteira do tenant. Isolamento entre tenants permanece íntegro. | **As telas já pedem credencial ao navegador, e mesmo assim nenhum ator `HUMAN` é construído fora de teste.** A caixa de usuário e senha existe porque a resposta 401 de página manda `WWW-Authenticate: Basic`, mas a raiz de composição da demonstração devolve sempre o **agente** de desenvolvimento, com concessão por carteira — o caminho de autorização humano continua sem chamador em produção de código. | Primeiro ator `HUMAN` emitido fora de teste. Na prática isso chega junto de P-1: enquanto o tenant e o papel não vierem de claim verificada, não há de onde emitir um. |
| I-5 | Important | Chave única de `ActorIdentity` é `(tenantId, provider, subject)` mas a resolução carrega só `{provider, subject}`, e a RLS forçada da tabela chaveia num tenant ainda desconhecido no momento da consulta — nenhuma implementação Prisma pode funcionar como está. | Não existe implementação de `IdentityActorRepository` contra o banco; todo teste usa fixture em memória. | Primeira resolução de identidade contra PostgreSQL. Decisão já tomada: unicidade global de `(provider, subject)`, `ActorIdentity` como tabela de bootstrap fora da RLS, com a limitação consciente de que uma identidade pertence a exatamente um tenant. Some quando P-1 fechar e o tenant vier de claim verificada. |

## Imposição de invariante

| # | Severidade | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|---|
| I-4 | Important | **Reduzido de sete itens para dois em 2026-07-31.** Cinco das seis guardas e o pós-filtro `containsDebtor` ganharam teste de remoção — ver a seção de fechados. Restam **`OPERATION_CONTEXT_IDENTITY_MISMATCH`** (`tenant-repository.ts:63`) e **`AUTHORIZED_WALLET_CONTEXT_REQUIRED`** (`authorize-actor.ts:56`) sem teste que falhe quando removidas. | **As duas são vazias por construção, e é por isso que nenhum teste as derruba.** `OPERATION_CONTEXT_IDENTITY_MISMATCH` compara `operation.context.actor` com `operation.identity.actor`; existe **um único** emissor de `AuthorizedOperation` (`issueAuthorizedOperation`), que monta a operação com a mesma `identity` e com `createTenantContext(identity.actor)` — a mesma referência dos dois lados —, e só objetos registrados no `WeakSet` do emissor passam pela barreira anterior. `AUTHORIZED_WALLET_CONTEXT_REQUIRED` é lançada por uma função **privada de módulo**, com um único chamador, sobre um contexto criado na linha imediatamente acima. Nenhum caminho de chamada consegue apresentar um valor que faça qualquer uma das duas disparar. **Nenhuma das duas está quebrada:** conferido que `authorize()` tem um único ponto de chamada e nunca decide a partir de `context.actor`, e que `context.actor` só alimenta validação de tenant e o `actorId` da auditoria. | **Decisão de desenho, não teste a escrever.** Ou a guarda vazia sai — código morto também é garantia falsa —, ou a fronteira muda para que um contexto/operação de fora possa de fato chegar até ela, e aí o teste passa a existir. Escrever "teste" para uma condição que o código não consegue produzir seria fabricar a prova, que é exatamente o defeito que o I-4 nomeia. |
| M-1 | Menor | Regra ESLint em `eslint.config.mjs:25` proíbe importar `issueAuthenticatedActor` de `@panella/domain` — símbolo que não existe em lugar nenhum do repositório. Regra que nunca dispara produz confiança falsa. | Não protege nada, então não há o que furar: a regra não tem alvo, e por isso nem passa a proteger nem passa a atrapalhar com a chegada da superfície HTTP. | Junto de M-3, que lhe daria um alvo real. |
| M-2 | Menor | `web` e `worker` não definem `NODE_ENV` no `docker-compose.yml`, e o `DevInsecureIdentityProvider` decide falhar fechado com base nessa variável. A garantia depende de valor indefinido. | `undefined !== "development"`, então o comportamento atual é o seguro: nenhum principal é emitido. O defeito é depender de acidente em vez de declaração. | Primeiro serviço que precise realmente subir com identidade de desenvolvimento. |
| M-3 | Menor | `createTenantContext` é exportado no barrel do domínio, contra o ADR 020 (`TenantContext` é detalhe interno e nunca porta pública). Consumidor legítimo único é `authorize-actor.ts`. | **Agora existem portas públicas, e o símbolo continua exportado** — o que não mudou é que nenhuma delas o chama: as rotas trabalham com `VerifiedPrincipal` e `AuthorizedOperation`, e o contexto de tenant só é montado dentro da autorização. O defeito é a porta aberta, não uma travessia que esteja acontecendo. | Fecha junto com M-1, movendo o símbolo para subpath restrito e apontando a regra morta de lint para ele. |
| M-4 | Menor | `TransactionalTenantScopedRepository` tem construtor público sem autoridade. | Construir um sobre banco próprio não concede nada: toda leitura e escrita exige `VerifiedPrincipal` e `AuthorizedOperation`, os internos são campos `#` privados e o leitor recusa registro com `debtorId`. | Se a classe passar a guardar estado que valha por si.  |
| M-5 | Menor | Ciclo de dependência entre `packages/application` e `packages/adapters`. | Compila e roda; incomoda extração futura, não corretude. | Extração de qualquer um dos dois pacotes. |

## Fontes

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| F-1 | QSA/RFB e Portal da Transparência ficam **mapeados e não integrados**, com adapter stub e documentação em `docs/fontes.md`. | Decisão de escopo por prazo; o enunciado autoriza fonte mapeada e não integrada. | Só se a política de triagem passar a depender de sinal dessas fontes. Hoje o sinal de QSA tem peso e contribuição zero por decisão do ADR 012. |
| F-3 | Layout de colunas dos Dados Abertos PGFN segue o publicado e **não é verificado por contrato**. | Não há amostra real de Dados Abertos; a Lista manual, essa sim, foi conferida contra arquivo real. | Primeira execução do worker contra arquivo publicado de verdade. Layout inesperado falha alto (`LAYOUT_PGFN_INVALIDO`), nunca devolve campo vazio. |
| F-4 | Detecção de bloco na Lista manual usa limiar de **duas linhas vazias**, heurística não verificada. | Nenhum export real com duas consultas concatenadas estava disponível; o arquivo real conferido tem uma consulta só. | Primeiro export real concatenado. Custo de errar é limitado por desenho: bloco sem preâmbulo é marcado `SEM_PROCEDENCIA`, nunca fundido. |
| F-2 | Lista PGFN manual não é raspada em nenhuma hipótese (ADR 015); a entrada é upload manual. | Decisão fechada em ADR, não pendência. | Nunca. Registrado aqui para não ser relido como lacuna. |
| F-5 | O cofre de chaves AEAD é `createInMemoryCpfCrypto`: o `Debtor` fica cifrado no banco, mas a chave morre com o processo, então um processo novo não decifra o CPF de uma importação anterior. | Não há integração com KMS; ADR 006 define AWS KMS/Secrets Manager para produção e nada disso sobe em Compose local. | Primeiro ambiente que precise ler um CPF importado por outro processo — na prática, o mesmo deploy que P-1 bloqueia. |

## Classificação

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| C-1 | `confianca_global` cai a **zero** sempre que o delta de regularidade se aplica. O sinal declara depender de `pgfn_lista_presente`, o elo mais fraco é a confiança daquele vínculo, e um vínculo recusado carrega confiança 0 — mas **recusa é resposta, não incerteza**. O número publicado subestima a certeza da classificação exatamente no caso em que ela é mais firme. | O efeito é local ao campo publicado e **não cascateia**, o que foi conferido por leitura e por teste na entrega: o veredito de cobertura é decidido na composição do dossiê, antes de qualquer classificação existir, e `confianca_global` é escrita na última linha da avaliação e não é lida por nada que decida. Nem a categoria, nem o curto-circuito de `DADOS_INSUFICIENTES`, nem a estratégia, nem a explicação a consultam. Preso por `evaluate.test.ts` — *confianca_global is an output, never an input*. | Consertar a leitura do elo mais fraco é **mudança de política**, com bump de versão (ADR 025) e recálculo dos casos calculados à mão. Fecha quando houver uma versão nova de política a desenhar; não se conserta dentro de `2026-07-B`. |

## Ambiente

| # | O que é | Por que não alcançável hoje | Gatilho para fechar |
|---|---|---|---|
| E-1 | O serviço `workspace-dependencies` do Compose faz bind-mount do repositório enquanto o volume nomeado cobre só o `node_modules` da raiz, então o container reescreve `packages/*/node_modules` no host Windows com reparse points que o Windows não resolve. **`pnpm migrate` depende desse serviço**, então rodar migração dispara o defeito. Reincidiu em 2026-07-31 e derrubou 17 arquivos de teste com `Cannot find package '@panella/domain'`. | Afeta só a máquina de desenvolvimento; não altera artefato entregue. | Já custou tempo três vezes. **Reparo confirmado:** apagar `packages/*/node_modules` no host, rodar `pnpm install --frozen-lockfile` e depois `pnpm exec prisma generate`. O install responde "Already up to date" — a mensagem é enganosa, o relink acontece mesmo assim, e `--force` não é necessário. Correção desenhada: volumes nomeados sobre cada caminho `node_modules` e `prisma generate` no entrypoint. |
| E-2 | Reinstalação limpa de `node_modules` apaga o Prisma Client gerado, e o `tsc` passa a reportar `implicitly has an 'any' type` em callbacks de `$transaction`. | Artefato de ambiente, não defeito de produto. | Nenhum. `pnpm exec prisma generate` restaura; registrado para a falha não ser lida como regressão. |

## Fechadas, guardadas aqui para o histórico

Um item saiu desta lista porque o gatilho dele disparou e ele foi de fato
fechado. Fica registrado para que a ausência não seja lida como esquecimento.

| # | O que era | Como fechou |
|---|---|---|
| I-3 | `mapVerifiedKeycloakActor` e `authorizeOperation` recebiam o repositório de identidade como parâmetro do chamador, então `tenantId` e `roles` vinham do objeto passado. O gatilho declarado era a primeira rota que montasse esses argumentos a partir de dados de requisição. | A rota chegou e **não** virou bypass. Toda dependência que decide quem é o chamador — provedor de identidade, repositório de identidade, repositório de autorização — é fixada na construção do roteador e não é escolhível por requisição. O teste que prende isso usa um repositório que devolve `tenant-b` contra uma carteira de `tenant-a` e exige 403: se a requisição pudesse escolher o repositório, ele passaria (`apps/web/src/http/router.test.ts`). |

### I-4, a parte que fechou

Cinco guardas e o pós-filtro ganharam teste de remoção em 2026-07-31. Cada
mutação derruba **exatamente um** teste nomeado, e nenhum outro — a suíte tem
534 unitários, então "derrubou um" é afirmação forte e não coincidência.

| Guarda removida | Teste que falha | Onde |
|---|---|---|
| `AUTHORIZED_OPERATION_REQUIRED` | *refuses an operation the issuer never issued* | `packages/application/src/authorize-actor.test.ts` |
| `OPERATION_PRINCIPAL_MISMATCH` | *refuses an operation issued to a different principal* | `packages/adapters/src/repositories/tenant-repository.test.ts` |
| `SYSTEM_INGESTION_CAPABILITY_REQUIRED` | *refuses source ingestion to an actor that is not a system worker* | idem |
| `INVALID_TENANT_CONTEXT` | *refuses a registered context whose actor no longer agrees on the tenant* | `packages/domain/src/authorization.test.ts` |
| pós-filtro `containsDebtor` | *does not answer with an observation whose debtor the wallet does not hold* | `packages/application/src/authorize-actor.test.ts` |

Os casos usam principals e operações **genuínas**, emitidas pelo emissor real.
Forjar a entrada faria a chamada morrer numa guarda anterior, e o teste passaria
pelo motivo errado — verde por acidente é o que o ADR 019 existe para evitar.

Dois deles precisaram de um caminho que não é óbvio:

- **`INVALID_TENANT_CONTEXT`** só é alcançável porque `createTenantContext`
  guarda a referência do ator do chamador em vez de cloná-la, e congelar o
  contexto não congela o objeto para onde ele aponta. O teste registra um ator
  mutável, muda o `tenantId` dele depois, e a guarda pega. Vale notar que o
  caminho existe por causa do defeito M-3: `createTenantContext` está exportado
  no barrel do domínio.
- **`containsDebtor`** exigia provar que o filtro *filtra*, e não que a leitura
  foi evitada antes. O teste afirma que `observations.find` **foi** chamado e
  ainda assim a resposta é `null`.
