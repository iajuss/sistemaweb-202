# ADR 007 — Keycloak é o provedor de identidade da v1

## Contexto

Há dois consumidores com necessidades distintas: pessoas usando a UI e agentes
de AI usando a API. Não há provedor corporativo definido, mas a solução precisa
falar OIDC desde o início e não pode implementar autenticação de senha própria.

## Decisão

Usar Keycloak como provedor OIDC/OAuth 2.0 para a v1, executado no Docker Compose
local e provisionado separadamente na topologia AWS. O fluxo OIDC para humanos
e a validação resource-server de tokens ainda são pendências: a verificação
JWT/JWKS não está implementada neste repositório e produção permanece proibida
até sua validação fail-closed, conforme ADR 021. Keycloak não decide acesso a
carteiras.

O modelo de identidade interna usa `provedor` (issuer do OIDC) + `subject` (`sub`)
como chave estável. E-mail é apenas atributo mutável de perfil, nunca chave
primária. A futura federação com Entra ou Google será configurada no Keycloak e
não exigirá refatoração de identidades no domínio.

## Alternativas descartadas

* **E-mail e senha implementados pela aplicação:** exigiria construir e manter
  hashing, recuperação, proteção contra tentativas e gestão de sessão em um
  sistema que trata dados pessoais de terceiros.
* **Auth.js como provedor de identidade:** é uma biblioteca madura de integração
  de autenticação da aplicação, mas não substitui na v1 o servidor OIDC, a
  gestão de clients e as service accounts necessárias para agentes.

## Consequências

Keycloak adiciona operação e banco próprios, mas torna OIDC, rotação de credencial
de client e federação futuros configuráveis. Fluxos, URLs, secrets e realm serão
configuração de ambiente, não conteúdo do repositório.

