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

### Juntar anos e somar o mês (base acumulada)

O Manusis exporta um ano por vez. No botão **Atualizar base → Somar arquivos à base** dá para escolher
de uma vez várias exportações (OMs, consumo e pendências; `.xlsx` ou `.zip`, de anos diferentes). O painel
junta tudo numa planilha só, guarda no aparelho e, nos meses seguintes, soma só os arquivos novos:

- OM e pendência pelo número: a exportação mais nova (pelo carimbo `_ddmmaaaahhmmss_` do nome) prevalece;
- Especialidades e Paradas pela OM;
- consumo pela OM: o Manusis exporta o consumo das OMs do período, então a OM que vem no arquivo novo
  fica com todos os materiais dele (repetir um período não duplica).

**Baixar base completa (.xlsx)** gera esse arquivo único, para guardar ou abrir em outro aparelho.
**Começar do zero** troca a base só pelos arquivos escolhidos.

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

Com o Manusis, passe todas as planilhas (OMs, consumo e pendências, de um ou vários anos, `.xlsx` ou `.zip`)
e, por último, o HTML de saída. `--base-completa=base.xlsx` grava também a planilha juntada:

```bash
node turbinas/scripts/gerar-com-dados.js ordens_2025.xlsx ordens_2026.xlsx consumo_2025.xlsx consumo_2026.xlsx pendencias.xlsx painel.html --base-completa=base.xlsx
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
| Turbinas | Mapa dos parques (métrica selecionável), quadro **Yaw drive com defeito** (OMs e pendências abertas que citam yaw drive, motor ou redutora do yaw, com grau: quebrado, defeito, falta proteção/ventoinha, a confirmar) e ranking das turbinas |
| Peças | Peças trocadas identificadas no texto do serviço executado: ranking, turbinas e OMs com a frase de origem |
| Backlog | Envelhecimento, motivos de espera e OMs mais antigas |
| Custos | Custo por mês e por tipo de serviço e OMs de maior custo; custos atípicos (≥ R$ 10 mi) excluídos por padrão |
| Ordens | Tabela com busca, ordenação, paginação e exportação CSV |
| Materiais | Consumo de materiais do Manusis (quando carregado) |
| Pendências | Pendências do Manusis (quando carregadas) |
| Programação | Programado × Realizado das atividades programadas (Curva S) |

**Filtros** (valem para todas as páginas): período, parque, turbina, tipo de
serviço, falha, componente trocado e status. Clicar numa barra ou num parque
também filtra (cross-filter). Clique numa turbina para abrir o detalhe e numa
OM para ver a ficha completa. O estado fica na URL, então o link pode ser
compartilhado já filtrado. Todo gráfico tem o botão de **visão em tabela**.

## Programação × Realizado

A aba **Programação** mostra as atividades programadas de manutenção, reconhecidas pela descrição da OM
(`atividadeManut` em `modelo.js`): Preventiva (Semianual, Anual – Torque/Dia 1, Anual – Lubrificação/Dia 2,
CRT – Segurança, Certificação Climb System (CRT – assistente de subida), Tensionamento + DTA), UPG (filtro secundário, óleo GBX,
mangueiras GBX), BRM (BRMs Yaw/Pitch/HPU, pastilhas Yaw) e Inspeção (pás externa/interna, coleta de óleo GBX).
Corretivas de falha e pedidos em texto livre ficam de fora.

- **Programado** = OMs com a *data de início da programação* do Manusis no período (sem as canceladas)
- **Realizado** = OMs fechadas no período
- **Aderência** = programadas no período que já foram fechadas ÷ programadas
- **Atrasada** = programada há mais de 30 dias e ainda não fechada
- **Curva S** = programado e realizado acumulados, em % do programado (eixo da direita)
- **Situação dos ciclos** = para cada ciclo (atividade + ano, ex.: Semianual 2026, BRMs 2025), com o status de hoje: feitas (fechadas), executadas aguardando fechar (apontamentos concluídos) e em aberto, por complexo

Filtros: complexo, grupo, atividade, ano e mês; tocar num mês, atividade, parque ou turbina filtra a página.
A base guardada antes dessa versão não tem a data de programação: atualize a base de OMs do Manusis.

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

## Consulta de OMs (painel de uma página)

`consulta.html` é um painel mais simples, de consulta: pesquisa na descrição e no serviço executado,
filtros (parque, turbina, ano, mês, status sem as canceladas, tipo de serviço e alarme da descrição),
cartões (OMs fechadas e em aberto, custo de materiais, pendências ligadas), ranking de turbinas,
evolução mensal, materiais mais usados e a tabela com a ficha completa da OM. Tudo cruzado pelo número da OM.

A aba **Materiais e pendências** mostra, por OM: o que foi consumido; o que não foi consumido (peça que o
serviço executado diz que trocou, sem consumo do mesmo tipo, pelas regras de `componentesTrocados`/conferência
do Painel de Turbinas); as pendências pendentes (Pendente, Em execução) e as não pendentes (Concluído, Cancelado).

```bash
npm install xlsx
node turbinas/scripts/gerar-consulta.js base.xlsx consulta-com-dados.html
```

Aceita a base única ou as exportações de OMs, consumo e pendências separadas. Consumos com preço unitário
fora do padrão (ex.: óleo por litro com preço do tambor) ficam fora do custo total. Não publique o HTML gerado.

Também na Consulta de OMs: filtro por data de abertura; modo **Computador** ou **Celular** (fica guardado no aparelho);
botão **Exportar Excel** (abas OMs, Materiais, Pendências e Filtros, com os filtros da tela; o leitor SheetJS de
`vendor/` vai embutido no HTML gerado); **Curva S das preventivas** (tipo de serviço preventivo, sem canceladas:
programado = data de início da programação no período, realizado = fechada no período, aderência = programadas já
fechadas, atrasada = programada há mais de 30 dias e aberta); **Pendências abertas por pessoa** (Pendente + Em execução,
pela coluna "Usuário", com a lista de cada pessoa).
**Mapa das turbinas**: esquema por parque (linha) e posição (coluna), lido do nome do ativo (AB-IV04, JOA XII-09),
com métrica selecionável (total de OMs, em aberto, corretivas, custo de materiais, trocas sem consumo, pendências abertas);
tocar numa turbina filtra o painel.
