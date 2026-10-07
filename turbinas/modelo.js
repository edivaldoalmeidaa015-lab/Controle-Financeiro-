/*
 * Modelo de dados do Painel de Turbinas.
 * Converte a planilha "Base_PowerBI_Ordens" (tabelas fato_* e dim_*) num modelo
 * colunar compacto. Roda no navegador (window.ModeloTurbinas) e no Node.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ModeloTurbinas = fabrica();
})(this, function () {
  'use strict';

  var DIA_MS = 864e5;
  var EPOCA_EXCEL = Date.UTC(1899, 11, 30);
  // Custo acima disto é tratado como valor atípico da origem (ver aba LEIA-ME).
  var LIMITE_CUSTO_ATIPICO = 10e6;
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
    ['Placa eletrônica', /^(placas?|ae[a-z]{2}|we[a-z]{2}|card|cartao|clp|usca)$/],
    ['Encoder', /^enco[l]?ders?$|^encode$/],
    ['Motor', /^motor(es)?$|^motoredutor/],
    ['Sensor', /^sensor(es)?$|^sendor(es)?$|^pt100$|^termostato$|^pressostato$|^acelerometros?$|^transdutor(es)?$/],
    ['Anemômetro / biruta', /^anemometros?$|^biruta$/, /^(wind vane|wind sensor|sensor wind|sensor de vento)$/],
    ['Fusível', /^fus[iy]ve(l|is)$|^porta-fus/, /^porta fus/],
    ['Disjuntor', /^disjuntor(es)?$|^breaker$|^q\d{1,2}$/],
    ['Contatora / relé', /^contator(a|as|es)?$|^contactor(a|as|es)?$|^reles?$|^relay$|^k\d{1,3}$/],
    ['UPS / nobreak', /^ups$|^nobreak$/],
    ['Bateria', /^baterias?$/],
    ['Carregador / fonte', /^carregador(es)?$|^fontes?$/],
    ['Cabo / conector', /^cabos?$|^rj45$|^conector(es)?$|^chicote$/],
    ['Slip ring', /^slip$|^slipring$|^slip-ring$/],
    ['Escovas', /^escovas?$/],
    ['Rolamento', /^rolamentos?$/],
    ['Filtro', /^filtros?$|^dessecante$|^cartucho$/, /^(elemento filtrante|elementos filtrantes)/],
    ['Óleo / graxa', /^oleo$|^graxa$|^lubrificante$/],
    ['Parafusos / fixação', /^parafusos?$|^porcas?$|^studs?$|^arruelas?$|^prisioneiros?$/],
    ['Bobina', /^bobinas?$/],
    ['Acumulador', /^ac+umulador(es)?$|^acumulado$/],
    ['Mangueira', /^mangueiras?$/],
    ['Freio (pastilhas / disco)', /^pastilhas?$|^lonas?$|^pucks?$|^brake$/, /^(brake pad|disco de freio|disco do freio)/],
    ['Ventilador', /^ventilador(es)?$|^fan$|^cooler$|^exaustor(es)?$/],
    ['Bomba', /^bombas?$/],
    ['Manômetro', /^manom[e]?n?tros?$/],
    ['Radiador', /^radiador(es)?$/],
    ['Lâmpada / iluminação', /^lampadas?$|^luminarias?$|^refletor(es)?$/],
    ['Supressor de surto', /^supressor(es)?$|^dps$/],
    ['Acoplamento', /^acoplamentos?$|^laminas?$/],
    ['Vedação / O-ring', /^o-?rings?$|^retentor(es)?$|^vedacao$|^juntas?$/],
    ['Válvula', /^valvulas?$|^solenoide$/],
    ['Chave / botoeira', /^chaves?$|^botoeira$|^botao$|^seletora$|^fim$/, /^fim de curso/],
    ['Conversor / IGBT', /^igbts?$|^conversor(es)?$|^inversor(es)?$/, /^power conver/],
    ['Switch / rede', /^switch$|^hirschmann$|^hrisman$|^hirchmann$/],
    ['Gancho / talha', /^gu?a?n?cho$|^gacho$|^guacho$|^guincho$|^talhas?$/],
    ['Linha de vida', /^$/, /^linha de vida/],
    ['Escada', /^escadas?$/],
    ['Redutora / gearbox', /^redutor(a|as|es)?$/],
    ['Outras peças', /^$/]
  ];
  var OUTRAS = COMPONENTES.length - 1;
  // verbos de troca JÁ REALIZADA (exclui infinitivo "substituir"/"trocar", que costuma ser recomendação)
  var VERBO = /^(substituicao|substituicoes|substituid[oa]s?|substitui|substituimos|substituiram|substituindo|troca|trocas|trocad[oa]s?|trocou|trocamos|trocaram|trocando|reposicao|repost[oa]s?|substitui-l[oa]s?|troca-l[oa]s?)$/;
  var PENDENTE = /\bnao\b.{0,35}\b(necessari|necessidade)|\bsem (necessidade|necessari)|\bnao (foi|foram|sera|houve)\b.{0,25}(substitu|troca)|aguardando|programar|programad|recomend|sugerid|sugere|solicitad|solicitar|pendente|necessita|(?<!foi |foram |sendo |fez-se |se fez )necessari\w* (a |realizar |fazer )?(a )?(substitu|troca)|sera (necessari\w* )?(substitu|troca)|devera|deve ser|precisa|importante/;
  // palavras que podem ficar entre o verbo e a peça
  var LIGA = /^(doas|de|do|da|dos|das|o|a|os|as|um|uma|uns|umas|no|na|nos|nas|em|e|novo|nova|novos|novas|dois|duas|tres|quatro|seis|oito|ambos|ambas|todos|todas|completa|completo|conjunto|kit|jogo|cinco|sete|nove|dez|doze|quinze|vinte|trinta|quarenta|cinquenta|cem|02|\d+|\d+o|x|\d+x|pc|pcs|unidades?|corretiva|preventiva|imediata|integral|total|parcial)$/;
  // o verbo aponta para algo já citado ("substituição do componente", "do mesmo")
  var GENERICO = /^(componentes?|pecas?|itens?|item|d?[ao]?mesm\w*|memos|equipamento|quais|qual|estes|estas|esses|essas|este|esta|esse|essa)$/;
  // palavras que não são peça: depois do verbo, indicam que não há objeto
  var NAO_PECA = /^(falhas?|turbinas?|wtg|maquina|aerogerador|atividades?|por|pela|pelo|para|como|junto|com|que|sendo|onde|devido|ou|reparo|liberad\w*|sanad\w*|necessari\w*|recente|seguida|porem|entanto|ainda|tambem|apos|mais|nao|foi|foram|e|em|esta|estava|sera|se|seu|sua|ja|todo|tudo|dia|hoje|ontem|axis|blade|pitch|hub|nacele|nacelle|yaw|gerador|gearbox|gbx|painel|top|box|circuito|sistema|preventivamente|corretivamente|imediat\w*|sanando|entao|acre?s+c?entad\w*|assim|sucessiv\w*|referid\w*|download|perda|segunda|terceira|primeira|nova|novamente)$/;
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
      String(t).replace(/\n(?=[a-z])/g, ' ').replace(RE_FALHA, function (_, cod, nome) { var n = nomeFalha(nome); if (n.length >= 3) r.push([+cod, n]); return _; });
      return r;
    });
    var conhecidos = {};
    brutas.forEach(function (r) { r.forEach(function (f) { conhecidos[f[0]] = true; }); });
    descricoes.forEach(function (t, i) {
      if (!t) return;
      String(t).replace(/\n(?=[a-z])/g, ' ').replace(RE_FALHA_HIFEN, function (_, cod, nome) {
        var n = nomeFalha(nome);
        if (conhecidos[+cod] && n.length >= 3 && !brutas[i].some(function (f) { return f[0] === +cod; })) brutas[i].push([+cod, n]);
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
    if (!texto) return { ids: ids, itens: itens, trechos: trechos };
    var frases = String(texto).split(/\n(?=\s*[\[\-•*A-ZÀ-Ú])|\n\s*\n|(?<=[.;!?])\s+|(?<=[a-z]\.)(?=[A-Z\d])/);
    var antesT = [], antesO = [];
    frases.forEach(function (frase) {
      // tokens originais (para o nome) e normalizados (para as regras), alinhados
      var bruto = frase.replace(/(^|\s)-+/g, ' | ').replace(/[,;:()\[\]]/g, ' | ')
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
      var trecho = frase.replace(/^\s*\[[^\]]{0,80}\]\s*/, '').trim().replace(/\s+/g, ' ').slice(0, 260);
      function anota(pos) {
        if (pos < 0) return -1;
        var c = componenteEm(T, pos), r = nomePeca(T, Or, pos);
        if (c < 0) c = OUTRAS;
        // mesma peça citada de novo ("Hirschmann" / "Hirschmann do Top Box"): fica o nome mais completo
        var novo = r[1].toLowerCase(), igual = -1;
        itens.forEach(function (it, x) { var vel = it[1].toLowerCase(); if (it[0] === c && (vel.indexOf(novo) === 0 || novo.indexOf(vel) === 0)) igual = x; });
        if (igual >= 0) { if (r[1].length > itens[igual][1].length) itens[igual][1] = r[1]; }
        else {
          itens.push([c, r[1]]); trechos.push(trecho);
          if (ids.indexOf(c) < 0) ids.push(c);
        }
        return r[0];
      }
      // trecho da oração até logo depois do verbo: "programar substituição", "não foi realizada a substituição"
      // (o que vem bem depois — "e será programado verificar o vazamento" — não anula a troca feita)
      function oracao(v) {
        var a = v, b = v;
        while (a > base && T[a - 1] !== '|') a--;
        while (b < T.length - 1 && T[b + 1] !== '|' && b < v + 3) b++;
        return T.slice(Math.max(base, a - 3), b + 1).join(' ');
      }
      for (var v = base; v < T.length; v++) {
        if (!VERBO.test(T[v]) || PENDENTE.test(oracao(v))) continue;
        var passiva = /^(substituid|trocad|repost)/.test(T[v]) && /^(foi|foram|sendo|sao|estao|sera)$/.test(T[v - 1] || '');
        // 1) objeto depois do verbo
        var k = v + 1;
        while (k < T.length && T[k] !== '|' && LIGA.test(T[k])) k++;
        var junto = T[k] === 'junto' && T[k + 1] === 'com';
        if (junto) { k += 2; while (k < T.length && LIGA.test(T[k])) k++; }
        var objeto = -1;
        if (componenteEm(T, k) >= 0) objeto = k;
        else if (ehSubstantivo(T[k]) && !passiva) {
          // "acrílico DA BOMBA", "case DO FILTRO": a categoria vem da peça logo adiante
          objeto = k;
        }
        if (objeto >= 0) {
          var fimNome = anota(objeto);
          if (componenteEm(T, objeto) < 0) {
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
    });
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

  /** Lê o workbook (SheetJS) e devolve o modelo colunar. */
  function montar(wb, XLSX) {
    var ordens = linhas(wb, XLSX, 'fato_ordens', true);
    var ativos = linhas(wb, XLSX, 'dim_ativo', true)
      .sort(function (a, b) { return (a.WTG_Seq || 0) - (b.WTG_Seq || 0); });
    var apont = linhas(wb, XLSX, 'fato_apontamentos');
    var mov = linhas(wb, XLSX, 'fato_movimentacao_status');
    var tiposAp = linhas(wb, XLSX, 'dim_tipo_apontamento');
    if (!ordens.length) throw new Error('A aba fato_ordens está vazia.');

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

    var d = {
      wtg: new Dic(ativos.map(function (a) { return a.WTG; })),
      status: new Dic(ETAPAS.concat(['Fechadas', 'Canceladas'])),
      grupo: new Dic(['Concluída', 'Backlog', 'Cancelada']),
      tipo: new Dic(['Preventiva', 'Corretiva', 'Performance', 'Inspeção', 'Field Services']),
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
        atipico: custo !== null && custo >= LIMITE_CUSTO_ATIPICO ? 1 : 0, tecnicos: num(r.Qtd_Tecnicos, 0)
      };
      var comp = componentesTrocados(v.exec);
      v.pecas = comp.ids; v.pecasItens = comp.itens; v.pecasTrecho = comp.trechos;
      CAMPOS.forEach(function (c) { col[c].push(v[c]); });
    });

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
      gerado: new Date().toISOString(),
      origem: new Date(Date.UTC(anoBase, 0, 1)).toISOString().slice(0, 10),
      ultimoDia: Math.floor(maxSerial) - origem,
      parques: parques,
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

  return { montar: montar, extrairFalhas: extrairFalhas, componentesTrocados: componentesTrocados, COMPONENTES: COMPONENTES, CAMPOS: CAMPOS, CAMPOS_AP: CAMPOS_AP };
});
