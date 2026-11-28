/*
 * Consulta de OMs: monta os dados do painel a partir das planilhas do Manusis
 * (OMs, consumo de materiais e pendências; base única ou arquivos separados, de um ou vários anos).
 * Roda no navegador (window.ConsultaDados) e no Node (scripts/gerar-consulta.js).
 * Arquivos depois na lista prevalecem: a OM e a pendência pelo número, o consumo pela OM inteira.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ConsultaDados = fabrica();
})(this, function () {
  'use strict';

  // ---- segunda leitura do serviço executado -----------------------------------------
  // A conferência do Painel de Turbinas lê "substituído / trocado". Aqui, para cada peça consumida que
  // ficou sem troca no texto, procura a peça (pelo nome ou apelido: anel coletor = slip) com um verbo
  // de troca ou instalação na mesma frase ("instalar um slip novo", "instalado botoeiras").
  // Segunda leitura do serviço executado: a peça consumida aparece no texto junto de um verbo de troca/instalação?
  function semAc(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  // apelidos: o nome do almoxarifado × como o técnico escreve
  var APELIDOS = [
    [/ANEL COLETOR|SLIP/, ['slip', 'anel coletor', 'coletor']],
    [/ESCOVA/, ['escova']],
    [/BATERIA/, ['bateria', 'banco de bateria', 'baterias']],
    [/ENCODER|CODIFICADOR/, ['encoder', 'enconder', 'encorder', 'encode', 'codificador']],
    [/MANG/, ['mangueira', 'mangote']],
    [/ACELEROMETRO|ACCLRM/, ['acelerometro', 'sensor de vibracao']],
    [/BOTOEIRA/, ['botoeira', 'botoeiras', 'controle da talha']],
    [/FUSIVEL/, ['fusivel', 'fusiveis']],
    [/DISJUNTOR/, ['disjuntor']],
    [/CONTATOR/, ['contator', 'contatora']],
    [/RELE\b/, ['rele']],
    [/FILTRO|ELEMENTO FILTRANTE/, ['filtro', 'elemento filtrante']],
    [/ROLAMENTO/, ['rolamento']],
    [/MOTOR/, ['motor']],
    [/PASTILHA|PUCK|LONA/, ['pastilha', 'pucks', 'puck', 'lona']],
    [/FREIO/, ['freio']],
    [/RESPIRADOR|DESSECANTE/, ['respirador', 'dessecante', 'silica']],
    [/CARREGADOR/, ['carregador']],
    [/FONTE/, ['fonte']],
    [/ANEMOMETRO|ULTRASS/, ['anemometro', 'sensor de vento', 'ultrassonico']],
    [/BIRUTA|WIND VANE/, ['biruta', 'wind vane']],
    [/LAMPADA|LUMINARIA|REFLETOR|AVIATION|BALIZAMENTO/, ['lampada', 'luminaria', 'refletor', 'aviation', 'balizamento', 'iluminacao']],
    [/VALVULA/, ['valvula']],
    [/BOMBA/, ['bomba']],
    [/VENTILADOR|VENTOINHA|EXAUSTOR/, ['ventilador', 'ventoinha', 'exaustor', 'cooler']],
    [/TERMOSTATO/, ['termostato']], [/PRESSOSTATO/, ['pressostato']], [/RESISTENCIA|AQUECEDOR/, ['resistencia', 'aquecedor']],
    [/UPS|NOBREAK/, ['ups', 'nobreak']], [/TOMADA/, ['tomada']], [/CABO/, ['cabo', 'chicote']], [/CONECTOR/, ['conector']],
    [/PLACA|CARTAO|\bW[A-Z]{3}\b|\bAE[A-Z]{2}\b/, ['placa', 'cartao']],
    [/SHUNT/, ['shunt']], [/TIRISTOR|THYRISTOR/, ['tiristor', 'thyristor']], [/IGBT/, ['igbt']],
    [/ACUMULADOR/, ['acumulador']], [/HIDRAUL|UNIDADE POTENCIA HID|HPU/, ['hpu', 'unidade hidraulica']],
    [/TRAVA/, ['trava']], [/PARAFUSO/, ['parafuso']], [/VEDA|O RING|ORING|RETENTOR|GAXETA/, ['vedacao', 'o-ring', 'oring', 'retentor', 'gaxeta', 'anel de vedacao']],
    [/SENSOR/, ['sensor']], [/CHAVE FIM|FIM DE CURSO|LIMIT SWITCH/, ['fim de curso', 'limit switch', 'chave fim']],
    [/TRANSFORMADOR/, ['transformador', 'trafo']], [/ESCOTILHA/, ['escotilha']], [/TRAVA DISCO|ROTOR LOCK/, ['rotor lock', 'trava do rotor']]
  ];
  var GENERICAS = /^(motor|sensor|placa|cabos|rotor|disco|eixo|axis|blade|flange|gearbox|multiplicadora|conversor|motores|eletrico|eletrica|conjunto|conj|kit|para|com|sem|unidade|peca|pecas|material|modulo|tipo|modelo|ref|cod|novo|nova|preto|branco|vermelho|azul|base|alta|baixa|media|pol|mm|metro|metros|gerador|pitch|sistema)$/;
  // verbos e marcas de troca/instalação (com erros comuns de digitação)
  var VERBO = /substitu|subistitu|sustitu|troc|instal|(?<!re)colocad|coloquei|colocamos|(?<!re)colocac|aplicad|aplicamos|repost|reposic|inserid|swap|efetuad[oa] a troca|feit[oa] a troca|realizad[oa] a troca/;
  // apelidos genéricos só valem quando são o nome principal da peça (as 2 primeiras palavras):
  // "ENCODER CODIFICADOR MOTOR PITCH" não é motor
  var CABECA = /^(MOTOR|SENSOR|CABO|CONECTOR|FREIO|VALVULA|BOMBA|FONTE|FILTRO|FUSIVEL|PARAFUSO|TRAVA|RELE)/;
  function apelidosDe(nome) {
    var N = String(nome || '').toUpperCase(), desc = N.replace(/^[A-Z0-9_.]+(?:-\d{3,5}[A-Z]?)?-/, '').trim();
    var cab = desc.split(/\s+/).slice(0, 2).join(' '), out = [];
    var add = function (w) { if (out.indexOf(w) < 0) out.push(w); };
    // placa com código (AEPS, WEPA, WECA…): só o código identifica a peça certa
    var cod = desc.match(/\b(W[A-Z]{3}|AE[A-Z]{2})\b/g);
    if (cod && /PLACA|MODULO|CARTAO|CONJUNTO PLACA/.test(desc)) { cod.forEach(function (c) { add(c.toLowerCase()); }); return out; }
    APELIDOS.forEach(function (a) {
      if (!a[0].test(desc)) return;
      var src = a[0].source.replace(/\\b/g, '');
      if (CABECA.test(src) && !a[0].test(cab)) return;
      a[1].forEach(add);
    });
    semAc(desc).split(/[^a-z]+/).forEach(function (w) { if (w.length >= 5 && !GENERICAS.test(w)) add(w); });
    return out;
  }
  // o texto cita a peça (apelido) num trecho que também tem verbo de troca/instalação?
  function trocaNoTexto(exec, nome) {
    var t = semAc(exec);
    if (!t.trim()) return null;
    // frases de rotina que citam a peça sem trocar: "teste de baterias", "sem necessidade de troca"
    t = t.replace(/(realizad[oa]s? )?(o |os )?testes? (de|das|nas|com as) bateria\w*/g, ' ').replace(/(sem|nao|n[aã]o houve|nao foi) (necessidade de )?(substitu|troc)\w*/g, ' ');
    var ap = apelidosDe(nome); if (!ap.length) return false;
    // palavras genéricas (placa, cabo, sensor…) pedem o verbo bem colado; negações anulam o trecho
    var GENERICO = /^(placa|cartao|cabo|sensor|motor|fusivel|fusiveis|conector|parafuso|freio|valvula|bomba|fonte|filtro)$/;
    var NEGA = /nao (foi|temos|tem|ha|havia|houve|possui)|sem (estoque|disponibilidade|peca)|aguardando|falta de|faltando|nao disponivel/;
    // o verbo precisa estar na mesma frase e a até 70 letras da peça
    var frases = t.split(/[.;!?\n|]|(?=usuario:)/);
    for (var f = 0; f < frases.length; f++) {
      var fr = frases[f];
      for (var j = 0; j < ap.length; j++) {
        var p = -1;
        var r = GENERICO.test(ap[j]) ? 35 : 70;
        while ((p = fr.indexOf(ap[j], p + 1)) >= 0) {
          var jan = fr.slice(Math.max(0, p - r), p + ap[j].length + r);
          if (VERBO.test(jan) && !NEGA.test(jan)) return true;
        }
      }
    }
    return false;
  }

  /** livros: planilhas já abertas com XLSX.read. Devolve { D, resumo }. */
  function montar(livros, XLSX, Modelo) {
  function numOM(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    return d ? parseInt(d, 10) : 0;
  }
  function numBR(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  function dataISO(v) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto(v));
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }
  function curtoAtivo(a) {
    a = texto(a);
    var m = /Aerogerador\s+(.+)$/i.exec(a);
    if (m) return m[1].trim();
    return a.replace(/^[A-Z0-9]+-\d{3,4}-[A-Z]{2,4}-/, '') || a;
  }
  function curtoParque(p) {
    p = texto(p);
    return p ? p.replace(/^SITE-[A-Z]+-/, '').replace(/^EOL\s+/, '').replace(/Piaui$/, 'Piauí') : '(sem parque)';
  }

  // ---- leitura -------------------------------------------------------------------------
  var linhasOM = {}, linhasCons = {}, linhasPend = {};
  livros.forEach(function (wb) {
    wb.SheetNames.forEach(function (nome) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: null, raw: true });
      if (/^Ordens de manuten/i.test(nome)) rows.forEach(function (r) { var n = numOM(r['Número de ordem']); if (n) linhasOM[n] = r; });
      else if (/^Consumo de materiais/i.test(nome)) {
        // o consumo de cada OM vem inteiro do arquivo mais recente que a cita
        var porOM = {};
        rows.forEach(function (r) { var n = numOM(r['Ordem de manutenção']); if (n) (porOM[n] = porOM[n] || []).push(r); });
        Object.keys(porOM).forEach(function (n) { linhasCons[n] = porOM[n]; });
      } else if (/^Pend/i.test(nome)) rows.forEach(function (r) { var n = texto(r['Número']); if (n) linhasPend[n] = r; });
    });
  });
  var nums = Object.keys(linhasOM).map(Number).sort(function (a, b) { return a - b; });
  if (!nums.length) throw new Error('Nenhuma OM encontrada. Escolha a exportação de ordens de manutenção do Manusis (aba "Ordens de manutenção") ou a base única.');

  // ---- dicionários ---------------------------------------------------------------------
  function Dic() { this.lista = []; this.idx = {}; }
  Dic.prototype.id = function (v) { if (!(v in this.idx)) { this.idx[v] = this.lista.length; this.lista.push(v); } return this.idx[v]; };
  var dStatus = new Dic(), dParque = new Dic(), dAtivo = new Dic(), dAtivoNome = {}, dTipo = new Dic(), dMat = new Dic(), dStPend = new Dic();

  var O = { om: [], st: [], pq: [], at: [], dt: [], dp: [], df: [], tp: [], desc: [], exec: [], fl: [], cmCol: [] };
  var posOM = {};
  nums.forEach(function (n, i) {
    var r = linhasOM[n];
    posOM[n] = i;
    O.om.push(n);
    O.st.push(dStatus.id(texto(r['Status']) || '(sem status)'));
    O.pq.push(dParque.id(curtoParque(r['Localização 2'])));
    var curto = curtoAtivo(r['Ativo']) || '(sem ativo)';
    O.at.push(dAtivo.id(curto));
    dAtivoNome[curto] = texto(r['Ativo']);
    O.dt.push(dataISO(r['Data de abertura']));
    O.dp.push(dataISO(r['Data de início da programação']));
    O.df.push(dataISO(r['Data de fechamento']));
    O.tp.push(dTipo.id(texto(r['Tipo de serviço']) || '(sem tipo)'));
    O.desc.push(texto(r['Descrição']));
    O.exec.push(texto(r['Serviço executado']));
    O.cmCol.push(Math.round(numBR(r['Custo de material']) * 100) / 100);
  });
  var falhas = Modelo.extrairFalhas(O.desc);
  O.fl = falhas.falhas;

  // ---- consumo -------------------------------------------------------------------------
  var UN_GRANEL = /^(L|LT|LITRO|KG|ML|M|MT)$/i;
  var MATERIAL_GRANDE = /GERADOR|GEARBOX|MULTIPLICADORA|TRANSFORMADOR|MAIN ?BEARING|ROLAMENTO PRINCIPAL|MAIN ?SHAFT|EIXO PRINCIPAL|\bPAS?\b|BLADE|CONVERSOR|NACELE/i;
  // mesmas regras do Painel de Turbinas (modelo.js): material de consumo não é peça trocada
  var FAMILIA_CONSUMIVEL = /MATERIAL DE CONSUMO|CONSUMIVEL/i;
  var NOME_CONSUMIVEL = /LOCTITE|ADESIVO|\bFITA\b|SPRAY|COMPOSTO|\bARAME\b|SILICONE|DESENGRIP|TRAPO|GRAXA|[AÁ]LCOOL|LIMPA|\bCOLA\b|\bTINTA\b|\bLUVAS?\b/i;
  var C = { o: [], m: [], q: [], u: [], v: [], s: [], d: [], cf: [] };
  var cons = [];
  Object.keys(linhasCons).forEach(function (n) {
    if (!(n in posOM)) return;
    linhasCons[n].forEach(function (r) {
      var familia = texto(r['Família de materiais']) + ' ' + texto(r['Complemento']), nomeM = texto(r['Material']);
      cons.push({ o: posOM[n], nome: nomeM, q: numBR(r['Quantidade']), u: texto(r['Unidade de medida']),
        peca: (FAMILIA_CONSUMIVEL.test(familia) && !/MERCADORIA|GRANDE COMPONENTE/i.test(familia)) || NOME_CONSUMIVEL.test(nomeM) ? 0 : 1,
        vu: numBR(r['Custo unitário']), v: numBR(r['Custo total']), d: dataISO(r['Utilizado em']) });
    });
  });
  var precos = {};
  cons.forEach(function (c) { if (c.vu > 0) (precos[c.nome] = precos[c.nome] || []).push(c.vu); });
  var mediana = {};
  Object.keys(precos).forEach(function (m) { var a = precos[m].sort(function (x, y) { return x - y; }); mediana[m] = a[Math.floor((a.length - 1) / 2)]; });
  cons.sort(function (a, b) { return a.o - b.o; }).forEach(function (c) {
    var susp = (c.v >= 2e6 && !MATERIAL_GRANDE.test(c.nome)) || (UN_GRANEL.test(c.u) && c.vu >= 5000) ||
      (mediana[c.nome] > 0 && c.vu > 20 * mediana[c.nome] && c.v >= 50000);
    C.o.push(c.o); C.m.push(dMat.id(c.nome)); C.q.push(Math.round(c.q * 1000) / 1000); C.u.push(c.u);
    C.v.push(Math.round(c.v * 100) / 100); C.s.push(susp ? 1 : 0); C.d.push(c.d);
    C.cf.push(c.peca ? 0 : 2); // 0 confirmada · 1 peça sem troca no texto · 2 consumível/acessório · 3 tipo não reconhecido
  });

  // ---- conferência: peças que o serviço executado diz que trocou × peças consumidas ------
  // Peças do texto pelo modelo do Painel de Turbinas (já sem a mesma troca lançada em duas OMs).
  // todas as OMs (de um ou vários arquivos) numa planilha só, no formato da exportação do Manusis
  var livroOM = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livroOM, XLSX.utils.json_to_sheet(nums.map(function (n) { return linhasOM[n]; })), 'Ordens de manutenção');
  var M = Modelo.montar(livroOM, XLSX);
  var COMP = M.componentes, OUTRAS = COMP.length - 1;
  var itensPorOM = {};
  M.ordens.om.forEach(function (n, j) { itensPorOM[n] = M.ordens.pecasItens[j]; });
  var ACESS = [COMP.indexOf('Parafusos / fixação'), COMP.indexOf('Óleo / graxa')];
  var JUNTOS = [['Slip ring', 'Escovas'], ['Bateria', 'Carregador / fonte', 'UPS / nobreak'], ['Linha de vida', 'Cabo / conector']];
  function junto(a, c) { return a === c || JUNTOS.some(function (g) { return g.indexOf(COMP[a]) >= 0 && g.indexOf(COMP[c]) >= 0; }); }
  var catCache = {};
  function catsBaixa(k) {
    var nome = dMat.lista[C.m[k]];
    if (/ESCOVA/i.test(nome)) return [COMP.indexOf('Escovas')];
    return catCache[nome] || (catCache[nome] = Modelo.categoriasMaterial(nome));
  }
  var porOMc = {};
  C.o.forEach(function (o, k) { (porOMc[o] = porOMc[o] || []).push(k); });
  var idxFech = dStatus.lista.indexOf('Fechadas');
  O.pi = []; O.se = [];
  var SELOS = ['', 'ok', 'parcial', 'diverge', 'soTexto', 'soBaixa'];
  nums.forEach(function (n, i) {
    var itens = itensPorOM[n] || [], ks = (porOMc[i] || []).filter(function (k) { return C.cf[k] === 0; });
    var fechada = O.st[i] === idxFech, texto = itens.length > 0, peloTitulo = false;
    var cod = itens.map(function () { return 1; }); // 0 confirmada · 1 sem consumo · 2 conferir
    var batem = 0, baixaOk = 0, semTexto = 0, semTipo = 0, acess = 0;
    if (!texto && ks.length && /substitui|\btroca|\btrocad/i.test(O.desc[i])) texto = peloTitulo = true;
    if (ks.length) {
      var tipados = itens.filter(function (it) { return it[0] !== OUTRAS; }), achados = [];
      var geral = peloTitulo || (texto && !tipados.length);
      ks.forEach(function (k) {
        var cb = catsBaixa(k).filter(function (c) { return c >= 0; });
        var ac = cb.length && cb.every(function (c) { return ACESS.indexOf(c) >= 0; });
        if (!texto) { if (ac) { C.cf[k] = 2; acess++; } else { C.cf[k] = 1; semTexto++; } return; }
        if (geral) { baixaOk++; return; }
        if (!cb.length) { C.cf[k] = 3; semTipo++; return; }
        var bate = false;
        tipados.forEach(function (it) { if (cb.some(function (c) { return junto(it[0], c); })) { bate = true; if (achados.indexOf(it[0]) < 0) achados.push(it[0]); } });
        if (bate) baixaOk++; else if (ac) { C.cf[k] = 2; acess++; } else { C.cf[k] = 1; semTexto++; }
      });
      itens.forEach(function (it, j) {
        if (geral) cod[j] = 0;
        else if (it[0] === OUTRAS) cod[j] = 2;
        else if (achados.indexOf(it[0]) >= 0) { cod[j] = 0; batem++; }
        else cod[j] = semTipo ? 2 : 1;
      });
    }
    var nb = ks.length - acess;
    if (!nb) cod = itens.map(function () { return 1; });
    var selo = !texto ? (nb ? 'soBaixa' : '') : !nb ? (fechada ? 'soTexto' : '') :
      (!batem && !baixaOk && semTexto) ? 'diverge' : (semTexto || (fechada && cod.indexOf(1) >= 0)) ? 'parcial' : 'ok';
    O.pi.push(itens.map(function (it, j) { return [it[0], it[1], cod[j]]; }));
    O.se.push(SELOS.indexOf(selo));
  });
  // segunda leitura: peça consumida "sem troca no texto" que o texto cita com verbo de troca vira confirmada;
  // OM sem serviço executado ganha aviso próprio (4) — não dá para conferir
  SELOS.push('semExec');
  var mudou = {};
  C.cf.forEach(function (v, k) {
    if (v !== 1) return;
    var i = C.o[k], r = trocaNoTexto(O.exec[i], dMat.lista[C.m[k]]);
    if (r === null) { C.cf[k] = 4; mudou[i] = 1; } else if (r) { C.cf[k] = 0; mudou[i] = 1; }
  });
  Object.keys(mudou).forEach(function (i) {
    i = +i;
    var sem = 0, vazio = 0;
    (porOMc[i] || []).forEach(function (k) { if (C.cf[k] === 1) sem++; if (C.cf[k] === 4) vazio++; });
    if (sem) return;
    var se = SELOS[O.se[i]], fechada = O.st[i] === idxFech, nc = O.pi[i].some(function (it) { return it[2] === 1; });
    if (vazio && !O.pi[i].length) O.se[i] = SELOS.indexOf('semExec');
    else if (se === 'soBaixa' || se === 'diverge' || se === 'parcial') O.se[i] = SELOS.indexOf(fechada && nc ? 'parcial' : 'ok');
  });

  // ---- pendências ----------------------------------------------------------------------
  var P = { n: [], desc: [], st: [], ori: [], exe: [], dt: [], at: [], us: [], dc: [], pq: [], eq: [] };
  Object.keys(linhasPend).sort(function (a, b) { return +a - +b; }).forEach(function (k) {
    var r = linhasPend[k];
    var ori = numOM(r['OM de origem']), exe = numOM(r['OM de execução']);
    P.n.push(k); P.desc.push(texto(r['Descrição'])); P.st.push(dStPend.id(texto(r['Status']) || '(sem status)'));
    P.ori.push(ori in posOM ? posOM[ori] : -1); P.exe.push(exe in posOM ? posOM[exe] : -1);
    P.dt.push(dataISO(r['Data de abertura'])); P.at.push(curtoAtivo(r['Ativo']));
    P.us.push(texto(r['Usuário']) || '(sem usuário)'); P.dc.push(dataISO(r['Data de conclusão']));
    P.pq.push(dParque.id(curtoParque(r['Localização 2'])));
    P.eq.push(texto(r['Equipe da OM de execução']) || texto(r['Equipe da OM de origem']));
  });

  var datas = O.dt.filter(Boolean).sort();
  var D = {
    gerado: new Date().toISOString().slice(0, 10),
    periodo: [datas[0], datas[datas.length - 1]],
    status: dStatus.lista, parques: dParque.lista, ativos: dAtivo.lista,
    ativosNome: dAtivo.lista.map(function (a) { return dAtivoNome[a] || a; }),
    tipos: dTipo.lista, falhas: falhas.rotulos, componentes: COMP, materiais: dMat.lista, statusPend: dStPend.lista,
    O: O, C: C, P: P
  };
    var resumo = { oms: O.om.length, consumo: C.o.length, suspeitos: C.s.reduce(function (a, b) { return a + b; }, 0), pendencias: P.n.length, periodo: D.periodo };
    return { D: D, resumo: resumo };
  }

  /** Abas que a planilha tem: para avisar quando o arquivo não é do Manusis. */
  function abasReconhecidas(wb) {
    return wb.SheetNames.filter(function (n) { return /^Ordens de manuten|^Consumo de materiais|^Pend/i.test(n); });
  }

  return { montar: montar, abasReconhecidas: abasReconhecidas };
});
