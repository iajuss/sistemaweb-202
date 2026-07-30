# ADR 004 — Observações reutilizáveis, dossiês imutáveis e classificação versionada

## Contexto

O dossiê precisa ser auditável, reproduzível e revisável sob a LGPD, sem
reconsultar a fonte para explicar uma decisão passada. Ao mesmo tempo, novas
consultas não devem repetir chamadas enquanto a observação ainda estiver válida.

## Decisão

O sistema terá três camadas independentes:

1. **Observação:** fato imutável retornado por uma fonte, incluindo parâmetros
   de consulta, status, timestamp, latência e evidência de identidade. É a
   unidade reutilizada pela política de cache.
2. **Dossiê:** composição imutável de observações em um instante, com a
   resolução de identidade. Sua data é a data da composição; cada campo mantém
   a própria data de coleta.
3. **Classificação:** função de dossiê × versão declarativa das regras, com
   sinais, pesos, fontes e explicação humana preservados no resultado.

Cache não terá store paralelo: uma observação elegível é reutilizada conforme
TTL configurável por fonte — PGFN: 7 dias com detecção de nova publicação
trimestral; QSA/RFB: 30 dias; CEIS/CEAF: 24 horas. Campo vencido provoca nova
observação e nova composição sob demanda. Snapshot anterior jamais é alterado;
correção é feita por supersessão com referência ao antecedente e motivo de
revisão.

Imutabilidade não impede direitos do titular. Retenção, expurgo e crypto-
shredding/redação por titular serão definidos no desenho LGPD e aplicados aos
dados pessoais, preservando apenas o mínimo necessário da evidência de auditoria.

## Alternativas descartadas

* **Entidade mutável com histórico por campo:** torna a reconstrução exata de
  uma decisão dependente de lógica de replay e aumenta o risco de alteração
  indevida.
* **Cache externo separado do registro de observação:** cria duas verdades e
  enfraquece a procedência.
* **Atualizar snapshots antigos ao refrescar fontes:** viola rastreabilidade e
  direito de revisão.

## Consequências

Cada resposta para UI/API aponta para versões concretas de dossiê e regras.
Expirações não significam ausência de dado: `NAO_CONSULTADO`,
`NAO_ENCONTRADO` e `ERRO_NA_FONTE` continuam estados distintos nas observações.

