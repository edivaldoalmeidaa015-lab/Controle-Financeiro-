/*
 * Modelo de dados do Painel de Turbinas.
 * Converte a planilha "Base_PowerBI_Ordens" (tabelas fato_* e dim_*) — ou a exportação
 * de ordens de manutenção do Manusis 4, como sai do sistema — num modelo colunar
 * compacto. Roda no navegador (window.ModeloTurbinas) e no Node.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ModeloTurbinas = fabrica();
})(this, function () {
  'use strict';

  var DIA_MS = 864e5;
  var EPOCA_EXCEL = Date.UTC(1899, 11, 30);
  // Custo atípico (valor da origem a validar, fora dos totais por padrão): acima de R$ 2 mi, ou acima de
  // R$ 300 mil numa OM que não é troca de componente grande (troca de gearbox/gerador custa ~R$ 1 a 1,4 mi).
  var LIMITE_CUSTO_ATIPICO = 2e6, LIMITE_CUSTO_REVISAR = 3e5;
  var COMPONENTE_GRANDE = /gear ?box|gbx|gerador|main ?bearing|main ?shaft|rolamento principal|\bp[aá]s?\b|blade|transformador|trafo|yaw ?drive|redutor|multiplicadora|liftra|guindaste|hss|conversor|converter/i;
  var ETAPAS = ['Abertas', 'Programadas', 'Em espera', 'Apontamentos concluídos'];

  var CAMPOS = ['om', 'status', 'grupo', 'tipo', 'natureza', 'wtg', 'sistema', 'parada', 'dAb', 'dFe',
    'dCa', 'leadH', 'idadeBkl', 'faixa', 'entrega', 'hhPrev', 'hhReal', 'hhApont', 'hhProd', 'custoMO',
    'custoMat', 'custoTot', 'espera', 'cancel', 'resp', 'reprog', 'ckItens', 'ckResp', 'durH',
    'ateInicioH', 'eAbertas', 'eProg', 'eEspera', 'eApont', 'desc', 'exec', 'atipico', 'tecnicos', 'obsEspera', 'obsCancel', 'pecas', 'pecasItens', 'pecasTrecho', 'falhas'];
  var CAMPOS_AP = ['ordem', 'pessoa', 'tipoAp', 'dia', 'horas'];

  /*
   * Peças substituídas, identificadas no texto do "Serviço executado".
   * Para cada verbo de troca já realizada ("substituição", "trocado", "foi substituído"...):
   *  - a peça é o que vem logo depois do verbo ("substituição DO SLIP DE COMUNICAÇÃO"),
   *    mais as ligadas por "e"/"," ("dos rolamentos, encoder e K21");
   *  - se o verbo não tem objeto ("realizado a substituição", "o mesmo foi substituído",
   *    "substituição do componente"), vale a peça citada antes dele;
   *  - o que não está no dicionário entra como "Outras peças", com o nome como escrito.
   * Recomendações e pendências ("programar substituição", "não foi realizada a troca")
   * são ignoradas. Cada troca guarda a categoria e o nome da peça como foi escrito.
   * Regra de categoria: [nome, expressão sobre UMA palavra sem acento, expressão opcional p/ 2-3 palavras].
   */
  var COMPONENTES = [
    ['Placa eletrônica', /^(placas?|(?!aero$)ae[a-z]{2}|we[a-z]{2}|card|cartao|clp|usca|ucsa|bppb|pbbp)$/],
    ['Encoder', /^enco[l]?ders?$|^encode$/],
    ['Motor', /^motor(es)?$|^motoredutor/],
    ['Sensor', /^sensor(es)?$|^sendor(es)?$|^pt100$|^pch$|^termostato$|^pressostato$|^acelerometros?$|^transdutor(es)?$/],
    ['Anemômetro / biruta', /^anemometros?$|^biruta$|^ultra-?s+on\w*$/, /^(wind vane|wind sensor|sensor wind|sensor de vento)$/],
    ['Fusível', /^fus[iy]ve(l|is)$|^porta-fus/, /^porta fus/],
    ['Disjuntor', /^disjuntor(es)?$|^breaker$|^q\d{1,2}$|^idr$/],
    ['Contatora / relé', /^contator(a|as|es)?$|^contactor(a|as|es)?$|^reles?$|^relay$|^k\d{1,3}$/],
    ['UPS / nobreak', /^ups$|^nobreak$/],
    ['Bateria', /^baterias?$|^bancos?$|^pilhas?$/],
    ['Carregador / fonte', /^carregador(es)?$|^fontes?$/],
    ['Cabo / conector', /^cabos?$|^rj45$|^conector(es)?$|^chicote$|^shunts?$|^terminal$|^terminais$|^bornes?$|^jumpers?$/],
    ['Slip ring', /^slip$|^slipring$|^slip-ring$/],
    ['Escovas', /^escovas?$|^porta-escovas?$/],
    ['Rolamento', /^rolamentos?$/],
    ['Filtro', /^filtros?$|^dessecante$|^cartucho$/, /^(elemento filtrante|elementos filtrantes)/],
    ['Óleo / graxa', /^oleo$|^graxa$|^lubrificante$/],
    ['Parafusos / fixação', /^parafusos?$|^porcas?$|^studs?$|^arruelas?$|^prisioneiros?$|^bracadeiras?$|^pernos?$/],
    ['Bobina', /^bobinas?$/, /^close coil/],
    ['Acumulador', /^ac+umulador(es)?$|^acumulado$/],
    ['Mangueira', /^mangueiras?$/],
    ['Freio (pastilhas / disco)', /^pastilhas?$|^lonas?$|^pucks?$|^brakes?$|^caliper$|^freios?$|^eletrofreios?$/, /^(brake pad|disco de freio|disco do freio)/],
    ['Ventilador', /^ventilador(es)?$|^fan$|^cooler$|^exaustor(es)?$/],
    ['Bomba', /^bombas?$/],
    ['Manômetro', /^manom[e]?n?tros?$/],
    ['Radiador', /^radiador(es)?$/],
    ['Lâmpada / iluminação', /^lampadas?$|^luminarias?$|^refletor(es)?$/, /^aviation light/],
    ['Supressor de surto', /^supressor(es)?$|^dps$/],
    ['Acoplamento', /^acoplamentos?$|^laminas?$/],
    ['Vedação / O-ring', /^o-?rings?$|^retentor(es)?$|^vedacao$|^juntas?$/],
    ['Válvula', /^valvulas?$|^solenoide$|^tcv$/],
    ['Chave / botoeira', /^chaves?$|^botoeira$|^botao$|^seletora$/, /^fim de curso/],
    ['Conversor / IGBT', /^igbts?$|^conversor(es)?$|^inversor(es)?$|^rovc$/, /^power conver/],
    ['Switch / rede', /^switch$|^hirschmann$|^hrisman$|^hirchmann$|^suite$|^n-?tron$/],
    ['Gancho / talha', /^gu?a?n?cho$|^gacho$|^guacho$|^guincho$|^talhas?$/],
    ['Linha de vida', /^$/, /^linha de vida/],
    ['Escada', /^escadas?$/],
    ['Redutora / gearbox', /^redutor(a|as|es)?$|^hss$/],
    ['Outras peças', /^$/]
  ];
  var OUTRAS = COMPONENTES.length - 1;
  function componenteIdx(nome) { for (var x = 0; x < COMPONENTES.length; x++) if (COMPONENTES[x][0] === nome) return x; return OUTRAS; }
  // Suba quando mudar a regra de peças: o painel refaz a leitura das bases já guardadas no aparelho.
  var VERSAO_PECAS = 5;
  // verbos de troca JÁ REALIZADA (exclui infinitivo "substituir"/"trocar", que costuma ser recomendação)
  var VERBO = /^(substituicao|substituicoes|substituid[oa]s?|substitui|substituimos|substituiram|substituindo|troca|trocas|trocad[oa]s?|trocou|trocamos|trocaram|trocando|substitui-l[oa]s?|troca-l[oa]s?)$/;
  // "Realizada instalação de UPS": instalar conta como troca só para peças de reposição — instalar
  // controle da talha, linha de vida temporária, bomba off-line etc. é montagem de serviço, não peça trocada
  var INSTALA = /^(instalacao|instalacoes|instalad[oa]s?|instalou|instalamos|instalaram|instalando|adicionad[oa]s?)$/;
  var INSTALA_OK = /^(UPS|Placa|Encoder|Motor|Sensor|Anemômetro|Disjuntor|Contatora|Bateria|Carregador|Slip ring|Escovas|Rolamento|Bobina|Acumulador|Freio|Ventilador|Manômetro|Radiador|Supressor|Válvula|Conversor|Switch|Redutora)/;
  // "reposição da capota", "reposição dos fusíveis": quase sempre é recolocar a mesma peça; só conta para parafusos faltantes
  var REPOE = /^(reposicao|repost[oa]s?)$/;
  // apontamento lançado em outra OM ("OM DUPLICADA", "esse apontamento foi realizado na OM 10886")
  var OUTRA_OM = /\bom duplicada\b|apontamento (foi )?(realizado|lancado|feito) na om \d|(colocado|lancado) o material na om \d|servico (foi )?realizado na om:? ?\d|om ja (foi )?feita na:? ?\d|desconsiderar (essas|estas|esta|essa|este|esse) (anotac|apontament)|om (de )?teste do planejamento/;
  // objeto que indica que nenhuma peça foi trocada: "troca da porta do sensor", "realizar comando"
  var SEM_PECA = /^(portas?|canal|canais|comando|status|inicio|quinta|sexta|descarr\w*|alguns|algumas|yew|aero)$/;
  // peça só passada de um conjunto para outro: "periféricos da gearbox avariada para a nova"
  var MOVIDA = /\b(avariad[oa]s?|antig[oa]s?|velh[oa]s?) para \S*\s?\S*\s?(nov[oa]|outr[oa])/;
  // troca feita só como teste: "instalação da UPS reparada para teste", "testes com substituição de placas"
  var TESTE = /para testes?\b|como ?testes?\b|testes com|em testes?\b/;
  // histórico, tentativa ou programação logo ao lado do verbo: "já havia sido substituído", "não sendo possível realizar a substituição"
  var PERTO = /nao (sendo|foi|foram|era) possivel|nao substitu|nao foi executad|programacao|sera realizad|ja (havia|haviam|tinha|tinham) (sido|passado|substitu|trocad)|recentemente|(a|ha) pouco tempo|anteriormente|tentativa/;
  var PENDENTE = /interessante|agendar|assim que possivel|futuramente|nao deu|necessidade de (realizar )?(a )?(substitu|troca)|ate ?a substitu|apresentacao do procedimento|procedimento revisado|\bnao\b.{0,35}\b(necessari|necessidade)|\bsem (necessidade|necessari)|\bnao (foi|foram|sera|houve)\b.{0,25}(substitu|troca)|aguardando|programar|programad|recomend|sugerid|sugere|solicitad|solicitar|pendente|necessita|(?<!foi |foram |sendo |fez-se |se fez )necessari\w* (a |realizar |fazer )?(a )?(substitu|troca)|sera (necessari\w* )?(substitu|troca)|devera|deve ser|precisa|importante/;
  // palavras que podem ficar entre o verbo e a peça
  var LIGA = /^(doas|de|do|da|dos|das|o|a|os|as|um|uma|uns|umas|no|na|nos|nas|em|e|novo|nova|novos|novas|dois|duas|tres|quatro|seis|oito|ambos|ambas|todos|todas|completa|completo|conjunto|kit|jogo|cinco|sete|nove|dez|doze|quinze|vinte|trinta|quarenta|cinquenta|cem|02|\d+|\d+o|x|\d+x|pc|pcs|unidades?|corretiva|preventiva|imediata|integral|total|parcial)$/;
  // o verbo aponta para algo já citado ("substituição do componente", "do mesmo")
  var GENERICO = /^(componentes?|pecas?|itens?|item|d?[ao]?mesm\w*|memos|equipamento|quais|qual|estes|estas|esses|essas|este|esta|esse|essa)$/;
  // palavras que não são peça: depois do verbo, indicam que não há objeto
  var NAO_PECA = /^(falhas?|turbinas?|wtg|maquina|aerogerador|atividades?|por|pela|pelo|para|como|junto|com|que|sendo|onde|devido|ou|reparo|liberad\w*|sanad\w*|necessari\w*|recente|seguida|porem|entanto|ainda|tambem|apos|mais|nao|foi|foram|e|em|esta|estava|sera|se|seu|sua|ja|todo|tudo|dia|hoje|ontem|axis|blade|pitch|hub|nacele|nacelle|yaw|gerador|gearbox|gbx|painel|top|box|circuito|sistema|preventivamente|corretivamente|imediat\w*|sanando|entao|acre?s+c?entad\w*|assim|sucessiv\w*|referid\w*|download|perda|segunda|terceira|primeira|nova|novamente|dele|dela|deles|delas|deixad\w*|apenas|problema|normalizou|aero|entre|quando|bem-sucedid\w*|pouco|inicio|logo|durante|ferramentas?|comprovante|falhou|resolveu|colocad\w*|porta|perifericos?)$/;
  // qualificadores que fazem parte do nome da peça ("slip DE COMUNICAÇÃO")
  var QUALIF = /^(comunicacao|potencia|aterramento|fase|linha|ventilacao|oleo|refrigeracao|alimentacao|freio|terra|controle|emergencia|sinal|protecao|seguranca|fixacao|acesso|vida|sustentacao|temperatura|pressao|vento|rede|dados|velocidade|rotacao|posicao|nivel|tensao|corrente|ancoragem|fan|ventilador|bomba|motor|gerador|yaw|pitch|freio|gearbox|gbx|conversor|acoplamento|hidraulica|hidraulico|central|vida|lubrificacao|manual)$/;
  var SIGLA = /^(ae[a-z]{2}|we[a-z]{2}|ups|igbt|clp|dps|rj45|dta|pt100|cbm|usca|gbx|mcc|plc|io|led|dc|ac)$|^[a-z]\d{1,4}$/;

  // palavras que iniciam outra ação na frase
  var ACAO = /^(feit[oa]s?|realizad[oa]s?|realizamos|efetuad[oa]s?|executad[oa]s?|inspecao|inspecionad\w*|verificad\w*|verificacao|testes?|testad\w*|limpeza|limpo|ajustad\w*|ajuste|reaperto|reapertad\w*|medicao|medid\w*|apos|seguida|liberad\w*|identificad\w*|constatad\w*|analise|retirad\w*|instalacao)$/;

  /*
   * Falhas da turbina citadas na descrição, no padrão do SCADA: "120_Pitch controller
   * communications fault", "WTG apresenta falha 157_Secondary rotor brake...".
   * O código é a chave; o nome exibido é a variação mais frequente na base.
   * "NNN - Nome" (com hífen) só vale para códigos já vistos com "_", porque o hífen
   * também aparece em nomes de plano preventivo ("WTG-CYCLE-ANNUAL-1X-2026 - Anual").
   */
  var RE_FALHA = /(?<![\w\/.])(\d{1,3})\s?_\s?([A-Za-z](?:(?!\d{1,3}\s?_)[^\n])*)/g;
  var RE_FALHA_HIFEN = /(?<![\w\/.])(\d{1,3})\s?-\s?([A-Za-z](?:(?!\d{1,3}\s?[-_])[^\n])*)/g;
  // nome de plano de preventiva, não falha: "WTG-CYCLE-SEMIANNUAL-2…"
  function custoAtipico(custo, desc, exec) {
    return custo !== null && custo !== undefined && (custo >= LIMITE_CUSTO_ATIPICO ||
      (custo >= LIMITE_CUSTO_REVISAR && !COMPONENTE_GRANDE.test(String(desc || '') + ' ' + String(exec || '').slice(0, 400)))) ? 1 : 0;
  }
  var PLANO = /cycle|annual|semian|wtg-|preventiv|^pm\b/i;
  var FIM_NOME_FALHA = /\s+(e|associad\w*|com|foi|foram|realizad\w*|sincroniza\w*|apresenta\w*|porem|porém|na|no|em|que|apos|após|devido|onde|sendo|toolbox|tooblbox|via|logo|mesmo|mesma|durante|ao|pois|conforme)\b.*$/i;

  function nomeFalha(bruto) {
    var n = bruto.split(/[,;(]|\.(?=\s|[A-Za-z]|$)|\s-\s|\s\/\s/)[0];
    n = n.replace(/(\d)(realizad|foi|e\s)\w*.*$/i, '$1')
      .replace(/(Foi|Realizad\w*|Provavelmente|Sincroniza\w*|Logo|Ap[oó]s|Devido|Durante|Sendo|Onde|Porem|Porém)\b.*$/, '')
      .replace(FIM_NOME_FALHA, '').replace(/\s+(ou|e|de|da|do)$/i, '').replace(/[\s)\]]+$/, '').replace(/\s+/g, ' ').trim();
    if (n.length > 60) n = n.slice(0, 60).replace(/\s+\S*$/, '');
    return n;
  }

  /** Para cada descrição, os códigos de falha citados; mais o rótulo de cada código. */
  function extrairFalhas(descricoes) {
    var brutas = descricoes.map(function (t) {
      var r = [];
      if (!t) return r;
      String(t).replace(/\n(?=[a-z])/g, ' ').replace(RE_FALHA, function (_, cod, nome) { var n = nomeFalha(nome); if (n.length >= 3 && !PLANO.test(n)) r.push([+cod, n]); return _; });
      return r;
    });
    var conhecidos = {};
    brutas.forEach(function (r) { r.forEach(function (f) { conhecidos[f[0]] = true; }); });
    descricoes.forEach(function (t, i) {
      if (!t) return;
      String(t).replace(/\n(?=[a-z])/g, ' ').replace(RE_FALHA_HIFEN, function (_, cod, nome) {
        var n = nomeFalha(nome);
        if (conhecidos[+cod] && n.length >= 3 && !PLANO.test(n) && !brutas[i].some(function (f) { return f[0] === +cod; })) brutas[i].push([+cod, n]);
        return _;
      });
    });
    // nome canônico por código: a variação mais frequente
    var variantes = {};
    brutas.forEach(function (r) { r.forEach(function (f) {
      var v = variantes[f[0]] || (variantes[f[0]] = {}), k = f[1].toLowerCase();
      v[k] = v[k] || { n: 0, texto: f[1] }; v[k].n++;
    }); });
    var codigos = Object.keys(variantes).map(Number).sort(function (a, b) { return a - b; });
    var rotulos = codigos.map(function (c) {
      var melhor = Object.keys(variantes[c]).map(function (k) { return variantes[c][k]; }).sort(function (a, b) { return b.n - a.n; })[0].texto;
      return c + ' · ' + melhor.charAt(0).toUpperCase() + melhor.slice(1);
    });
    var pos = {}; codigos.forEach(function (c, k) { pos[c] = k; });
    return {
      rotulos: rotulos,
      falhas: brutas.map(function (r) {
        var ids = []; r.forEach(function (f) { var k = pos[f[0]]; if (ids.indexOf(k) < 0) ids.push(k); }); return ids;
      })
    };
  }

  function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /** Categoria da peça que começa na posição k (ou -1). Testa também 2-3 palavras ("slip ring"). */
  function componenteEm(toks, k) {
    var w = toks[k];
    if (!w || w === '|') return -1;
    var par = w;
    for (var x = 1; x <= 2 && toks[k + x] && toks[k + x] !== '|'; x++) par += ' ' + toks[k + x];
    for (var c = 0; c < OUTRAS; c++) {
      if (COMPONENTES[c][2] && COMPONENTES[c][2].test(par)) return c;
      if (COMPONENTES[c][1].test(w)) return c;
    }
    return -1;
  }
  function ehSubstantivo(w) { return !!w && w !== '|' && /^[a-z][a-z\-]{2,}$/.test(w) && !NAO_PECA.test(w) && !ACAO.test(w) && !GENERICO.test(w) && !LIGA.test(w) && !VERBO.test(w); }

  /**
   * Nome da peça a partir da posição k: a palavra principal (ou 2 palavras, "slip ring"),
   * siglas logo depois ("placa AEPA", "contator K21") e qualificadores com "de/do/da"
   * ("slip de comunicação", "porta-fusível do Top Box", "bobinas do Q1").
   * Devolve [fim exclusivo, texto].
   */
  function nomePeca(toks, orig, k) {
    var fim = k + 1, c = componenteEm(toks, k);
    if (c >= 0 && COMPONENTES[c][2] && !COMPONENTES[c][1].test(toks[k])) {
      for (var n = 3; n >= 2; n--) if (COMPONENTES[c][2].test(toks.slice(k, k + n).join(' ')) && !COMPONENTES[c][2].test(toks.slice(k, k + n - 1).join(' '))) { fim = k + n; break; }
    }
    while (fim < toks.length && fim - k < 5) {
      var t = toks[fim], t2 = toks[fim + 1];
      if (SIGLA.test(t) && !/^(io|dc|ac)$/.test(t)) { fim++; continue; }
      if (/^(de|do|da|dos|das)$/.test(t) && t2 && (QUALIF.test(t2) || SIGLA.test(t2))) { fim += 2; continue; }
      if (/^(de|do|da)$/.test(t) && t2 === 'top' && toks[fim + 2] === 'box') { fim += 3; continue; }
      if (c < 0 && fim === k + 1 && ehSubstantivo(t) && !QUALIF.test(t) && !/(ad|id)[oa]s?$|ntes?$/.test(t)) { fim++; continue; }
      break;
    }
    var txt = orig.slice(k, fim).map(function (o, x) {
      var n = toks[k + x];
      if (SIGLA.test(n) && n !== 'io') return o.toUpperCase();
      if (n === 'top' || n === 'box') return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
      return o.toLowerCase();
    }).join(' ');
    return [fim, txt.charAt(0).toUpperCase() + txt.slice(1)];
  }

  /** Peça citada antes do verbo (prefere a que vem com artigo: "que O CARREGADOR da axis 2 bateria 4"). */
  function pecaAntes(toks, orig, v) {
    var perto = -1;
    for (var b = v - 1; b >= Math.max(0, v - 24); b--) {
      if (toks[b] === '|' && perto >= 0) break; // "...os disjuntores | slip de comunicação, o mesmo foi substituído"
      if (componenteEm(toks, b) < 0) continue;
      if (perto < 0) perto = b;
      if (/^(o|a|os|as|um|uma|que|no|na)$/.test(toks[b - 1] || '')) return cabeca(b);
    }
    return perto < 0 ? -1 : cabeca(perto);
    // "motor DO FAN": a peça é a primeira da expressão
    function cabeca(b) { while (/^(do|da|de|dos|das)$/.test(toks[b - 1] || '') && componenteEm(toks, b - 2) >= 0) b -= 2; return b; }
  }

  /**
   * Peça fora do dicionário citada antes do verbo como defeituosa:
   * "o BLOCO de lubrificação estava danificado, foi realizado a substituição".
   */
  var DEFEITO = /^(danificad\w*|avariad\w*|queimad\w*|defeit\w*|quebrad\w*|rompid\w*|travad\w*|desgastad\w*|oxidad\w*|curto|falha|mal|trincad\w*|vazamento|vazando|inoperante|aberto|aberta)$/;
  function defeituosaAntes(toks, v, base) {
    for (var b = v - 1; b > Math.max(base, v - 30); b--) {
      if (!/^(o|a|os|as|um|uma)$/.test(toks[b - 1] || '') || !ehSubstantivo(toks[b])) continue;
      for (var d = b + 1; d < Math.min(v, b + 9); d++) if (DEFEITO.test(toks[d])) return b;
    }
    return -1;
  }

  /**
   * Devolve {ids: categorias distintas, itens: [[categoria, nome]], trechos: frase de cada item}.
   */
  function componentesTrocados(texto) {
    var ids = [], itens = [], trechos = [];
    if (!texto || OUTRA_OM.test(semAcento(String(texto)))) return { ids: ids, itens: itens, trechos: trechos };
    // quebra de linha no meio da frase ("substituímos a\nWETA") não separa frases
    texto = String(texto).replace(/([a-zà-ú])([A-ZÀ-Ú][a-zà-ú])/g, '$1 $2') // "dessecantePendências"
      .replace(/pend[eê]ncias?\b(?!\s*(?:retirad|sanad|resolvid|eliminad|corrigid|executad|baixad))[^:\n\[]{0,30}:[\s\S]*?(?=\n\[|pend[eê]ncias?\s*(?:retirad|sanad|resolvid|eliminad|corrigid|executad|baixad)|\bretirad[ao]s?\s*:|\bstatus\s*:|m[aá]quina (?:em|ficou em) opera|\bin[ií]cio\s*:|\bobs\b|$)/gi, function (trecho) {
        // na lista do que ficou pendente só sobra o que diz que foi trocado ("Pendências: … Substituído 12 escovas")
        return ' ' + trecho.split(/[;.]\s*|\n/).filter(function (x) { return /substitu[ií]d|trocad|(realizad|feit)[oa] (a |o )?(substitui|troca)/i.test(x); }).join('. ') + ' ';
      });
    // relatório de grande corretiva (troca de gearbox, main shaft, gerador): "instalação do slip, dos sensores, da UPS…"
    // é remontagem das mesmas peças, não troca
    var remontagem = /\bHTN\b|\bHEX\b|p[oó]s[- ]?work/i.test(texto);
    var frases = String(texto).replace(/([a-zà-ú,])[ \t]*\n[ \t]*(?=[A-Za-zÀ-ú])/g, '$1 ').split(/\n(?=\s*[\[\-•*A-ZÀ-Ú])|\n\s*\n|(?<=[.;!?])\s+|(?<=[a-z]\.)(?=[A-Z\d])/);
    var antesT = [], antesO = [];
    frases.forEach(function (frase) {
      // tokens originais (para o nome) e normalizados (para as regras), alinhados
      var bruto = frase.replace(/([A-Z]{2,})(?=[A-Z][a-z])/g, '$1 ').replace(/([A-Za-z]{2})\.(?=[A-Za-z])/g, '$1. ') // "UPSSerial", "UPS.Obs"
        .replace(/(^|\s)-+/g, ' | ').replace(/[,;:()\[\]]/g, ' | ')
        .replace(/\b(porém|porem|mas|entretanto|contudo|todavia)\b/gi, ' | ').split(/\s+/);
      var orig = [], toks = [];
      bruto.forEach(function (o) {
        var n = o === '|' ? '|' : semAcento(o).replace(/[^a-z0-9\-]/g, '').replace(/^-+|-+$/g, '');
        if (!n) return;
        var grudado = /^(os|as|o|a|do|da|no|na)([a-z].{3,})$/.exec(n);
        if (grudado && componenteEm([n], 0) < 0 && componenteEm([grudado[2]], 0) >= 0) {
          toks.push(grudado[1]); orig.push(o.slice(0, grudado[1].length));
          n = grudado[2]; o = o.slice(grudado[1].length);
        }
        toks.push(n); orig.push(o.replace(/^[^\wÀ-ú]+|[^\wÀ-ú]+$/g, ''));
      });
      // a frase anterior entra como contexto para "o mesmo foi substituído"
      var T = antesT.concat(['|'], toks), Or = antesO.concat(['|'], orig), base = antesT.length + 1;
      antesT = toks; antesO = orig;
      // frase com recomendação ou interdição: nada nela é troca feita
      if (/\brecomenda(-se|mos)?\b|\brecomendo\b|interditad|sugere-se|sugerimos/.test(semAcento(frase.toLowerCase()))) { antesT = toks; antesO = orig; return; }
      var trecho = frase.replace(/^\s*\[[^\]]{0,80}\]\s*/, '').trim().replace(/\s+/g, ' ').slice(0, 260);
      function anota(pos) {
        if (pos < 0) return -1;
        var c = componenteEm(T, pos), r = nomePeca(T, Or, pos);
        if (c < 0) c = OUTRAS;
        if (COMPONENTES[c][0] === 'Óleo / graxa' && /complet|nivel/.test(T.slice(Math.max(base, vAtual - 6), vAtual + 6).join(' '))) return pos + 1;
        // "sensor wind vane", "sensor de vento", "sensor ultrassônico" medem vento
        if (COMPONENTES[c][0] === 'Sensor' && (/^(wind|vane|vento|ultra-?s+on\w*)$/.test(T[pos + 1] === 'de' || T[pos + 1] === 'do' ? T[pos + 2] || '' : T[pos + 1] || '') || T[pos - 1] === 'wind')) c = componenteIdx('Anemômetro / biruta');
        if (/^bancos?$/.test(T[pos]) && /^capacit/.test(T[pos + 2] || '')) c = OUTRAS; // banco de capacitores
        var adiante = T.slice(pos, pos + 8).join(' ');
        if (/linha de vida/i.test(r[1]) || (COMPONENTES[c][0] === 'Cabo / conector' && /linha de vida/.test(adiante))) c = componenteIdx('Linha de vida');
        else if (/^pinos?$/.test(T[pos]) && /por (\w+ )?parafus/.test(adiante)) c = componenteIdx('Parafusos / fixação'); // pinos trocados por parafusos
        else if (/^óleos?\b/i.test(r[1])) c = componenteIdx('Óleo / graxa');
        if (/^brakes?$/.test(T[pos]) && /^(de|do|da)$/.test(T[pos + 1] || '') && /^sensor/.test(T[pos + 2] || '')) c = OUTRAS; // "brake do sensor PosRef" é o suporte
        r[1] = r[1].replace(/^g[ua]{0,2}n?cho\b/i, 'Gancho').replace(/^encol?ders?\b|^encode\b/i, 'Encoder').replace(/^sendor/i, 'Sensor').replace(/^brake pads?\b/i, 'Pastilhas de freio').replace(/^idr\b/i, 'IDR');
        // mesma peça citada de novo ("Hirschmann" / "Hirschmann do Top Box"): fica o nome mais completo
        var novo = r[1].toLowerCase(), igual = -1;
        itens.forEach(function (it, x) { var vel = it[1].toLowerCase(); if (it[0] === c && (vel.indexOf(novo) === 0 || novo.indexOf(vel) === 0)) igual = x; });
        if (igual >= 0) { if (r[1].length > itens[igual][1].length) itens[igual][1] = r[1]; }
        else {
          itens.push([c, r[1]]); trechos.push(trecho); adicionados.push({ idx: itens.length - 1, v: vAtual });
          if (ids.indexOf(c) < 0) ids.push(c);
        }
        return r[0];
      }
      // trecho da oração até logo depois do verbo: "programar substituição", "não foi realizada a substituição"
      // (o que vem bem depois — "e será programado verificar o vazamento" — não anula a troca feita)
      // da palavra até o fim da oração ("substituição dos periféricos da gearbox avariada para a nova")
      function resto(v) { var b = v; while (b < T.length - 1 && T[b + 1] !== '|') b++; return T.slice(v, b + 1).join(' '); }
      function perto(v) { return T.slice(Math.max(base, v - 6), v + 6).join(' '); }
      function oracao(v, alcance) {
        var a = v, b = v;
        while (a > base && T[a - 1] !== '|') a--;
        while (b < T.length - 1 && T[b + 1] !== '|' && b < v + (alcance || 3)) b++;
        return T.slice(Math.max(base, a - 3), b + 1).join(' ');
      }
      var adicionados = [], vAtual = -1;
      for (var v = base; v < T.length; v++) {
        vAtual = v;
        if (INSTALA.test(T[v]) || REPOE.test(T[v])) {
          if (remontagem || /(fechamento|montagem|remontagem) do gerador|fechamento da maquina/.test(semAcento(frase.toLowerCase()))) continue;
          var permitido = REPOE.test(T[v]) ? /^Parafusos/ : INSTALA_OK;
          if (PENDENTE.test(oracao(v)) || TESTE.test(oracao(v, 7)) || PERTO.test(perto(v))) continue;
          var ki = v + 1;
          while (ki < T.length && T[ki] !== '|' && LIGA.test(T[ki])) ki++;
          var ci = componenteEm(T, ki);
          if (ci < 0 && /^(instalad|adicionad)/.test(T[v]) && componenteEm(T, v - 1) >= 0) { ki = v - 1; ci = componenteEm(T, ki); } // "UPS instalada"
          if (ci < 0 && /^(instalad|adicionad)/.test(T[v]) && /^(foi|foram|sendo|sao|estao)$/.test(T[v - 1] || '')) {
            // "a UPS foi instalada"
            ki = v - 2;
            while (ki > base && T[ki] !== '|' && componenteEm(T, ki) < 0 && v - ki < 5) ki--;
            ci = componenteEm(T, ki);
          }
          // peça de outra turbina em teste cruzado: "instalado o CLP da ASB VIII-19 na ASB IV-08"
          var deOutra = /^(da|de|do)$/.test(T[ki + 1] || '') && /^(asb|ab|wtg|turbina|aerogerador)$/.test(T[ki + 2] || '');
          if (ci >= 0 && permitido.test(COMPONENTES[ci][0]) && !deOutra) anota(ki);
          continue;
        }
        if (!VERBO.test(T[v]) || PENDENTE.test(oracao(v)) || TESTE.test(oracao(v, 7)) || MOVIDA.test(resto(v)) || PERTO.test(perto(v))) continue;
        var passiva = /^(substituid|trocad|repost)/.test(T[v]) && /^(foi|foram|sendo|sao|estao|sera)$/.test(T[v - 1] || '');
        // 1) objeto depois do verbo
        var k = v + 1;
        while (k < T.length && T[k] !== '|' && LIGA.test(T[k])) k++;
        if (SEM_PECA.test(T[k] || '')) continue;
        var junto = T[k] === 'junto' && T[k + 1] === 'com';
        if (junto) { k += 2; while (k < T.length && LIGA.test(T[k])) k++; }
        var objeto = -1;
        if (componenteEm(T, k) >= 0) objeto = k;
        else if (T[k] && T[k] !== '|' && !GENERICO.test(T[k]) && !NAO_PECA.test(T[k]) && componenteEm(T, k + 1) >= 0 && /^(k|q)\d/.test(T[k + 1])) objeto = k + 1;
        else if (ehSubstantivo(T[k]) && !passiva) {
          // "acrílico DA BOMBA", "case DO FILTRO": a categoria vem da peça logo adiante
          objeto = k;
        }
        if (objeto >= 0) {
          for (var q = objeto + 1; q < Math.min(T.length, objeto + 7) && T[q] !== '|'; q++) {
            if (T[q] !== 'por') continue;
            var q2 = q + 1; while (q2 < T.length && LIGA.test(T[q2])) q2++;
            if (componenteEm(T, q2) >= 0) objeto = q2;
            break;
          }
          var fimNome = anota(objeto);
          if (componenteEm(T, objeto) < 0 && !/^(tampa|nip|niple|protecao|suporte|bracket|capa|chaveta|distribuidor)$/.test(T[objeto])) {
            // peça desconhecida: se logo adiante vem uma peça conhecida ("acrílico da bomba"), usa a categoria dela
            for (var a2 = fimNome; a2 < Math.min(T.length, fimNome + 3) && T[a2] !== '|'; a2++) {
              if (!/^(de|do|da|dos|das)$/.test(T[a2])) continue;
              var c2 = componenteEm(T, a2 + 1);
              if (c2 >= 0) {
                var ult = itens[itens.length - 1];
                if (ult && ult[0] === OUTRAS) {
                  ult[0] = c2; ult[1] += ' ' + T.slice(a2, a2 + 2).map(function (t, x) { return x ? Or[a2 + x].toLowerCase() : t; }).join(' ');
                  if (ids.indexOf(c2) < 0) ids.push(c2);
                  var aindaOutras = itens.some(function (it) { return it[0] === OUTRAS; });
                  if (!aindaOutras && ids.indexOf(OUTRAS) >= 0) ids.splice(ids.indexOf(OUTRAS), 1);
                }
                break;
              }
            }
          }
          // 2) peças encadeadas: "dos rolamentos, encoder e K21"
          var j = fimNome, desde = 0;
          while (j < T.length && desde <= 4) {
            if (ACAO.test(T[j]) || VERBO.test(T[j])) break;
            if (T[j] === 'e' || T[j] === '|') {
              var t = j + 1;
              while (t < T.length && LIGA.test(T[t]) && T[t] !== 'e') t++;
              if (componenteEm(T, t) >= 0) { j = anota(t); desde = 0; continue; }
              if (T[j] === '|' && !/^(e)$/.test(T[t] || '')) break;
            }
            j++; desde++;
          }
          if (!passiva || (componenteEm(T, objeto) >= 0 && !junto)) continue;
        }
        // 3) sem objeto (ou voz passiva): a peça citada antes do verbo
        if (objeto < 0 && !(passiva || T[k] === '|' || k >= T.length || GENERICO.test(T[k]) || NAO_PECA.test(T[k]) || ACAO.test(T[k]))) continue;
        if (passiva) {
          // "o suporte foi substituído": o sujeito vem logo antes de "foi" (depois do artigo)
          var s0 = v - 2;
          while (s0 > base && T[s0] !== '|' && !/^(o|a|os|as|um|uma|que)$/.test(T[s0 - 1]) && v - s0 < 6) s0--;
          if (componenteEm(T, s0) >= 0 || ehSubstantivo(T[s0])) { anota(s0); continue; }
        }
        var antes = pecaAntes(T, Or, v);
        if (antes < 0) antes = defeituosaAntes(T, v, base);
        anota(antes);
      }
      // troca desfeita: "…então foi retornada a original", "voltamos a placa anterior" — sai a última troca antes disso
      for (var rv = base; rv < T.length; rv++) {
        var adiante = T.slice(rv + 1, rv + 5);
        var desfez = (/^retorn/.test(T[rv]) || /^reinstalad/.test(T[rv]) || /^deixad/.test(T[rv]) || /^recolocad/.test(T[rv]) || T[rv] === 'voltamos')
          && (adiante.indexOf('original') >= 0 || adiante.indexOf('anterior') >= 0 || adiante.indexOf('antiga') >= 0 || adiante.indexOf('antigo') >= 0);
        if (!desfez) continue;
        for (var ad = adicionados.length - 1; ad >= 0; ad--) {
          if (adicionados[ad].v >= rv) continue;
          itens.splice(adicionados[ad].idx, 1); trechos.splice(adicionados[ad].idx, 1);
          adicionados.splice(ad, 1);
          break;
        }
      }
    });
    ids = [];
    itens.forEach(function (it) { if (ids.indexOf(it[0]) < 0) ids.push(it[0]); });
    // a mesma peça contada duas vezes na OM ("AEPA" e "Placa AEPA", "Placa" e "Placa WECA")
    var GEN = /^(placas?|cartao|card|sensor(es)?|motor(es)?|cabos?|fusiveis|fusivel|ups|nobreak|encoder|escovas?|rolamentos?|filtros?)$/;
    for (var x = itens.length - 1; x > 0; x--) {
      var px = semAcento(itens[x][1].toLowerCase()).split(/\s+/);
      for (var y = 0; y < x; y++) {
        if (itens[y][0] !== itens[x][0]) continue;
        var py = semAcento(itens[y][1].toLowerCase()).split(/\s+/);
        var generico = (px.length === 1 && GEN.test(px[0])) || (py.length === 1 && GEN.test(py[0]));
        var comum = px.some(function (t) { return t.length >= 4 && !GEN.test(t) && !/^(de|do|da|dos|das)$/.test(t) && py.indexOf(t) >= 0; });
        if (!generico && !comum) continue;
        if (itens[x][1].length > itens[y][1].length) itens[y][1] = itens[x][1];
        itens.splice(x, 1); trechos.splice(x, 1);
        break;
      }
    }
    return { ids: ids, itens: itens, trechos: trechos };
  }

  function Dic(inicial) {
    this.itens = [];
    this.pos = Object.create(null);
    (inicial || []).forEach(this.id, this);
  }
  Dic.prototype.id = function (v) {
    if (v === null || v === undefined || v === '') return -1;
    v = String(v).trim();
    if (!(v in this.pos)) { this.pos[v] = this.itens.length; this.itens.push(v); }
    return this.pos[v];
  };

  function serial(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    var d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (isNaN(d)) return null;
    return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) - EPOCA_EXCEL) / DIA_MS;
  }

  function num(v, casas) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return null;
    var f = Math.pow(10, casas === undefined ? 2 : casas);
    return Math.round(n * f) / f;
  }

  /** Texto completo: normaliza espaços em cada linha e mantém as quebras de linha. */
  function texto(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\r\n?/g, '\n').split('\n')
      .map(function (l) { return l.replace(/[ \t\u00a0]+/g, ' ').trim(); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function linhas(wb, XLSX, aba, obrigatoria) {
    var ws = wb.Sheets[aba];
    if (!ws) {
      if (obrigatoria) throw new Error('A planilha não tem a aba "' + aba + '".');
      return [];
    }
    return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  }

  /* ---------------- Exportação do Manusis 4 ---------------- */
  var ABA_MANUSIS = 'Ordens de manutenção';
  var TIPO_MANUSIS = { 'Corrective Maintenance': 'Corretiva', 'Preventive maintenance': 'Preventiva', 'Preventiva': 'Preventiva',
    'Performance': 'Performance', 'Inspeção': 'Inspeção', 'Field Services': 'Field Services' };
  function romano(r) {
    var v = { I: 1, V: 5, X: 10, L: 50 }, t = 0;
    for (var i = 0; i < r.length; i++) { var a = v[r[i]] || 0, b = v[r[i + 1]] || 0; t += a < b ? -a : a; }
    return t;
  }
  // "07/10/2025" + "00:06" -> "2025-10-07T00:06"
  function dataBR(d, h) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d || '').trim());
    if (!m) return null;
    var hm = /^(\d{1,2}):(\d{2})/.exec(String(h || '').trim());
    return m[3] + '-' + m[2] + '-' + m[1] + 'T' + (hm ? ('0' + hm[1]).slice(-2) + ':' + hm[2] : '00:00');
  }
  // "4.300,62" -> 4300.62
  function numBR(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  // "Usuário: FulanoData: 02/04/2026 11:21Texto" -> "[02/04/2026 11:21 - Fulano] Texto", um apontamento por linha
  function textoManusis(v) {
    return String(v || '').replace(/\s*(?:Usuário|User):\s*(.+?)\s*(?:Data|Date):\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2})\s*/g,
      function (_, nome, d, h) { return '\n[' + d + ' ' + h + ' - ' + nome.trim() + '] '; }).trim();
  }
  // "WTG0-0004-ASA-Aerogerador AB-IV04" -> { wtg: 'AB-IV04', parque: 'Asa Branca IV', pos: 4 }
  function turbinaManusis(ativo) {
    var m = /Aerogerador\s+(.+?)\s*$/.exec(String(ativo || ''));
    if (!m) return null;
    var nome = m[1], p;
    if ((p = /^AB-([IVXL]+)(\d+)$/.exec(nome))) return { wtg: nome, parque: 'Asa Branca ' + p[1], grupo: 'AB', num: romano(p[1]), pos: +p[2] };
    if ((p = /^([A-Z]{2,4})\s+([IVXL]+)-(\d+)$/.exec(nome))) return { wtg: nome, parque: p[1] + ' ' + p[2], grupo: p[1], num: romano(p[2]), pos: +p[3] };
    return { wtg: nome, parque: nome.replace(/[-\s]*\d+$/, ''), grupo: nome, num: 0, pos: parseInt((/(\d+)$/.exec(nome) || [0, 0])[1], 10) };
  }
  function complexoManusis(loc) {
    var c = String(loc || '').replace(/^SITE-[A-Z]+-/, '').replace(/^EOL\s+/, '').trim();
    return c.replace(/Piaui$/, 'Piauí') || 'Outros';
  }

  /** Converte a exportação do Manusis nas linhas de fato_ordens e dim_ativo. */
  function deManusis(wb, XLSX) {
    var brutas = XLSX.utils.sheet_to_json(wb.Sheets[ABA_MANUSIS], { defval: '', raw: false });
    if (!brutas.length) throw new Error('A aba "' + ABA_MANUSIS + '" está vazia.');
    if (!('Número de ordem' in brutas[0])) throw new Error('A aba "' + ABA_MANUSIS + '" não tem a coluna "Número de ordem".');
    // Hh por OM (aba Especialidades): os totais se repetem em cada linha da OM
    var hh = Object.create(null);
    if (wb.Sheets.Especialidades) {
      XLSX.utils.sheet_to_json(wb.Sheets.Especialidades, { defval: '', raw: false }).forEach(function (e) {
        var k = e['Número de ordem'];
        if (k && !hh[k]) hh[k] = { prev: numBR(e['Total Hh prev']), real: numBR(e['Total Hh real']) };
      });
    }
    var vistas = Object.create(null), ativos = Object.create(null), ordens = [];
    var hoje = -Infinity;
    function horas(a, b) { var x = serial(a), y = serial(b); return x === null || y === null ? null : Math.round((y - x) * 24 * 10) / 10; }
    brutas.forEach(function (r) {
      var om = String(r['Número de ordem'] || '').trim();
      if (!om || vistas[om]) return; // OM repetida na exportação
      vistas[om] = 1;
      var t = turbinaManusis(r['Ativo']);
      var complexo = complexoManusis(r['Localização 2']);
      if (t && !ativos[t.wtg]) {
        ativos[t.wtg] = { WTG: t.wtg, Parque: t.parque, Posicao_No_Parque: t.pos, Complexo: complexo,
          Modelo: String(r['Familia de ativos'] || '').split('-TURBINAS')[0].trim(), _grupo: t.grupo, _num: t.num,
          Ativo_Codigo: String(r['Ativo']).trim() };
      }
      var st = String(r['Status'] || '').trim();
      var ab = dataBR(r['Data de abertura'], r['Hora de abertura']), fe = dataBR(r['Data de fechamento'], r['Hora de fechamento']);
      var ca = dataBR(r['Data do cancelamento']), ini = dataBR(r['Data de início do serviço'], r['Hora de início do serviço']);
      var fim = dataBR(r['Data final do serviço'], r['Hora final do serviço']), prev = dataBR(r['Data prevista para entrega'], r['Hora prevista para entrega']);
      [ab, fe, ca].forEach(function (x) { var s = serial(x); if (s !== null && s > hoje) hoje = s; });
      var grupo = st === 'Fechadas' ? 'Concluída' : st === 'Canceladas' ? 'Cancelada' : 'Backlog';
      var custos = ['Custo de mão de obra', 'Custo de material', 'Custo de recurso de apoio', 'Outros custos'].map(function (c) { return numBR(r[c]); });
      var total = custos.some(function (c) { return c !== null; }) ? custos.reduce(function (a, c) { return a + (c || 0); }, 0) : null;
      var conj = String(r['Conjunto'] || '').replace(/^.*?-\d{4}-[A-Z]+-[A-Z0-9]+-\d+-/, '').trim();
      var h = hh[om] || {};
      ordens.push({
        OM: om, OM_Num: parseInt(om.replace(/\D/g, ''), 10), Status: st, Grupo_Status: grupo,
        Tipo_Servico: TIPO_MANUSIS[String(r['Tipo de serviço']).trim()] || 'Outros', Natureza_Servico: r['Natureza do serviço'] || null,
        WTG: t ? t.wtg : null, Sistema: conj || 'Turbina (geral)', Maquina_Parada: r['Máquina parada?'],
        Data_Abertura: ab, Data_Fechamento: grupo === 'Concluída' ? fe : null, Data_Cancelamento: grupo === 'Cancelada' ? (ca || fe) : null,
        Lead_Time_h: grupo === 'Concluída' ? horas(ab, fe) : null, _prev: prev, _fe: fe,
        Duracao_Servico_h: horas(ini, fim), Tempo_Ate_Inicio_h: horas(ab, ini),
        Hh_Previsto: h.prev === undefined ? null : h.prev, Hh_Real: h.real === undefined ? null : h.real, Hh_Apontado: h.real === undefined ? null : h.real,
        Custo_MO: custos[0], Custo_Material: custos[1], Custo_Total: total,
        Motivo_Espera: r['Motivo de espera'] || null, Obs_Motivo_Espera: r['Observação do motivo de espera'],
        Motivo_Cancelamento: r['Motivo do cancelamento'] || null, Obs_Cancelamento: r['Observação do motivo de cancelamento'],
        Mantenedor_Responsavel: r['Mantenedor responsável'] || null, Reprogramada: r['Motivo de Reprogramação'] ? 'Sim' : 'Não',
        Descricao: r['Descrição'], Servico_Executado: textoManusis(r['Serviço executado'])
      });
    });
    // idade do backlog e entrega no prazo, com a data mais recente da exportação como "hoje"
    ordens.forEach(function (o) {
      var a = serial(o.Data_Abertura), p = serial(o._prev);
      if (o.Grupo_Status === 'Backlog' && a !== null) {
        var idade = Math.floor(hoje) - Math.floor(a);
        o.Idade_Backlog_dias = idade;
        o.Faixa_Idade_Backlog = idade <= 30 ? '0-30 dias' : idade <= 60 ? '31-60 dias' : idade <= 90 ? '61-90 dias' : '>90 dias';
      }
      o.Entrega_No_Prazo = p === null ? 'Sem prazo definido' : o.Grupo_Status === 'Backlog' || o.Grupo_Status === 'Cancelada' ? 'Em aberto'
        : serial(o._fe) !== null && serial(o._fe) <= p ? 'No prazo' : 'Atrasada';
    });
    // turbinas: complexo (na ordem em que aparecem), grupo do parque e número romano, posição
    var lista = Object.keys(ativos).map(function (k) { return ativos[k]; });
    var ordemCx = [];
    lista.forEach(function (a) { if (ordemCx.indexOf(a.Complexo) < 0) ordemCx.push(a.Complexo); });
    ordemCx.sort(function (x, y) { return (x === 'Asa Branca' ? 0 : 1) - (y === 'Asa Branca' ? 0 : 1) || x.localeCompare(y); });
    lista.sort(function (a, b) {
      return ordemCx.indexOf(a.Complexo) - ordemCx.indexOf(b.Complexo) || a._grupo.localeCompare(b._grupo) || a._num - b._num || a.Posicao_No_Parque - b.Posicao_No_Parque;
    });
    var parquesVistos = [];
    lista.forEach(function (a, i) {
      a.WTG_Seq = i + 1;
      if (parquesVistos.indexOf(a.Parque) < 0) parquesVistos.push(a.Parque);
      a.Ordem_Parque = parquesVistos.indexOf(a.Parque) + 1;
      delete a._grupo; delete a._num;
    });
    return { ordens: ordens, ativos: lista };
  }

  /**
   * A mesma troca lançada em duas OMs da mesma turbina (a preventiva lista em "Pendências retiradas" a troca
   * que tem OM corretiva própria, ou um apontamento copiado de outra OM): conta uma vez só.
   * Mesma turbina e tipo de peça, serviço com até 3 dias de diferença: sai da OM que cita a outra pelo número
   * ou, se nenhuma cita, da preventiva.
   */
  function deduplicarEntreOMs(col, prev) {
    function diaServico(i) {
      var m, re = /\[(\d{2})\/(\d{2})\/(\d{4})/g, melhor = null;
      while ((m = re.exec(col.exec[i]))) { var t = Date.UTC(+m[3], +m[2] - 1, +m[1]) / DIA_MS; if (melhor === null || t > melhor) melhor = t; }
      return melhor;
    }
    var grupos = Object.create(null), dia = [];
    for (var i = 0; i < col.om.length; i++) {
      if (col.wtg[i] < 0 || !col.pecasItens[i].length) continue;
      dia[i] = diaServico(i);
      if (dia[i] === null) continue;
      col.pecasItens[i].forEach(function (it) { var k = col.wtg[i] + '|' + it[0]; (grupos[k] || (grupos[k] = [])).push(i); });
    }
    var tirar = [];
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k].filter(function (x, n, a) { return a.indexOf(x) === n; });
      for (var a = 0; a < g.length; a++) for (var b = a + 1; b < g.length; b++) {
        var x = g[a], y = g[b];
        if (Math.abs(dia[x] - dia[y]) > 3) continue;
        var citaY = new RegExp('(?:^|[^A-Za-z])OM\\W{0,3}0*' + col.om[y] + '(?!\\d)', 'i').test(col.exec[x]);
        var citaX = new RegExp('(?:^|[^A-Za-z])OM\\W{0,3}0*' + col.om[x] + '(?!\\d)', 'i').test(col.exec[y]);
        var sai = citaY && !citaX ? x : citaX && !citaY ? y : col.tipo[x] === prev && col.tipo[y] !== prev ? x : col.tipo[y] === prev && col.tipo[x] !== prev ? y : -1;
        if (sai >= 0) tirar.push([sai, +k.split('|')[1]]);
      }
    });
    tirar.forEach(function (t) {
      var i = t[0], c = t[1];
      for (var j = col.pecasItens[i].length - 1; j >= 0; j--) if (col.pecasItens[i][j][0] === c) { col.pecasItens[i].splice(j, 1); col.pecasTrecho[i].splice(j, 1); }
      col.pecas[i] = col.pecas[i].filter(function (x) { return x !== c; });
    });
  }

  /**
   * Refaz, num modelo já montado (base guardada no aparelho), o que depende das regras de leitura:
   * peças trocadas, falhas e custos atípicos. Usado quando VERSAO_PECAS muda.
   */
  function relerRegras(M) {
    var O = M.ordens, n = O.om.length;
    M.componentes = COMPONENTES.map(function (c) { return c[0]; });
    O.pecas = []; O.pecasItens = []; O.pecasTrecho = [];
    for (var i = 0; i < n; i++) {
      var r = componentesTrocados(O.exec[i]);
      O.pecas.push(r.ids); O.pecasItens.push(r.itens); O.pecasTrecho.push(r.trechos);
    }
    deduplicarEntreOMs(O, M.dic.tipo.indexOf('Preventiva'));
    var fx = extrairFalhas(O.desc);
    M.falhas = fx.rotulos; O.falhas = fx.falhas;
    O.atipico = O.custoTot.map(function (c, i) { return custoAtipico(c, O.desc[i], O.exec[i]); });
    M.versaoPecas = VERSAO_PECAS;
    return M;
  }

  /** Lê o workbook (SheetJS) e devolve o modelo colunar. */
  function montar(wb, XLSX) {
    var ordens, ativos, apont = [], mov = [], tiposAp = [];
    if (wb.Sheets[ABA_MANUSIS]) {
      var mn = deManusis(wb, XLSX);
      ordens = mn.ordens; ativos = mn.ativos;
    } else {
      ordens = linhas(wb, XLSX, 'fato_ordens', true);
      ativos = linhas(wb, XLSX, 'dim_ativo', true)
        .sort(function (a, b) { return (a.WTG_Seq || 0) - (b.WTG_Seq || 0); });
      apont = linhas(wb, XLSX, 'fato_apontamentos');
      mov = linhas(wb, XLSX, 'fato_movimentacao_status');
      tiposAp = linhas(wb, XLSX, 'dim_tipo_apontamento');
    }
    if (!ordens.length) throw new Error('A planilha não tem ordens de manutenção.');

    var minSerial = Infinity, maxSerial = -Infinity;
    ordens.forEach(function (r) {
      var s = serial(r.Data_Abertura);
      if (s !== null) { minSerial = Math.min(minSerial, s); maxSerial = Math.max(maxSerial, s); }
    });
    var anoBase = new Date(EPOCA_EXCEL + minSerial * DIA_MS).getUTCFullYear();
    var origem = (Date.UTC(anoBase, 0, 1) - EPOCA_EXCEL) / DIA_MS;
    function dia(v) { var s = serial(v); return s === null ? null : Math.floor(s) - origem; }

    var parques = [];
    ativos.slice().sort(function (a, b) { return (a.Ordem_Parque || 0) - (b.Ordem_Parque || 0); })
      .forEach(function (a) { if (parques.indexOf(a.Parque) < 0) parques.push(a.Parque); });
    // complexo de cada parque (a base Power BI antiga não traz: deduz do nome do parque)
    function complexoDe(a) { return a && a.Complexo ? a.Complexo : a && /^Asa Branca/.test(a.Parque) ? 'Asa Branca' : 'Complexo'; }
    var complexos = [];
    ativos.forEach(function (a) { var c = complexoDe(a); if (complexos.indexOf(c) < 0) complexos.push(c); });

    var d = {
      wtg: new Dic(ativos.map(function (a) { return a.WTG; })),
      status: new Dic(ETAPAS.concat(['Fechadas', 'Canceladas'])),
      grupo: new Dic(['Concluída', 'Backlog', 'Cancelada']),
      tipo: new Dic(['Preventiva', 'Corretiva', 'Performance', 'Inspeção', 'Field Services', 'Outros']),
      natureza: new Dic(), sistema: new Dic(),
      faixa: new Dic(['0-30 dias', '31-60 dias', '61-90 dias', '>90 dias']),
      entrega: new Dic(['No prazo', 'Atrasada', 'Em aberto', 'Sem prazo definido']),
      espera: new Dic(), cancel: new Dic(), pessoa: new Dic(),
      tipoAp: new Dic(tiposAp.map(function (t) { return t.Tipo_Apontamento; }))
    };

    // horas em cada etapa do fluxo de status, por OM
    // OMs ainda na etapa: conta o tempo corrido até a última movimentação registrada
    var agora = -Infinity;
    mov.forEach(function (m) { var s = serial(m.DataHora_Entrada); if (s !== null && s > agora) agora = s; });
    var etapaH = Object.create(null);
    mov.forEach(function (m) {
      var k = ETAPAS.indexOf(m.Status), h = num(m.Horas_No_Status, 1);
      if (h === null && m.Status_Atual === 'Sim' && serial(m.DataHora_Entrada) !== null) h = num((agora - serial(m.DataHora_Entrada)) * 24, 1);
      if (k < 0 || h === null) return;
      var e = etapaH[m.OM] || (etapaH[m.OM] = [null, null, null, null]);
      e[k] = (e[k] || 0) + h;
    });

    var col = {};
    CAMPOS.forEach(function (c) { col[c] = []; });
    var idxOM = Object.create(null);

    ordens.forEach(function (r, i) {
      idxOM[r.OM] = i;
      var omNum = r.OM_Num != null ? r.OM_Num : parseInt(String(r.OM).replace(/\D/g, ''), 10);
      var e = etapaH[r.OM] || [null, null, null, null];
      var custo = num(r.Custo_Total);
      var v = {
        om: omNum, status: d.status.id(r.Status), grupo: d.grupo.id(r.Grupo_Status), tipo: d.tipo.id(r.Tipo_Servico),
        natureza: d.natureza.id(r.Natureza_Servico), wtg: d.wtg.id(r.WTG), sistema: d.sistema.id(r.Sistema),
        parada: r.Maquina_Parada === 'Sim' ? 1 : 0, dAb: dia(r.Data_Abertura), dFe: dia(r.Data_Fechamento), dCa: dia(r.Data_Cancelamento),
        leadH: num(r.Lead_Time_h), idadeBkl: num(r.Idade_Backlog_dias, 1), faixa: d.faixa.id(r.Faixa_Idade_Backlog),
        entrega: d.entrega.id(r.Entrega_No_Prazo), hhPrev: num(r.Hh_Previsto), hhReal: num(r.Hh_Real),
        hhApont: num(r.Hh_Apontado), hhProd: num(r.Hh_Produtivo), custoMO: num(r.Custo_MO),
        custoMat: num(r.Custo_Material), custoTot: custo, espera: d.espera.id(r.Motivo_Espera),
        cancel: d.cancel.id(r.Motivo_Cancelamento), resp: d.pessoa.id(r.Mantenedor_Responsavel),
        reprog: r.Reprogramada === 'Sim' ? 1 : 0, ckItens: num(r.Checklist_Itens, 0), ckResp: num(r.Checklist_Respondidos, 0),
        durH: num(r.Duracao_Servico_h), ateInicioH: num(r.Tempo_Ate_Inicio_h, 1),
        eAbertas: num(e[0], 1), eProg: num(e[1], 1), eEspera: num(e[2], 1), eApont: num(e[3], 1),
        desc: texto(r.Descricao), exec: texto(r.Servico_Executado),
        obsEspera: texto(r.Obs_Motivo_Espera), obsCancel: texto(r.Obs_Cancelamento),
        pecas: null, pecasItens: null, pecasTrecho: null, falhas: null,
        atipico: custoAtipico(custo, r.Descricao, r.Servico_Executado),
        tecnicos: num(r.Qtd_Tecnicos, 0)
      };
      var comp = componentesTrocados(v.exec);
      v.pecas = comp.ids; v.pecasItens = comp.itens; v.pecasTrecho = comp.trechos;
      CAMPOS.forEach(function (c) { col[c].push(v[c]); });
    });

    deduplicarEntreOMs(col, d.tipo.pos['Preventiva']);

    var fal = extrairFalhas(col.desc);
    col.falhas = fal.falhas;

    var ap = {};
    CAMPOS_AP.forEach(function (c) { ap[c] = []; });
    apont.forEach(function (a) {
      var o = idxOM[a.OM], h = num(a.Horas);
      if (o === undefined || h === null) return;
      ap.ordem.push(o); ap.pessoa.push(d.pessoa.id(a.Mantenedor)); ap.tipoAp.push(d.tipoAp.id(a.Tipo_Apontamento));
      ap.dia.push(dia(a.Data)); ap.horas.push(h);
    });

    var categoriaAp = d.tipoAp.itens.map(function (t) {
      var achou = tiposAp.filter(function (x) { return x.Tipo_Apontamento === t; })[0];
      return achou ? achou.Categoria : 'Apoio';
    });

    var dic = {};
    Object.keys(d).forEach(function (k) { dic[k] = d[k].itens; });
    return {
      versao: 1,
      versaoPecas: VERSAO_PECAS,
      gerado: new Date().toISOString(),
      origem: new Date(Date.UTC(anoBase, 0, 1)).toISOString().slice(0, 10),
      ultimoDia: Math.floor(maxSerial) - origem,
      parques: parques,
      complexos: complexos,
      parqueComplexo: parques.map(function (p) {
        var a = ativos.filter(function (x) { return x.Parque === p; })[0];
        return complexos.indexOf(complexoDe(a));
      }),
      ativos: ativos.map(function (a) {
        return { wtg: d.wtg.id(a.WTG), parque: parques.indexOf(a.Parque), pos: a.Posicao_No_Parque, modelo: a.Modelo };
      }),
      dic: dic,
      categoriaAp: categoriaAp,
      componentes: COMPONENTES.map(function (c) { return c[0]; }),
      falhas: fal.rotulos,
      etapas: ETAPAS,
      ordens: col,
      apont: ap
    };
  }

  return { montar: montar, relerRegras: relerRegras, custoAtipico: custoAtipico, deManusis: deManusis, textoManusis: textoManusis, extrairFalhas: extrairFalhas, componentesTrocados: componentesTrocados, COMPONENTES: COMPONENTES, VERSAO_PECAS: VERSAO_PECAS, CAMPOS: CAMPOS, CAMPOS_AP: CAMPOS_AP };
});
