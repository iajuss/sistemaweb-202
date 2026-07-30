# ADR 013 — Credencial do Portal da Transparência é segredo de ambiente

## Contexto

A API do Portal da Transparência exige credencial de acesso. Desenvolvimento e
CI precisam ser determinísticos e não podem depender de rede, e segredos não
podem estar no repositório, fixtures ou logs.

## Decisão

A chave será fornecida somente na configuração de deploy, em segredo de ambiente
gerenciado por AWS Secrets Manager. O adapter a recebe por configuração de
infraestrutura e nunca a serializa. Desenvolvimento e CI usam fixtures sintéticas
offline; ausência de credencial é estado de configuração explícito, não dado
ausente sobre o devedor.

## Alternativas descartadas

* **Guardar chave em repositório ou `.env` versionado:** expõe credencial.
* **Chamar API real em testes:** torna a suíte não determinística e consome quota.

## Consequências

O deploy só habilita CEIS/CEAF após o segredo ser provisionado. Telemetria do
adapter registra status e latência, nunca chave, CPF ou payload pessoal.

