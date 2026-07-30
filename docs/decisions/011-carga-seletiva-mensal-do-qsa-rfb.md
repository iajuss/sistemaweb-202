# ADR 011 — QSA/RFB é carregado seletivamente em job mensal

## Contexto

Não existe endpoint oficial verificado de CPF → empresas. Os arquivos da RFB são
particionados por tipo; o CPF de sócio pessoa física é mascarado, portanto não
permite join por igualdade. Persistir ou indexar dados de não-clientes viola a
finalidade de consulta restrita à carteira.

## Decisão

O QSA/RFB roda em worker/container separado, nunca no processo web. Em cada ciclo
mensal ele baixa e processa em streaming somente `Socios*.zip`; `Empresas*.zip`
é opcional e só entra se houver finalidade posterior aprovada para razão social.
O parser lê as partes ZIP sem cabeçalho, com separador `;` e codificação
Latin-1/CP1252, usando o layout oficial posicional fixado para a versão. Divergir
na contagem de colunas faz o job falhar alto.

Registros percorrem a memória uma única vez. Somente um candidato pertencente a
carteira ativa chega ao módulo compartilhado de resolução de identidade, que
combina fragmento da máscara de CPF e ranking de nome. Não existe matcher de ETL
separado. Registro não-cliente não é persistido — nem em tabela temporária,
índice, log ou arquivo intermediário.

O bruto é descartado ao fim da execução. O manifesto persistido contém apenas
versão e data de referência do dataset, partes processadas, checksums, contagem
de linhas e resultado do job. A observação QSA usa a data de referência do
dataset como `coletado_em`; o instante de execução fica somente no manifesto,
para tornar explícita a defasagem de publicação.

Carteira incluída após a carga recebe `NAO_CONSULTADO` para QSA até o ciclo
seguinte. Um executor autorizado pode solicitar nova execução manual; não há
extrato retido ou reprocessamento sob demanda.

## Alternativas descartadas

* **Baixar o dump nacional completo:** excede a necessidade de `Socios*.zip`.
* **Consulta online simulada:** não existe contrato de API verificado.
* **Join por CPF ou matcher próprio no ETL:** ignora máscara e viola a fronteira
  única de resolução de identidade.
* **Persistir registros não correspondentes para acelerar refresh:** amplia
  indevidamente o tratamento de dados pessoais.

## Consequências

QSA mantém frescor mensal e falha explícita, que nunca se converte em ausência de
vínculo societário. CI e testes usam fixture sintética pequena, no mesmo layout,
incluindo máscara compatível com nome divergente que deve ser rejeitada; nenhum
teste baixa a publicação real.

