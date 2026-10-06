# Painel de Turbinas — Ordens de Manutenção

Painel interativo (estilo Power BI) para a base `Base_PowerBI_Ordens_*.xlsx`
(tabelas `fato_*` e `dim_*`). Funciona direto no navegador, sem servidor.

## Como usar

1. Abra `turbinas/index.html` no navegador.
2. Arraste a planilha `.xlsx` para a tela (ou clique em **Escolher planilha**).
   A leitura é feita só no seu navegador — nada é enviado. A última base
   carregada fica lembrada neste navegador; use **Trocar base** para outra.

> Os dados da operação **não** ficam neste repositório (ele é público).

### Versão com dados embutidos (offline)

```bash
npm install xlsx
node turbinas/scripts/gerar-com-dados.js Base_PowerBI_Ordens.xlsx painel-com-dados.html
```

Gera um único HTML com os dados dentro, que abre sem internet. Não publique
esse arquivo em local público.

Para colocar o símbolo da empresa no cabeçalho (e como ícone da aba), passe
uma imagem quadrada (PNG, ~128 px):

```bash
node turbinas/scripts/gerar-com-dados.js Base.xlsx painel.html --logo=simbolo.png --logo-nome="Nome da empresa"
```

A imagem fica só no HTML gerado; não é versionada aqui.

## Páginas

| Página | Conteúdo |
|---|---|
| Visão geral | 4 indicadores, abertas × fechadas, destaques automáticos, turbinas que mais pedem atenção, peças mais trocadas |
| Turbinas | Mapa 5 parques × 20 posições (métrica selecionável) e ranking das 100 turbinas |
| Peças | Peças trocadas identificadas no texto do serviço executado: ranking, turbinas e OMs com a frase de origem |
| Backlog | Envelhecimento, motivos de espera e OMs mais antigas |
| Mão de obra | Hh por mês por categoria e equipe técnica (wrench time) |
| Custos | Custo por mês e por tipo de serviço e OMs de maior custo; custos atípicos (≥ R$ 10 mi) excluídos por padrão |
| Ordens | Tabela com busca, ordenação, paginação e exportação CSV |

**Filtros** (valem para todas as páginas): período, parque, turbina, tipo de
serviço, sistema, status e máquina parada. Clicar numa barra ou num parque
também filtra (cross-filter). Clique numa turbina para abrir o detalhe e numa
OM para ver a ficha completa. O estado fica na URL, então o link pode ser
compartilhado já filtrado. Todo gráfico tem o botão de **visão em tabela**.

## Definições dos indicadores

Seguem as medidas DAX da aba `LEIA-ME`:

- **% Conclusão** = Concluídas ÷ (Total − Canceladas)
- **Backlog** = OMs dos status Abertas, Programadas, Em espera e Apontamentos concluídos
- **Lead time médio (dias)** = média de `Lead_Time_h` ÷ 24
- **Wrench time** = Hh produtivo ÷ Hh apontado (`fato_apontamentos`, categoria *Produtivo*)
- **Entrega no prazo** = No prazo ÷ (No prazo + Atrasada)
- **Período**: OMs pela data de abertura; "fechadas" pela data de fechamento;
  na página Mão de obra, pela data do apontamento.

## Arquivos

- `index.html` — o painel (HTML, CSS e JS sem dependências; SheetJS é baixado do cdnjs só na hora do upload)
- `modelo.js` — converte a planilha no modelo de dados (navegador e Node)
- `scripts/gerar-com-dados.js` — gera a versão com dados embutidos
