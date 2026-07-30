# ADR 006 — Docker Compose local e AWS para produção

## Contexto

O sistema precisa rodar localmente com um comando, mas também precisa de
criptografia operacional de CPF, PostgreSQL gerenciado e gestão de segredos
compatível com uma aplicação multi-tenant.

## Decisão

O ambiente de desenvolvimento/local será Docker Compose. A produção usará
container Next.js em AWS ECS/Fargate, PostgreSQL no RDS e segredos/chaves em AWS
Secrets Manager e KMS. O código usará interfaces para segredo e criptografia;
nenhuma chave estará em arquivo de configuração, código, log ou fixture.

Conta, região, rede, domínio, e-mail transacional, backups e política concreta de
KMS permanecem pendentes de configuração do cliente e não serão inventados no
scaffold.

## Alternativas descartadas

* **Executar produção apenas com Docker Compose:** não oferece operação gerenciada
  nem fronteira adequada para segredos e banco.
* **Armazenar chaves em variáveis ou arquivos sem KMS:** fragiliza rotação e
  auditoria de acesso.

## Consequências

O README terá instruções reproduzíveis para o ambiente local. Provisionamento de
AWS e configuração de autenticação/identidade serão documentados como variáveis
de ambiente e infraestrutura, sem credenciais no repositório.

