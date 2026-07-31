# Índice de ADRs

Decisões fechadas. Não se reabrem por sessão — se uma precisar mudar, escreva
um ADR novo que a supersede e diga qual.

O `AGENTS.md` guarda só as decisões que viraram **regra de comportamento** no
código do dia a dia. Todo o resto do raciocínio, alternativas descartadas e
consequências mora aqui.

| # | Decisão |
|---|---|
| [001](001-carteira-granularidade-por-titulo.md) | Carteira tem granularidade por título |
| [002](002-cpf-cifrado-e-fragmento-para-resolucao.md) | CPF é cifrado em repouso; hash não substitui dado operacional |
| [003](003-minimizacao-por-matriz-de-discriminacao.md) | Schema de identidade é limitado à matriz de discriminação |
| [004](004-observacoes-cache-e-dossies-imutaveis.md) | Observações reutilizáveis, dossiês imutáveis e classificação versionada |
| [005](005-multitenancy-logica-e-white-label.md) | Multi-tenancy lógica com isolamento obrigatório por tenant |
| [006](006-topologia-de-execucao-e-gestao-de-segredos.md) | Docker Compose local e AWS para produção |
| [007](007-keycloak-como-provedor-de-identidade.md) | Keycloak é o provedor de identidade da v1 |
| [008](008-identidade-de-agente-e-autorizacao-por-carteira.md) | Agentes usam client credentials; autorização de carteira fica no domínio |
| [009](009-retencao-configuravel-e-expurgo-com-esqueleto-de-auditoria.md) | Retenção por tenant, crypto-shredding e auditoria pseudonimizada |
| [010](010-estrategia-primaria-deterministica.md) | Uma estratégia primária determinística por devedor |
| [011](011-carga-seletiva-mensal-do-qsa-rfb.md) | QSA/RFB é carregado seletivamente em job mensal |
| [012](012-vinculo-qsa-e-contexto-sem-score-de-capacidade.md) | Vínculo QSA é evidência de identidade e contexto, não score financeiro |
| [013](013-credencial-do-portal-da-transparencia-como-segredo.md) | Credencial do Portal da Transparência é segredo de ambiente |
| [014](014-universos-pgfn-separados-e-delta-de-regularidade.md) | Dados Abertos e Lista PGFN são universos separados |
| [015](015-sem-scraping-da-lista-de-devedores-pgfn.md) | Lista de Devedores PGFN não será automatizada por scraping |
| [016](016-politica-de-triagem-regras-e-aprendizado-futuro.md) | Política de triagem por regras, auditável e reexecutável |
| [017](017-observacoes-brutas-resolucao-e-isolamento-em-workers.md) | Observações brutas, resolução reexecutável e workers particionados |
| [018](018-contratos-de-snapshot-revisao-e-expurgo.md) | Snapshot explica sua resolução, revisão e eliminação |
| [019](019-imposicao-runtime-de-invariantes-monetarios.md) | Invariantes monetários impostos em runtime |
| [020](020-isolamento-tenant-por-repositorio-e-rls.md) | Isolamento tenant por repositório e RLS |
| [021](021-identidade-verificada-e-proibicao-de-producao-sem-jwt-jwks.md) | Identidade só entra por principal verificada; produção espera JWT/JWKS |
| [022](022-leitor-xlsx-sem-dependencia-externa.md) | Leitor XLSX próprio, sem dependência externa |
| [023](023-precisao-excedente-em-valor-publicado.md) | Precisão excedente: carteira quarentena, fonte publicada arredonda com rastro |
| [024](024-ui-servida-pelo-mesmo-roteador-sem-framework.md) | UI no mesmo roteador, sem framework; audiência derivada da concessão |
| [025](025-versao-de-politica-identifica-comportamento.md) | Versão de política identifica comportamento, não intenção |

## Escrevendo um ADR novo

Curto: contexto, decisão, alternativas descartadas, consequências. Numeração
sequencial. Se a decisão virar regra permanente de comportamento, acrescente
**uma linha** aos invariantes do `AGENTS.md` apontando para cá.
