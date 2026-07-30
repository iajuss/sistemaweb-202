# Design — motor de dossiê e política de triagem

## Objetivo e limites

O sistema organiza cobrança de devedores já presentes em carteira autorizada. Ele
monta dossiê estruturado de fontes públicas, resolve identidade por verificação e
emite política de triagem acionável para agentes de AI e pessoas autorizadas.

A v1 não é modelo preditivo nem produz probabilidade de pagamento, renda ou
capacidade. Ela usa categoria de política, sinais explicáveis e prioridade
operacional ordinal; `DADOS_INSUFICIENTES` é resultado normal, não erro.

## Arquitetura

É um monólito modular: Next.js expõe UI/API; o núcleo de domínio não importa
framework web ou Keycloak. Workers em containers próprios executam cargas PGFN,
QSA/RFB e expurgo. Keycloak autentica humanos por OIDC e agentes por client
credentials; o domínio recebe `Actor` e decide autorização por carteira.

O isolamento é lógico por tenant em toda fronteira. Workers usam ator de sistema
e candidatos ativos apenas em memória; depois do match persistem observações
separadas por tenant. Dados de não-clientes nunca são persistidos, indexados,
logados ou gravados em intermediários.

PostgreSQL guarda dados tenant-scoped. KMS/Secrets Manager é separado do banco e
mantém chaves individuais por devedor para crypto-shredding. Desenvolvimento usa
Docker Compose; produção usa containers em AWS, RDS, KMS e Secrets Manager.

## Camadas e ciclo de dados

1. **Carteira:** uma linha é um título; `id_externo` é a chave idempotente. O
   devedor emerge da agregação por CPF cifrado e índice HMAC. Importação tem
   dry-run, auditoria e quarentena por linha.
2. **Observação:** fato bruto de fonte, parâmetros, cobertura, referência do
   dataset e procedência; não contém confiança de vínculo. É reutilizável apenas
   dentro do tenant e expira conforme a política.
3. **Resolução de identidade:** módulo reexecutável que compara CPF completo da
   carteira em memória com máscaras, nome e evidências. Produz vínculo,
   confiança e regras que contribuíram.
4. **Dossiê:** snapshot imutável que embute os envelopes de campo, resultado da
   resolução e `resolver_version`. Nova correção cria relação append-only de
   supersessão, nunca edição.
5. **Classificação:** função de dossiê × política declarativa e versionada. A
   classificação imutável mantém categoria, prioridade, estratégia, cobertura,
   confiança global e sinais.
6. **Desfecho:** evento append-only de contato, resposta, pagamento,
   parcelamento ou silêncio, ligado à classificação para permitir validação
   futura, nunca treinamento com amostra pequena.

O compositor é dirigido por lista declarada de fontes/slices esperadas. Cada
campo recebe `ENCONTRADO`, `NAO_ENCONTRADO`, `NAO_CONSULTADO` ou
`ERRO_NA_FONTE`; ausência de observação nunca é ausência de fato.

## Dados, retenção e revisão

CPF completo é cifrado e só é decifrado no limite operacional. Fragmento 4–9 é
derivado somente em memória durante matching. A fonte `CARTEIRA_CLIENTE` usa
confiança `1.0` com evidência `fornecido_pelo_cliente`, significando vínculo
declarado com o registro, não veracidade independente.

Dossiês mantêm cópia materializada: expurgar observação após 12 meses não muda
dossiê vivo de 24 meses. A re-resolução só é possível enquanto a observação
existir; depois o dossiê é explicável, mas não re-resolúvel. Crypto-shredding por
titular retorna `ELIMINADO_A_PEDIDO_DO_TITULAR` ao leitor e preserva somente
esqueleto de auditoria pseudonimizado.

`ReviewRequest` é interno, criado por operador ou encarregado autenticado após a
verificação do titular feita pelo controlador. Registra pedido, análise, decisão
e dossiê/classificação supersedente quando houver.

Retenção é configuração versionada por tenant: carteira até exigibilidade, com
teto de cinco anos ou fim de contrato; observações, 12 meses; dossiês e
classificações, 24 meses com redação posterior; auditoria, 24 meses e nunca menos
de seis; quarentena, 30 dias. São premissas técnicas pendentes de validação
jurídica, registradas em `docs/lgpd.md`.

## Fontes

| Fonte | Modo | Regra principal |
|---|---|---|
| PGFN Dados Abertos | Worker trimestral | Processa SIDA, Previdenciária e FGTS por UF; dados e cobertura permanecem separados. |
| Lista de Devedores PGFN | Import manual auditável | Não há scraping; filtros e blocos do XLSX/CSV definem o escopo. |
| QSA/RFB | Worker mensal | Faz streaming de `Socios*.zip`, usa resolvedor compartilhado e persiste só matches de carteira ativa. |
| CEIS/CEAF | Adapter oficial | Usa segredo de deploy e fixtures offline em desenvolvimento/CI. |

Dados Abertos PGFN e Lista são universos distintos. O delta positivo de
regularidade só é calculado com match confirmado, Dados Abertos encontrado e
Lista manual com `NAO_ENCONTRADO` de escopo integral sem filtro restritivo. QSA é
evidência/contexto de identidade com peso zero; não infere renda, capacidade ou
canal de contato.

## Política de triagem

Políticas são arquivos declarativos e versionados. Uma classificação suficiente
tem estratégia primária determinística, canal, tom, cadência e elegibilidade de
parcelamento. Na dúvida, recomenda a abordagem mais leve; escalada exige
identidade confirmada, cobertura suficiente e evidência forte.

Além da categoria, a API retorna prioridade operacional para que a equipe aplique
corte por capacidade. Toda regra expõe sinais, pesos e fontes; resultado pode ser
reexecutado sobre dossiês antigos e comparado entre versões de política.

Antes de implementação, fixtures sintéticas sustentam casos-limite calculados à
mão, sensibilidade de pesos ±20% e distribuição de categorias. Histórico pequeno
do cliente, se surgir, só valida direção da ordenação.

## Contrato agent-first e UI

Cada campo tem `valor`, `status`, `fonte`, `coletado_em`,
`confianca_vinculo`, `evidencia_vinculo` e procedência. `schema_version` segue
semver; leitores aplicam upcast por major. `prompt_version` é independente e sua
projeção markdown/texto é determinística e coberta por golden test.

Não há CPF em URL. Agente usa `POST /v1/carteiras/{id}/dossies/lookup` com
`id_externo` no corpo, e `GET /v1/carteiras/{id}/prioridades` com cursor. Também
consome dossiê, prompt e registra desfecho apenas se tiver concessão da carteira.
JSON Schema e OpenAPI derivam de Zod como única fonte de verdade.

UI e API usam os mesmos serviços de domínio. `analista_dossie` pode acessar dados
completos conforme finalidade; `operador_cobranca` vê somente o mínimo acionável;
`encarregado_lgpd` vê auditoria/revisão sem carteira operacional; `admin_tenant`
administra configuração e concessões sem ganho automático de acesso a dossiê.

## Verificação

Testes não acessam rede nem usam pessoas reais. Cobrem parser e procedência PGFN,
QSA mascarado com homônimo rejeitado, os quatro estados de fonte, isolamento de
tenant, CPF fora de logs/URLs, schema/prompt versionados, supersessão, expurgo,
revisão, política e golden prompt. Lint, typecheck, schema/OpenAPI e documentação
são requisitos de cada fatia.
