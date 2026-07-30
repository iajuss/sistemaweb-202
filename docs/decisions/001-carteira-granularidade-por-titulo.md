# ADR 001 — Carteira tem granularidade por título

## Contexto

Uma pessoa pode ter diversos títulos em aberto. Tratar uma linha importada como
devedor e deduplicar pelo CPF faria desaparecer títulos legítimos e distorceria
o saldo, o aging e a estratégia de cobrança.

## Decisão

Cada linha da carteira representa **um título/dívida**. `id_externo` identifica
esse título e é a chave de idempotência da importação. O devedor é uma projeção
agregada por CPF, nunca a unidade de deduplicação.

A v1 terá upload manual por uma implementação de `WalletImporter`. O parser de
arquivo será plugável para acomodar integração futura sem alterar o domínio.
Ele deve aceitar CSV com BOM, separador e codificação detectados (incluindo
UTF-8 e CP1252) e XLSX. Valores monetários percorrem o sistema como centavos
inteiros ou `Decimal`, jamais como `number`/float.

A importação executa dry-run antes da gravação e registra solicitante, data e
hora, hash do arquivo, linhas aceitas e linhas em quarentena. Uma linha com CPF
inválido ou dado obrigatório ausente vai para quarentena com motivo; ela não
impede as demais linhas nem é descartada silenciosamente.

Os campos operacionais opcionais fornecidos pelo cliente são: histórico de
pagamento/inadimplência, desfecho de contatos anteriores e canais de contato
disponíveis. Dias de atraso é derivado do vencimento. Esses campos servem à
classificação e à executabilidade da abordagem, não à resolução de identidade
contra fontes públicas.

## Alternativas descartadas

* **Uma linha por devedor, deduplicada por CPF:** perde títulos múltiplos e não
  preserva a carteira de origem.
* **Rejeitar integralmente um arquivo com erro:** paralisa a operação por erros
  localizados e dificulta correção rastreável.
* **Aceitar somente CSV UTF-8:** incompatível com exportações brasileiras reais.

## Consequências

Saldo, atraso e histórico serão agregados explicitamente por devedor na camada
de domínio. Reimportar o mesmo `id_externo` será idempotente; mudança material
no título exigirá regra explícita de atualização, auditada no design e na API.

