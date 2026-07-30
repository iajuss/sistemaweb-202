# ADR 015 — Lista de Devedores PGFN não será automatizada por scraping

## Contexto

A Lista permite a pessoas consultar CPF/CNPJ no formulário web e exportar um
resultado manual. Essa consulta poderia ser mais precisa que casamento de nome,
mas não há contrato ou API oficial de automação verificados para o projeto.

## Decisão

Não automatizar o formulário, navegador ou endpoints subjacentes da Lista de
Devedores. A consulta pontual permanece ação manual de operador autorizado, que
registra ator, momento, filtros, escopo e artefato importado na trilha de
auditoria. O artefato é processado pela fonte manual separada e obedece retenção
e criptografia aplicáveis.

## Base documental

Em 2026-07-29, a documentação oficial acessível descreve a Lista como serviço
web, consulta por CPF/CNPJ e exportação manual de até 50.000 resultados, mas não
foi localizado termo de uso ou contrato público que autorize automação. Este
estado é **não verificado**; não será inferida permissão de scraping a partir do
acesso público. Se a PGFN fornecer contrato/API de automação, esta decisão deve
ser revista por ADR.

## Alternativas descartadas

* **Automatizar a UI pública:** depende de comportamento não contratado e pode
  violar limites/termos ainda não verificados.
* **Tratar consulta manual como API:** oculta a procedência e induz repetição
  automatizada indevida.

## Consequências

O sistema mantém ingestão em lote para Dados Abertos e import manual auditável
para Lista. Nenhum teste, job ou processo web acessa a Lista pela rede.

