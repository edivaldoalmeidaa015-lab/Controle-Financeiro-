# Painel de Turbinas — Ordens de Manutenção

Painel interativo (estilo Power BI) para as ordens de manutenção dos
aerogeradores. Funciona direto no navegador, sem servidor, e aceita dois
formatos de planilha:

- a **exportação de ordens de manutenção do Manusis 4**, como sai do sistema
  (aba "Ordens de manutenção" + "Especialidades"; `.xlsx` ou o `.zip` baixado).
  Turbina, parque e complexo vêm do campo Ativo/Localização; vários complexos
  (ex.: Asa Branca e Chapada do Piauí) ganham o filtro **Complexo**;
- a base `Base_PowerBI_Ordens_*.xlsx` (tabelas `fato_*` e `dim_*`).

Opcional, junto com a exportação de OMs do Manusis: o **consumo de materiais**
do Manusis 4 (aba "Consumo de materiais", do mesmo período). Cada baixa se liga
à OM pelo número e o painel passa a mostrar:

- o material baixado em cada OM (código, quantidade e valor) e o selo
  "troca confirmada", "confirmada só em parte", "difere da baixa", "troca descrita sem baixa"
  ou "peça baixada sem troca no texto", com a conferência peça a peça na ficha;
- o quadro **Pendências de controle** (página Peças): nas OMs fechadas, cada peça descrita
  como trocada sem baixa e cada peça baixada sem a troca descrita, por técnico (autor do
  registro no serviço executado) e por turbina, com exportação em CSV. Parafuso, porca e
  óleo baixados não contam como peça sem descrição;
- o custo de material pela soma das baixas;
- as baixas com preço unitário fora do padrão (ex.: óleo cadastrado por litro
  com o preço do tambor), que ficam fora dos totais até o cadastro ser corrigido.

Também opcional: as **pendências** do Manusis 4 (aba "Pendências", abertas e fechadas; pode ser
um período maior que o das OMs, ex.: 2 anos). A aba **Pendências** usa só esse arquivo, no estilo
Power BI: filtros de data de abertura, status (Aberta, Em andamento, Fechada, Cancelada) e descrição;
cartões; rosca de status; idade das abertas; as pendências que mais se repetem; barras por turbina,
quem abriu e parque divididas por status; fechadas por mês; lista com CSV. Tocar em qualquer visual
filtra a página inteira.

A aba também cruza cada pendência com a **OM** de origem e de execução (nunca com o consumo de
material): status da OM de execução e pontos de controle — fechada com a OM ainda aberta, fechada
mas o serviço executado da OM não cita o item, cancelada junto com a OM (com o motivo, ex.:
Duplicidade) ou sem OM, pronta para fechar (OM com apontamentos concluídos), talvez já resolvida
por outra OM da mesma turbina que diz no texto que trocou a mesma peça.

Na ficha da OM aparecem, numa linha cada, as pendências abertas ou executadas nela.

Carregue as planilhas juntas, ou o consumo e as pendências depois da base de OMs; ao
atualizar só as OMs, o consumo e as pendências já carregados continuam ligados. Também vale uma planilha única com as abas
de ordens, consumo e pendências: `node turbinas/scripts/juntar-bases.js ordens.xlsx consumo.xlsx base.xlsx [--pendencias=pendencias.xlsx]`.

## Como usar

1. Abra `turbinas/index.html` no navegador.
2. Arraste a planilha `.xlsx` ou o `.zip` (Manusis ou Power BI; dá para escolher a de OMs e a de consumo juntas) para a tela (ou clique em **Escolher planilha**).
   A leitura é feita só no seu navegador — nada é enviado.

### Aplicativo no celular

