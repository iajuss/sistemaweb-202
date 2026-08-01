# Próximos passos

Este documento liga o que a v1 entrega ao que o cliente descreveu como direção
de produto. Não é backlog comprometido: é o mapa de como o que existe hoje
sustenta o que vem depois, e o que precisaria ser construído em cada caso.

Para o que a v1 deliberadamente não faz, veja
[`limitacoes-v1.md`](limitacoes-v1.md).

## O que a v1 é, em uma frase

A **camada de decisão**: dado um devedor da carteira do cliente, o sistema
monta um dossiê com procedência por campo, resolve se cada registro público é
mesmo daquela pessoa, e devolve uma recomendação explicada de como cobrar —
categoria, prioridade na fila e estratégia de abordagem.

A camada conversacional não faz parte deste escopo. O endpoint
`GET /api/v1/dossies/{id}/prompt` existe precisamente para alimentá-la: entrega
o dossiê como texto estável e versionado, com cobertura, procedência e
incertezas explicitadas, pronto para entrar em prompt de um agente de cobrança.

## O primeiro item, porque já está desenhado: projeção persistida de classificação

Não é ideia de produto, é dívida técnica com desenho pronto e motivo datado.

A fila de prioridades lê **quem está na carteira** do PostgreSQL, e a
classificação de quem já tem dossiê composto. Como não existe tabela de dossiê
nem de classificação, essa segunda metade vem dos snapshots que vivem no
processo — então um reinício apaga as classificações e todo mundo volta a
aparecer como "sem dossiê composto" até ser consultado de novo.

O fim de linha correto é uma **tabela de projeção por tenant** — `dossierId`,
`debtorId`, categoria, prioridade operacional, pontuação e `composedAt` —
escrita quando um dossiê é composto e lida com `READ_ACTIONABLE`. Isso dá à fila
uma leitura só no banco, com paginação empurrada para o SQL, e sobrevivência a
reinício.

O que ela exige, e que foi o motivo de ficar para depois: migração, política de
RLS ([ADR 020](decisions/020-isolamento-tenant-por-repositorio-e-rls.md)),
repositório com o padrão de autoridade e fábrica, inscrição no teste
arquitetural que enumera repositórios, e teste de integração de isolamento entre
tenants. Foi decisão consciente não fazer isso na véspera da entrega, no
subsistema onde um erro custa mais caro. Raciocínio completo no
[ADR 027](decisions/027-fila-lida-da-carteira-e-projecao-de-classificacao-adiada.md).

**O que não muda quando ela existir:** um devedor que ninguém consultou continua
aparecendo na fila como `DADOS_INSUFICIENTES`, e continua distinguível de um
dossiê que voltou vazio. Persistir a projeção resolve durabilidade e
desempenho — não a distinção, que é de desenho.

## Do triagem por regras ao score de propensão

A v1 **não** estima probabilidade de pagamento, e isso é decisão registrada no
[ADR 016](decisions/016-politica-de-triagem-regras-e-aprendizado-futuro.md): sem
desfechos observados não há como validar predição alguma, e um campo chamado
"70% de chance de recuperação" prometeria uma probabilidade que não existe. O
que a v1 faz é ordenar esforço com regras nomeadas, auditáveis e explicáveis.

O caminho até o score preditivo já está preparado:

- **`ObservedOutcome` é append-only e ligado à classificação que o originou.**
  Toda recomendação emitida guarda versão da política, categoria, sinais que
  pesaram e um campo de desfecho a ser preenchido depois — contato feito,
  resposta, pagamento, parcelamento, silêncio.
- **Dossiê e classificação são camadas separadas**, então uma política nova
  pode ser reexecutada sobre dossiês antigos e ter o resultado comparado com o
  da política anterior. É assim que se mede se um ajuste melhorou ou piorou a
  carteira.
- **A política é versionada e declarativa**, com pesos em configuração. Trocar
  regra por modelo ajustado não exige reescrever o motor: exige uma nova
  implementação da mesma porta, com nova versão.

O que falta para o score existir não é engenharia, é **dado rotulado**. Uma
carteira com desfechos registrados ao longo de alguns meses é o insumo mínimo.
Sem o registro que a v1 já faz, esse insumo nunca seria acumulado.

## Enriquecimento e validação de contato

O cliente aponta que cerca de 60% dos contatos morrem no primeiro passo. Isso
torna dado de contato a próxima fonte prioritária — e ela é de natureza
diferente das atuais: não é fonte pública, é dado fornecido pelo cliente ou
obtido por consentimento.

O que a v1 já sustenta:

- O importador tem **uma declaração única de colunas**
  (`wallet-importers/columns.ts`), com um campo `required` por coluna, usada
  pelos dois parsers e pela tela. Hoje as cinco colunas são obrigatórias e
  **nenhum canal de contato é aceito** — acrescentar um é acrescentar uma linha
  ali, e a tela e o arquivo de exemplo acompanham sozinhos. O que ainda não
  existe é a consequência: a recomendação de abordagem não olha para contato, e
  sugerir ligação humana para quem não tem telefone é recomendação
  inexecutável.
- O envelope de campo carrega fonte, data de coleta e confiança, então contato
  verificado e contato não verificado são distinguíveis por construção.
- A resolução de identidade impede o modo de falha mais caro desse
  enriquecimento: atribuir a alguém o telefone de um homônimo. Quando o vínculo
  não é confirmado, o sistema se abstém em vez de escolher o melhor palpite.

O que precisaria ser construído: um adapter de validação de contato, com a
mesma disciplina de estado (`ENCONTRADO`, `NAO_ENCONTRADO`, `NAO_CONSULTADO`,
`ERRO_NA_FONTE`) e base legal documentada em [`lgpd.md`](lgpd.md) antes de
qualquer integração.

## Budget por devedor

A saída da v1 é categoria, prioridade operacional e estratégia. O passo
seguinte — quanto vale gastar em cada devedor — é uma função de três coisas,
das quais o sistema já produz duas: a recomendação e o valor em aberto vindo da
carteira. A terceira é o custo por canal, que é parâmetro operacional do
cliente e não do motor.

Isso caberia como uma camada declarativa sobre a classificação, versionada da
mesma forma, sem tocar no dossiê. A decisão de mantê-la fora da v1 é de escopo:
sem desfechos observados, qualquer curva de retorno seria arbitrária.

## Camada judicial

Fora do escopo atual e de natureza distinta: exige fontes processuais
(DataJud), critérios de exequibilidade e integração com escritório de
advocacia. O dossiê versionado e explicável é a base natural para isso — a
síntese que um advogado receberia é uma projeção a mais sobre o mesmo snapshot,
como já é a projeção para prompt.

Vale registrar que a explicabilidade exigida pela LGPD para revisão de decisão
automatizada é a mesma propriedade que torna um caso apresentável a um
advogado: sinais nomeados, com peso, fonte e data.

## O que não muda

Três decisões devem sobreviver a qualquer evolução acima, porque protegem o
cliente antes de protegerem o sistema:

- **Consulta só sobre devedor presente em carteira importada.** Consulta aberta
  sobre qualquer pessoa não existe no desenho, e não deve passar a existir.
- **Match de baixa confiança nunca é apresentado como fato.** Um score
  preditivo não dispensa isso: alimentar modelo com vínculo não confirmado
  propaga o erro em escala, em vez de corrigi-lo.
- **Toda decisão automatizada permanece explicável.** É requisito legal, não
  recurso — e um modelo estatístico não elimina a obrigação, apenas torna
  cumpri-la mais difícil.