# ADR 026 — Guarda inalcançável sai; o invariante que a torna inalcançável fica

## Contexto

O defeito **I-4** cobrava que toda guarda de runtime tivesse um teste que
falhasse quando ela fosse removida. Cinco guardas e um pós-filtro ganharam esse
teste em 2026-07-31. Sobraram duas, e por um motivo diferente do das outras:

| Guarda | Onde estava |
|---|---|
| `OPERATION_CONTEXT_IDENTITY_MISMATCH` | `packages/adapters/src/repositories/tenant-repository.ts` |
| `AUTHORIZED_WALLET_CONTEXT_REQUIRED` | `packages/application/src/authorize-actor.ts` |

**As duas eram vazias por construção.** Nenhuma entrada que um chamador
consiga montar faz qualquer uma disparar:

- `OPERATION_CONTEXT_IDENTITY_MISMATCH` comparava `operation.context.actor` com
  `operation.identity.actor`. Existe **um único** emissor de
  `AuthorizedOperation` — `issueAuthorizedOperation` —, que monta a operação com
  a `identity` recebida e com `createTenantContext(identity.actor)`: **a mesma
  referência dos dois lados**. Objetos não emitidos por ele já morrem antes, na
  barreira do `WeakSet` (`AUTHORIZED_OPERATION_REQUIRED`, essa sim com teste de
  remoção).
- `AUTHORIZED_WALLET_CONTEXT_REQUIRED` era lançada por uma função privada de
  módulo, com um único chamador, sobre um contexto criado na linha imediatamente
  acima. O único produtor de `AuthorizedWalletContext` recebe uma **identidade**,
  nunca um contexto, e nenhuma função exportada do módulo aceita um.

Escrever um "teste" para uma condição que o código não consegue produzir — por
exemplo forjando um objeto com o mesmo formato — seria fabricar a prova: a
chamada morreria numa guarda anterior e o teste passaria pelo motivo errado.
Verde por acidente é o defeito que o ADR 019 existe para evitar.

## Decisão

**As duas guardas saem. O que fica é a asserção do invariante que as tornava
inalcançáveis.**

Código morto também é garantia falsa: uma guarda que nenhum teste derruba se lê,
para quem revisa, como proteção conferida, quando na verdade nunca foi exercida
uma única vez. É a mesma classe de defeito da regra de lint sem alvo (M-1) e do
rótulo de política que não distingue comportamentos (ADR 025).

No lugar delas, `authorize-actor.test.ts` afirma o invariante, em seis testes:

| O que é afirmado | Como |
|---|---|
| Existe **um único** ponto de construção de `AuthorizedOperation` | leitura do fonte |
| Existe **um único** ponto de registro no `WeakSet` de emitidos | leitura do fonte |
| O contexto é derivado da identidade que a operação carrega | leitura do fonte |
| Toda operação emitida tem `context.actor` **idêntico** (`===`) a `identity.actor` | comportamento, nas quatro ações |
| Todo `AuthorizedWalletContext` é construído a partir da identidade do chamador | leitura do fonte |
| **Nenhuma função exportada** aceita um `AuthorizedWalletContext` | leitura do fonte |

É o mesmo desenho do teste arquitetural que enumera os repositórios da camada de
adapters: um invariante que uma classe nova herda por ser acrescentada à lista.
Aqui, quem acrescentar um segundo emissor derruba o teste — e o recado do teste
que quebra é **"a guarda voltou a ser necessária"**, não "ajuste a contagem".

Cada mutação foi executada e derruba exatamente o teste que a nomeia:

| Mutação aplicada ao fonte | Teste que cai |
|---|---|
| um segundo `new RuntimeAuthorizedOperation(...)` | *constructs an authorized operation in exactly one place* |
| contexto montado de uma **cópia** do ator (`{ ...identity.actor }`) | *issues operations whose context and identity are the same actor* |
| uma função exportada recebendo `AuthorizedWalletContext` | *lets no wallet context in through an exported function* |

A distinção que a última linha registra: funções **privadas** do módulo passam o
contexto adiante — `actorWithRuntimeGrant` recebe um —, e isso é seguro
exatamente enquanto nenhum contexto puder entrar de fora. O limite é a fronteira
exportada, não a passagem interna.

## Alternativas descartadas

* **Manter as guardas sem teste.** É o defeito que o I-4 nomeia. Uma proteção
  que ninguém conseguiu exercitar não é proteção conferida.
* **Escrever um teste forjando a entrada.** A chamada morre numa guarda
  anterior; o teste passaria sem nunca alcançar a condição, e provaria o
  contrário do que afirma.
* **Mudar a fronteira para que a guarda passe a ser alcançável** — aceitar
  operação ou contexto vindos de fora e então validá-los. Alcançabilidade se
  compraria abrindo a porta que hoje não existe. Emissor único é propriedade
  mais forte que validação na entrada.
* **Anotar o I-4 como aceito e seguir.** Deixa duas guardas vazias no código de
  autorização, que é onde uma garantia falsa custa mais caro.

## Consequências

**I-4 fecha.** Nenhuma guarda de runtime permanece sem teste que a derrube: as
que podem ser alcançadas têm teste de remoção, e as duas que não podiam foram
removidas com o invariante que as substituía afirmado no lugar.

O que passa a ser exigido de quem mexer em `authorize-actor.ts`: emitir
`AuthorizedOperation` de um lugar só, e derivar contexto e identidade da mesma
referência. Se o desenho precisar mudar, o teste que quebra é o aviso de que
`OPERATION_CONTEXT_IDENTITY_MISMATCH` volta a fazer sentido — e aí ela volta com
um teste de remoção, como as outras cinco.

O `WeakSet` de contextos de carteira (`authorizedWalletContexts`) e o
`assertPrivateState()` daquela classe saíram junto: sem a guarda, ninguém os
lia, e um registro que nada consulta é a mesma garantia falsa em outra forma.
