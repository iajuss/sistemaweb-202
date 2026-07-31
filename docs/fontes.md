# Matriz de fontes

O que cada fonte entrega, como se chega nela, quanto custa, sob qual base legal
e se está integrada ou apenas mapeada.

Duas regras atravessam a matriz inteira. **Nenhuma consulta acontece fora de uma
carteira autorizada** — não existe consulta aberta por CPF. E **nada aqui é
tratado como contrato verificado**: a coluna "verificado" diz o que foi conferido
contra arquivo ou documentação real e o que ainda é leitura de página pública.
Custo, limite de uso e base legal precisam de confirmação do cliente antes de
qualquer execução em produção.

## Situação de integração

| Fonte | Situação nesta v1 |
|---|---|
| PGFN Dados Abertos | **Integrada** |
| PGFN Lista de Devedores | **Integrada por upload manual** (ADR 015: jamais raspada) |
| QSA/RFB | Mapeada, não integrada |
| Portal da Transparência (CEIS/CEAF) | Mapeada, não integrada |
| Serasa, Boa Vista, Quod | Mapeadas, não integradas |
| CENPROT, DataJud | Mapeadas, não integradas |

Reduzir a uma fonte pública integrada foi decisão de prazo, e o enunciado
autoriza fonte mapeada e não integrada. Adapter de fonte não integrada é stub
documentado e **jamais simulado como funcional**.

## O que cada fonte entrega

| Fonte | Entrega | Método de acesso | Custo | Verificado |
|---|---|---|---|---|
| PGFN Dados Abertos | Inscrições em dívida ativa da União por conjunto de dados: número da inscrição, nome, CPF mascarado nas posições 4–9, valor consolidado, situação e tipo de situação da inscrição, UF | Download de arquivos CSV publicados, sem credencial | Gratuito — dado aberto publicado sob a LAI e o Decreto 8.777/2016 | Layout de colunas **não verificado** contra arquivo real (F-3). Layout inesperado falha alto com `LAYOUT_PGFN_INVALIDO` |
| PGFN Lista de Devedores | Devedores sob os filtros que o operador escolheu: CPF/CNPJ mascarado, nome, nome fantasia, `Valor Total` e `Valor da Dívida Selecionada` | **Upload manual** do XLSX exportado pelo operador. Raspagem proibida em qualquer hipótese (ADR 015) | Gratuito — consulta pública no portal | **Verificado contra export real**: preâmbulo de filtros, 91 linhas, divergência entre os dois valores em 31 delas, precisão excedente em 17 |
| QSA/RFB | Quadro societário publicado: nome do sócio, CPF mascarado, empresa, qualificação | Dados abertos da Receita, carga mensal seletiva (ADR 011) | Gratuito — dado aberto | Não verificado |
| Portal da Transparência (CEIS/CEAF) | Sanções administrativas: CEIS (empresas inidôneas e suspensas) e CEAF (expulsões da administração federal) | API pública com credencial de cadastro (ADR 013: a credencial é segredo de deploy, nunca vai ao repositório) | Gratuito com cadastro, sujeito a limite de requisições | Não verificado |
| Serasa | Score, negativações, protestos, participações societárias | API comercial sob contrato | **Pago**, preço por consulta ou por pacote | Não verificado — sem contrato |
| Boa Vista | Score, negativações, consultas anteriores | API comercial sob contrato | **Pago** | Não verificado — sem contrato |
| Quod | Score positivo, histórico de pagamento | API comercial sob contrato | **Pago** | Não verificado — sem contrato |
| CENPROT | Protestos em cartório por CPF/CNPJ | Consulta no portal ou convênio | **Pago** por certidão | Não verificado |
| DataJud | Metadados processuais agregados do CNJ | API pública com chave publicada | Gratuito | Não verificado. Não usar para inferir perfil individual sem base legal e contrato confirmados |

## Base legal por fonte

Detalhamento, finalidade e prazos em [`lgpd.md`](lgpd.md). Resumo:

| Fonte | Hipótese legal pretendida | Âncora |
|---|---|---|
| Carteira do cliente | Execução de contrato entre o cliente e o devedor, tratada por nós na condição de operador | LGPD art. 7º, V |
| PGFN Dados Abertos | Dado público por lei, com legítimo interesse na cobrança de dívida própria do cliente | CTN art. 198, § 3º, II (débitos inscritos não são cobertos por sigilo); LGPD art. 7º, IX |
| PGFN Lista de Devedores | Idem, com a ressalva de que a lista é recorte sob filtros e nunca universo | CTN art. 198, § 3º, II; LGPD art. 7º, IX |
| QSA/RFB | Dado público de registro empresarial; **registro de não-cliente não é persistido, indexado, logado nem intermediado em arquivo** | LGPD art. 7º, IX |
| Portal da Transparência | Publicidade obrigatória de sanção administrativa | Lei 12.846/2013 e LAI; LGPD art. 7º, IX |
| Bureaus (Serasa, Boa Vista, Quod) | Não aplicável nesta v1 | Exigiria contrato, avaliação de legítimo interesse própria e nova entrada aqui |

**Nenhuma dessas hipóteses está juridicamente validada.** São premissas técnicas
que o jurídico ou DPO do cliente precisa confirmar antes de produção.

## O que está proibido

- **Base vazada.** Serviços de "consulta CPF completa" de Telegram e similares
  estão proibidos. Endpoint com essa cara é recusado, não avaliado.
- **Raspagem da Lista de Devedores da PGFN**, em qualquer hipótese (ADR 015).
- **Fusão dos dois universos da PGFN.** Dados Abertos e Lista são universos
  distintos: ausência na Lista não é ausência de dívida (ADR 014).
- **Simular fonte não integrada como funcional.** Stub documentado é stub.
- **Acrescentar fonte** sem decisão explícita registrada em ADR.