Publicado como site (ex.: GitHub Pages em `…/turbinas/`), o painel é um
aplicativo instalável: no Chrome, toque em **Instalar app** (ou menu ⋮ →
*Instalar aplicativo*). Depois abre pelo ícone "Turbinas", em tela cheia e
sem internet (`sw.js` guarda o aplicativo; a base de OMs fica no aparelho).
O leitor de Excel vai junto em `vendor/` (SheetJS, licença Apache 2.0).

### Atualizar a planilha de OMs

Toque em **Atualizar base** (no topo) e escolha a planilha nova. Um aviso
mostra o andamento e o resultado ("Base atualizada: N OMs, dados até …"); o
cabeçalho passa a mostrar as novas datas. A base fica guardada no aparelho
(IndexedDB) e é usada ao reabrir, desde que seja mais recente que a embutida
no arquivo. Aplicativos que não guardam dados (leitores de arquivo do
celular) atualizam só naquela abertura — o aviso informa; use o Chrome.

> Os dados da operação **não** ficam neste repositório (ele é público).

### Versão com dados embutidos (offline)

```bash
npm install xlsx
node turbinas/scripts/gerar-com-dados.js Base_PowerBI_Ordens.xlsx painel-com-dados.html
```

Gera um único HTML com os dados e o leitor de Excel dentro, que abre e atualiza sem internet. Não publique
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
| Visão geral | 4 indicadores (OMs, backlog, backlog > 90 dias, tempo médio para fechar), abertas × fechadas, destaques automáticos, turbinas que mais pedem atenção, falhas mais frequentes (códigos do SCADA citados na descrição, ex.: 120_Pitch controller communications fault), peças mais trocadas |
| Turbinas | Mapa 5 parques × 20 posições (métrica selecionável) e ranking das 100 turbinas |
| Peças | Peças trocadas identificadas no texto do serviço executado: ranking, turbinas e OMs com a frase de origem |
| Backlog | Envelhecimento, motivos de espera e OMs mais antigas |
| Custos | Custo por mês e por tipo de serviço e OMs de maior custo; custos atípicos (≥ R$ 10 mi) excluídos por padrão |
| Ordens | Tabela com busca, ordenação, paginação e exportação CSV |

**Filtros** (valem para todas as páginas): período, parque, turbina, tipo de
serviço, falha, componente trocado e status. Clicar numa barra ou num parque
também filtra (cross-filter). Clique numa turbina para abrir o detalhe e numa
OM para ver a ficha completa. O estado fica na URL, então o link pode ser
compartilhado já filtrado. Todo gráfico tem o botão de **visão em tabela**.

## Definições dos indicadores

Seguem as medidas DAX da aba `LEIA-ME`:

- **% Conclusão** = Concluídas ÷ (Total − Canceladas)
- **Backlog** = OMs dos status Abertas, Programadas, Em espera e Apontamentos concluídos
- **Lead time médio (dias)** = média de `Lead_Time_h` ÷ 24
- **Entrega no prazo** = No prazo ÷ (No prazo + Atrasada)
- **Período**: OMs pela data de abertura; "fechadas" pela data de fechamento.

## Arquivos

- `index.html` — o painel (HTML, CSS e JS sem dependências; SheetJS é baixado do cdnjs só na hora do upload)
- `modelo.js` — converte a planilha no modelo de dados (navegador e Node)
- `scripts/gerar-com-dados.js` — gera a versão com dados embutidos

## Peças trocadas e auditoria

As peças são lidas do texto do serviço executado (`componentesTrocados` em
`modelo.js`). As regras foram ajustadas com duas auditorias OM por OM (cerca de
3.200 trocas lidas por pessoas/agentes): não contam recomendações e
"Pendências:", trocas só de teste ou desfeitas ("retornada a original"),
histórico ("já havia sido substituído"), remontagem em relatórios de grande
corretiva, peças de outra turbina e a mesma troca lançada em duas OMs da mesma
turbina (preventiva + corretiva, ou texto que cita a outra OM). Ao mudar as
regras, suba `VERSAO_PECAS`: o app relê as bases já guardadas no aparelho.
