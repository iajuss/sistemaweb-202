# ADR 005 — Multi-tenancy lógica com isolamento obrigatório por tenant

## Contexto

O produto é white label e deve atender mais de um cliente sem duplicar a
aplicação. Carteiras, devedores, observações, dossiês, classificações, tema e
auditoria não podem vazar entre clientes.

## Decisão

A v1 será multi-tenant em uma instância compartilhada, com isolamento lógico
obrigatório. Todo agregado persistido pertence a um `tenant_id`; toda consulta,
mutação, job e acesso a arquivo aplica esse escopo a partir da identidade
autenticada, nunca de um parâmetro controlado pelo cliente. Configuração white
label (nome, logo, cores, favicon, remetente e metadados) pertence ao tenant.

O modelo de dados e a camada de repositório deverão impedir acesso sem contexto
de tenant. A estratégia de autenticação, controle de acesso e mecanismo de
isolamento no banco será fechada no design de deploy, pois depende do provedor e
do requisito contratual de cada cliente.

O mecanismo foi fechado como defesa em profundidade: repositórios exigem
`TenantContext` e o PostgreSQL aplica RLS em produção. Ver ADR 020.

## Alternativas descartadas

* **Instância dedicada desde a v1:** aumenta operação e custo sem requisito
  comercial ou contratual informado.
* **Tenant apenas na UI ou no subdomínio:** permite bypass pela API ou por jobs.
* **Branding fixo por build:** viola white label e força deploy por mudança visual.

## Consequências

Auditoria, retenção, chaves e políticas de consulta precisarão carregar escopo de
tenant. Uma futura oferta de instância dedicada poderá manter o mesmo modelo de
domínio e contrato de API.

