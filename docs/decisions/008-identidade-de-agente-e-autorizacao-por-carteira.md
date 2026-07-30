# ADR 008 — Agentes usam client credentials; autorização de carteira fica no domínio

## Contexto

O principal consumidor é um agente de AI. Ele não pode se passar pelo humano que
o configurou, e o token de autenticação não basta para autorizar consulta de uma
carteira concreta.

## Decisão

Cada agente recebe um client confidencial próprio no Keycloak, com service account
e fluxo OAuth 2.0 `client_credentials`; não haverá API key estática na v1. O
agent recebe escopo técnico mínimo de API e sua credencial é rotacionável ou
revogável no Keycloak. O token tem vida curta; a aplicação valida assinatura,
issuer, audience e expiração.

No domínio, todo pedido chega com um valor `Actor`, humano ou máquina, contendo
tipo, `provedor + subject`, tenant e identificador interno. Uma concessão de
agente para carteira é persistida e avaliada por `AuthorizationPolicy` no núcleo
de domínio a cada operação protegida. Revogar a concessão bloqueia o acesso mesmo
antes de qualquer token de curta duração expirar; desabilitar o client revoga a
possibilidade de obter novos tokens.

Papéis humanos são aditivos e separados: `admin_tenant` administra configuração
e concessões, sem receber automaticamente acesso ao dossiê; `analista_dossie`
acessa dossiê completo e CPF quando a finalidade autorizar; `operador_cobranca`
recebe apenas a recomendação acionável e os dados mínimos de contato; e
`encarregado_lgpd` acessa trilha de auditoria e pedidos de revisão sem acessar a
carteira operacional. A trilha registra sempre o `Actor` efetivo.

## Alternativas descartadas

* **API key compartilhada ou agente agindo como o administrador:** elimina
  responsabilização individual e torna revogação granular impossível.
* **Carteiras como claim definitivo de token:** dificulta revogação imediata e
  não substitui regra de negócio.
* **Autorização dentro do adapter de autenticação:** mistura identidade externa
  com política de domínio e impede testes isolados.

## Consequências

Fixtures cobrirão atores humanos e agentes, concessão/revogação por carteira e
negação antes de qualquer consulta externa. A API não aceitará CPF direto: o
agent só referencia recursos já pertencentes ao tenant e à carteira autorizada.

