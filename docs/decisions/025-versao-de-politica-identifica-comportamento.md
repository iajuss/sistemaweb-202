# ADR 025 — Versão de política identifica comportamento, não intenção

## Contexto

A política de triagem `2026-07-A` recebeu, já com o sistema rodando, duas
correções que não tocaram em nenhum peso, faixa ou limiar declarado:

1. **O delta de regularidade passou a ser alcançável.** O sinal
   `pgfn_regularidade_indiciada_por_delta` chaveava no estado bruto da fonte e
   lia `queryScope.complete`, uma chave que a projeção de produção nunca
   escrevia; além disso o importador fixava o escopo como recorte por constante.
   Em conjunto, o sinal mitigador **não podia disparar em nenhuma execução**.
   Depois da correção ele dispara quando a ausência é conclusão do resolvedor e
   o preâmbulo do export prova escopo íntegro para aquele devedor.
2. **Um sinal mudou de nome na saída publicada.**
   `multiplos_titulos_em_aberto` virou `tres_ou_mais_titulos_em_aberto`, porque
   a regra sempre exigiu três títulos e "múltiplos" se lê como dois ou mais.

A primeira leitura foi manter `2026-07-A`: pesos e faixas não se mexeram, a
correção alinhou a implementação à regra que a política já enunciava, e nenhuma
classificação está armazenada para ser invalidada — elas são computadas na
leitura.

## Decisão

**A versão da política identifica o comportamento que ela produz, não a
intenção de quem a escreveu.** Toda mudança que altere o resultado de alguma
execução possível, ou o nome de qualquer sinal publicado, exige bump de versão —
inclusive quando pesos, faixas e limiares declarados permanecem idênticos.

A política em vigor passa a ser **`2026-07-B`**. `2026-07-A` deixa de existir no
código: não há arquivo, constante nem caminho que produza aquele rótulo. A
versão anterior não é reconstruída, porque código morto que ninguém executa é
outra garantia falsa.

**Nenhum peso, faixa ou limiar declarado mudou no bump.** A tabela de
`2026-07-B` é a mesma de `2026-07-A`:

| sinal | peso | sentido |
|---|---|---|
| `divida_ativa_confirmada` | 0,40 | AGRAVANTE |
| `presenca_na_lista_de_devedores` | 0,25 | AGRAVANTE |
| `valor_elevado_em_aberto` | 0,20 | AGRAVANTE |
| `tres_ou_mais_titulos_em_aberto` | 0,15 | AGRAVANTE |
| `pgfn_regularidade_indiciada_por_delta` | −0,30 | MITIGADOR |
| `vinculo_societario_qsa_contextual` | 0,00 | CONTEXTUAL |

Faixas inalteradas: `COBRANCA_INTENSIVA` ≥ 0,70, `COBRANCA_PADRAO` ≥ 0,30,
abaixo disso `MONITORAMENTO`. `minimoDeTitulos` = 3, `valorElevadoCentavos` =
5.000.000. Um teste afirma essa tabela item a item, para que a frase "os pesos
não se mexeram" seja verificável e não apenas escrita aqui.

**O bump aconteceu mesmo assim** porque duas execuções rotuladas `2026-07-A` —
uma antes e uma depois da correção — devolveriam categorias diferentes para o
mesmo dossiê, e nomes de sinal diferentes na explicação. Um rótulo que não
distingue esses dois comportamentos promete reprodutibilidade que não existe, e
é exatamente a classe de garantia falsa que este projeto removeu em todo lugar:
a regra de lint que não protege nada (M-1), a guarda que nenhum teste derruba
(I-4), o invariante que a execução desobedece sessão após sessão.

O argumento "nenhuma classificação está armazenada" não salva o rótulo. A
versão viaja no contrato de saída, no `classification_id` e na projeção para
prompt; o consumidor é um agente de AI, que pode ter registrado a resposta
anterior do lado dele. Reprodutibilidade é propriedade do rótulo publicado, não
do nosso armazenamento.

## Alternativas descartadas

* **Manter `2026-07-A` porque pesos e faixas não mudaram.** Trata a versão como
  declaração de intenção. Quem consome o contrato lê comportamento.
* **Bump apenas do sinal renomeado, mantendo a versão.** O nome do sinal é a
  unidade pela qual uma pessoa exerce o direito de revisão de decisão
  automatizada; mudá-lo é mudar a explicação publicada.
* **Guardar `2026-07-A` como política histórica reexecutável.** Exigiria
  reconstruir o comportamento defeituoso — o delta inalcançável e a chave de
  escopo morta — em código que nada exercita. ADR 016 pede que versões antigas
  sejam **comparáveis**, e comparar contra um defeito reconstruído não informa
  nada.
* **`2026-08-A`.** A política não mudou de mês nem de desenho; o sufixo de letra
  existe para revisão dentro do mesmo desenho.

## Consequências

`POLICY_2026_07_B` substitui `POLICY_2026_07_A` em todos os pontos de composição
(demo, roteador HTTP, `lookup-dossier`), e o arquivo passa a ser
`packages/domain/src/policy/policy-2026-07-b.ts`. Os dois goldens de prompt
acompanham o novo rótulo; `plano de fontes` e `versão do resolvedor` continuam
em `2026-07-A`, porque são versões independentes que apenas coincidiam de
etiqueta e nenhuma das duas mudou de comportamento.

`comparePolicies` (ADR 016) continua sendo o caminho para avaliar uma política
nova sobre dossiês antigos sem alterar classificação alguma. O que este ADR
acrescenta é o gatilho: **quando o bump é obrigatório**, e não como comparar.
