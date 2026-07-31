# ADR 024 — UI servida pelo mesmo roteador, sem framework, com a audiência derivada da concessão

## Contexto

A entrega precisa de duas telas: fila de prioridades da carteira e dossiê com
sinais nomeados e explicação. O plano original previa route handlers do Next.js,
mas o Next nunca foi instalado — `apps/web` era stub — e a Task 11 já resolveu a
superfície HTTP com handlers puros sobre `node:http`, por decisão registrada de
não adicionar dependência nova com o defeito E-1 em aberto.

Três perguntas ficaram sem ADR: onde a UI mora, **qual visão cada pessoa vê**, e
como um navegador se autentica num sistema em que toda rota exige `Authorization`
e cujo login real está bloqueado até o JWT/JWKS do ADR 021.

## Decisão

**A UI é renderizada no servidor pelo mesmo roteador da API.** `views.ts`
produz strings de HTML a partir dos mesmos serviços; nenhuma dependência nova,
nenhum bundle de cliente, nenhum framework. Duas rotas:
`GET /carteiras/:walletId/prioridades` e
`GET /carteiras/:walletId/dossies/:dossierId`.

**A audiência da visão é função da ação autorizada, nunca do que a requisição
diz sobre si.** `READ_ACTIONABLE` rende a visão de `OPERADOR_COBRANCA`;
`READ_DOSSIER` rende a de `ANALISTA_DOSSIE`; `READ_AUDIT`, a de
`ENCARREGADO_LGPD`. A página do dossiê autoriza `READ_ACTIONABLE` como piso — o
operador precisa abrir o dossiê que vai trabalhar — e consulta o mesmo caminho
de autorização para saber se aquela concessão também alcança `READ_DOSSIER`.
Papel escolhido por query string seria escalonamento de privilégio com barra de
endereço.

**A tela não decifra CPF.** `findInWallet` decifra e por isso exige
`READ_DOSSIER`; a tela usa `findNameInWallet`, que lê o nome dos próprios
títulos da carteira sob `READ_ACTIONABLE` e não toca a linha do devedor. Página
não vaza documento que nunca recebeu — isso é estrutura, e vale mais que
varredura.

**No navegador, a credencial vem por HTTP Basic**, e só na raiz de composição da
demonstração. O roteador continua chamando `deps.authenticate(request)`, fixado
na construção e inalcançável pela requisição (defeito I-3); o que muda é que
uma resposta 401 de página acompanha `WWW-Authenticate`, de modo que o próprio
navegador peça a credencial e a mande no mesmo cabeçalho que a API já usa. Fora
de `NODE_ENV=development` nenhum principal é emitido, então isso não autentica
ninguém em produção (ADR 021).

**White label é total e sem padrão.** Nome do produto, marca e cores vêm da
linha do tenant. Não existe valor de fallback: tenant sem tema configurado
recebe 500 `TEMA_NAO_CONFIGURADO`. Um padrão seria a marca de quem
desenvolveu com outro nome.

## Alternativas descartadas

* **Instalar o Next.js agora:** dependência nova, com o defeito E-1 conhecido,
  para a camada que o próprio enunciado trata como entrega e não como produto.
  Os handlers continuam envolvíveis pelo Next depois, sem reescrita.
* **Sessão com cookie:** exige emissão, expiração e rotação de sessão — um
  sistema de autenticação de verdade, que é exatamente o que o ADR 021 bloqueia
  até o JWT/JWKS entrar. Basic reaproveita o cabeçalho que já existe.
* **Credencial na URL:** põe segredo em log de acesso e cache de proxy.
* **Papel vindo da requisição:** escalonamento de privilégio disfarçado de
  parâmetro.
* **Tema padrão embutido:** branding da desenvolvedora com passos extras.

## Consequências

A UI só existe onde a API existe, e cai junto. Trocar Basic por OIDC de verdade
é mudança na raiz de composição, não no roteador. Quando o login humano nascer,
o mapa de audiência por ação continua valendo, porque o papel humano já
determina quais ações a pessoa detém — as duas leituras concordam por
construção. A pendência I-2 segue aberta e intocada: ator `HUMAN` é autorizado
por papel e alcança toda carteira do tenant.
