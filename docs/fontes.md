# Matriz de fontes

Esta matriz separa fontes públicas e fornecedores mapeados. Nenhuma consulta é
feita fora de uma carteira autorizada. Contratos, credenciais, limites e bases
legais precisam estar confirmados antes de qualquer execução em produção.

| Fonte | Entrega potencial | Caminho de integração | Situação de contrato | Observações |
|---|---|---|---|---|
| CENPROT | Protestos | Não integrado | Não verificado | Não implementar sem contrato, finalidade e limites confirmados. |
| PGFN Dados Abertos | Dívida ativa publicada por conjunto de dados | Integração planejada | Não verificado | Worker com cobertura e parâmetros preservados; universo distinto da Lista PGFN. |
| Lista PGFN | Lista de devedores sob filtros publicados | Importação manual planejada | Não verificado | Scraping é proibido; arquivo e preâmbulo de filtros são evidência de procedência. |
| QSA/RFB | Vínculos societários publicados | Integração planejada | Não verificado | Job mensal seletivo; persistir apenas matches de carteira ativa; peso zero na política. |
| Portal da Transparência (CEIS/CEAF) | Sanções CEIS/CEAF | Integração planejada | Não verificado | Credencial é segredo de deploy; CI usa somente fixtures sintéticas. |
| DataJud | Dados judiciais agregados | Não integrado | Não verificado | Não usar para inferir perfil individual sem base legal e contrato confirmados. |
| Serasa | Dados de bureau | Mapeado, não integrado | Não verificado | Adapter stub documentado; jamais simular como funcional. |
| Boa Vista | Dados de bureau | Mapeado, não integrado | Não verificado | Adapter stub documentado; jamais simular como funcional. |
| Quod | Dados de bureau | Mapeado, não integrado | Não verificado | Adapter stub documentado; jamais simular como funcional. |

Somente PGFN Dados Abertos, Lista PGFN por importação manual, QSA/RFB e
CEIS/CEAF têm caminho de integração planejado nesta fase. Os demais itens são
apenas mapeamentos e não autorizam coleta, simulação de resposta ou contratação.
