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
    'leadH', 'idadeBkl', 'faixa', 'entrega', 'hhPrev', 'hhReal', 'hhApont', 'hhProd', 'custoMO',
    'custoMat', 'custoTot', 'espera', 'cancel', 'resp', 'reprog', 'ckItens', 'ckResp', 'durH',
    'ateInicioH', 'eAbertas', 'eProg', 'eEspera', 'eApont', 'desc', 'exec', 'atipico', 'tecnicos', 'obsEspera', 'obsCancel', 'pecas', 'pecasTrecho'];
  var CAMPOS_AP = ['ordem', 'pessoa', 'tipoAp', 'dia', 'horas'];

  /*
   * Componentes substituídos, identificados no texto do "Serviço executado".
   * Regra: para cada verbo de troca já realizada ("substituição", "trocado", "foi
   * substituído"...), o componente é a primeira peça que vem logo depois do verbo
   * ("substituição DA PLACA aepa"), mais as ligadas por "e"/"," ("os rolamentos e o
   * encoder"). Se o verbo não tem objeto ("o encoder estava danificado, realizado a
   * substituição" / "o mesmo foi substituído"), vale a última peça citada antes dele.
   * Frases de recomendação ou pendência ("programar substituição", "aguardando troca",
   * "não foi necessário substituir") são ignoradas.
   * Cada regra: [nome, expressão sobre UMA palavra sem acento, expressão opcional p/ 2 palavras].
   */
  var COMPONENTES = [
    ['Placa eletrônica', /^(placas?|aepa|aead|aeps|aepb|aeaa|aebi|weca|weta|wetb|wetc|weda|card|cartao|clp|usca)$/],
    ['Encoder', /^encoders?$|^encode$/],
    ['Motor', /^motor(es)?$|^motoredutor/],
    ['Sensor', /^sensor(es)?$|^sendor(es)?$|^pt100$|^termostato$|^pressostato$|^acelerometros?$|^transdutor(es)?$/],
    ['Anemômetro / biruta', /^anemometros?$|^biruta$/, /^(wind vane|wind sensor|sensor wind|sensor de vento)$/],
    ['Fusível', /^fus[iy]ve(l|is)$/, /^porta fus/],
    ['Disjuntor', /^disjuntor(es)?$|^breaker$/],
    ['Contatora / relé', /^contator(a|as|es)?$|^contactor(a|as|es)?$|^reles?$|^relay$/],
    ['UPS / nobreak', /^ups$|^nobreak$/],
    ['Bateria', /^baterias?$/],
    ['Carregador / fonte', /^carregador(es)?$|^fontes?$/],
    ['Cabo / conector', /^cabos?$|^rj45$|^conector(es)?$|^chicote$/],
    ['Escovas / slip ring', /^escovas?$|^slipring$/, /^(slip ring|slip de)/],
    ['Rolamento', /^rolamentos?$/],
    ['Filtro', /^filtros?$|^dessecante$|^cartucho$/, /^(elemento filtrante|elementos filtrantes)/],
    ['Óleo / graxa', /^oleo$|^graxa$|^lubrificante$/],
    ['Parafusos / fixação', /^parafusos?$|^porcas?$|^studs?$|^arruelas?$|^prisioneiros?$/],
    ['Bobina', /^bobinas?$/],
    ['Acumulador', /^ac+umulador(es)?$/],
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
    ['Chave / botoeira', /^chaves?$|^botoeira$|^botao$|^fim$/, /^fim de curso/],
    ['Conversor / IGBT', /^igbts?$|^conversor(es)?$|^inversor(es)?$/, /^power conver/],
    ['Switch / rede', /^switch$|^hirschmann$|^hrisman$|^hirchmann$/],
    ['Gancho / talha', /^gu?a?n?cho$|^gacho$|^guacho$|^guincho$|^talhas?$/],
    ['Linha de vida', /^$/, /^linha de vida/],
    ['Escada', /^escadas?$/],
    ['Redutora / gearbox', /^redutor(a|as|es)?$/]
  ];
  // verbos de troca JÁ REALIZADA (exclui infinitivo "substituir"/"trocar", que costuma ser recomendação)
  var VERBO = /^(substituicao|substituicoes|substituid[oa]s?|substitui|substituimos|substituiram|substituindo|troca|trocas|trocad[oa]s?|trocou|trocamos|trocaram|trocando|reposicao|repost[oa]s?)$/;
  var PENDENTE = /\bnao\b.{0,35}\b(necessari|necessidade)|\bsem (necessidade|necessari)|\bnao (foi|foram|sera|houve)\b.{0,25}(substitu|troca)|aguardando|programar|programad|recomend|sugerid|sugere|solicitad|solicitar|pendente|necessita|necessario (a |realizar |fazer )?(a )?(substitu|troca)|sera (necessari\w* )?(substitu|troca)|devera|deve ser|precisa|importante/;
  // palavras que podem ficar entre o verbo e a peça
  var LIGA = /^(componentes?|pecas?|itens?|item|de|do|da|dos|das|o|a|os|as|um|uma|uns|umas|no|na|nos|nas|em|e|novo|nova|novos|novas|dois|duas|tres|quatro|seis|oito|ambos|ambas|todos|todas|completa|completo|conjunto|kit|jogo|mesmo|mesma|02|\d+|x|\d+x|pc|pcs|unidades?)$/;

  // palavras que iniciam outra ação na frase
  var ACAO = /^(feit[oa]s?|realizad[oa]s?|realizamos|efetuad[oa]s?|executad[oa]s?|inspecao|inspecionad\w*|verificad\w*|verificacao|testes?|testad\w*|limpeza|limpo|ajustad\w*|ajuste|reaperto|reapertad\w*|medicao|medid\w*|apos|seguida|liberad\w*|identificad\w*|constatad\w*|analise|retirad\w*|instalacao)$/;

  function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function componenteEm(toks, k) {
    var w = toks[k];
    if (!w || w === '|') return -1;
    var par = toks[k + 1] && toks[k + 1] !== '|' ? w + ' ' + toks[k + 1] + (toks[k + 2] && toks[k + 2] !== '|' ? ' ' + toks[k + 2] : '') : w;
    for (var c = 0; c < COMPONENTES.length; c++) {
      if (COMPONENTES[c][2] && COMPONENTES[c][2].test(par)) return c;
      if (COMPONENTES[c][1].test(w)) return c;
    }
    return -1;
  }

  /**
   * Peça citada antes do verbo. Prefere a que vem com artigo ("que O CARREGADOR da axis
   * 2 bateria 4 estava com defeito") — o resto costuma ser só a localização.
   */
  function sujeitoAntes(toks, v, antes) {
    var todos = (antes || []).concat(['|'], toks), fim = (antes || []).length + 1 + v;
    var perto = -1;
    for (var b = fim - 1; b >= Math.max(0, fim - 24); b--) {
      var c = componenteEm(todos, b);
      if (c < 0) continue;
      if (perto < 0) perto = c;
      if (/^(o|a|os|as|um|uma|que|no|na)$/.test(todos[b - 1] || '')) return c;
    }
    return perto;
  }

  /** Devolve {ids: [índices de COMPONENTES], trechos: [frase de onde saiu cada um]} */
  function componentesTrocados(texto) {
    var ids = [], trechos = [];
    if (!texto) return { ids: ids, trechos: trechos };
    var frases = String(texto).split(/\n(?=\s*[\[\-•*])|\n\s*\n|(?<=[.;!?])\s+|(?<=[a-z]\.)(?=[A-Z])/);
    var anteriores = [];
    frases.forEach(function (frase) {
      var n = semAcento(frase);
      // pontuação, hífen de lista e "porém/mas" viram o marcador "|" (fim de oração)
      var toks = n.replace(/(^|\s)-+/g, ' | ').replace(/[,;:()\[\]]/g, ' | ')
        .replace(/\b(porem|mas|entretanto|contudo|todavia)\b/g, ' | ').replace(/[^a-z0-9|\- ]/g, ' ').split(/\s+/).filter(Boolean);
      var antes = anteriores; anteriores = toks;
      // a oração (entre marcadores "|") que contém a posição v
      function oracao(v) {
        var a = v, b = v;
        while (a > 0 && toks[a - 1] !== '|') a--;
        while (b < toks.length - 1 && toks[b + 1] !== '|') b++;
        return toks.slice(Math.max(0, a - 3), b + 1).join(' ');
      }
      function anota(c) { if (c >= 0 && ids.indexOf(c) < 0) { ids.push(c); trechos.push(frase.replace(/^\s*\[[^\]]{0,80}\]\s*/, '').trim().replace(/\s+/g, ' ').slice(0, 260)); } }
      toks.forEach(function (w, v) {
        if (!VERBO.test(w) || PENDENTE.test(oracao(v))) return;
        // 1) objeto depois do verbo
        var k = v + 1, achou = -1, pulos = 0;
        while (k < toks.length && toks[k] !== '|' && pulos < 5) {
          var c = componenteEm(toks, k);
          if (c >= 0) { achou = c; break; }
          if (LIGA.test(toks[k])) { k++; continue; }
          pulos++; k++;
        }
        // voz passiva ("os rolamentos ... foram substituídos"): o sujeito vem antes do verbo
        if (/^(substituid|trocad|repost)/.test(w) && /^(foi|foram|sendo|sao|estao|sera)$/.test(toks[v - 1] || '')) anota(sujeitoAntes(toks, v, antes));
        if (achou >= 0) {
          anota(achou);
          // 2) peças encadeadas: "os rolamentos e o encoder", "placa aepa, weca e weta".
          //    Para numa nova ação ("e feito uma inspeção no sensor") ou após 5 palavras sem peça.
          for (var j = k + 1, desde = 0; j < toks.length && desde <= 5; j++, desde++) {
            if (ACAO.test(toks[j])) break;
            if (toks[j] === 'e' || toks[j] === '|') {
              var t = j + 1;
              while (t < toks.length && LIGA.test(toks[t]) && toks[t] !== 'e') t++;
              var c2 = componenteEm(toks, t);
              if (c2 >= 0) { anota(c2); k = t; j = t; desde = 0; continue; }
              if (toks[j] === '|') break;
            }
          }
          return;
        }
        // 3) verbo sem objeto ("realizado a substituição", "substituição do componente"): peça citada antes
        anota(sujeitoAntes(toks, v, antes));
      });
    });
    return { ids: ids, trechos: trechos };
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
        parada: r.Maquina_Parada === 'Sim' ? 1 : 0, dAb: dia(r.Data_Abertura), dFe: dia(r.Data_Fechamento),
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
        pecas: null, pecasTrecho: null,
        atipico: custo !== null && custo >= LIMITE_CUSTO_ATIPICO ? 1 : 0, tecnicos: num(r.Qtd_Tecnicos, 0)
      };
      var comp = componentesTrocados(v.exec);
      v.pecas = comp.ids; v.pecasTrecho = comp.trechos;
      CAMPOS.forEach(function (c) { col[c].push(v[c]); });
    });

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
      origem: new Date(Date.UTC(anoBase, 0, 1)).toISOString().slice(0, 10),
      ultimoDia: Math.floor(maxSerial) - origem,
      parques: parques,
      ativos: ativos.map(function (a) {
        return { wtg: d.wtg.id(a.WTG), parque: parques.indexOf(a.Parque), pos: a.Posicao_No_Parque, modelo: a.Modelo };
      }),
      dic: dic,
      categoriaAp: categoriaAp,
      componentes: COMPONENTES.map(function (c) { return c[0]; }),
      etapas: ETAPAS,
      ordens: col,
      apont: ap
    };
  }

  return { montar: montar, componentesTrocados: componentesTrocados, COMPONENTES: COMPONENTES, CAMPOS: CAMPOS, CAMPOS_AP: CAMPOS_AP };
});
