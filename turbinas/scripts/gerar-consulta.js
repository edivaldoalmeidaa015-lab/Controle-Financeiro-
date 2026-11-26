#!/usr/bin/env node
/*
 * Gera o painel "Consulta de OMs" (turbinas/consulta.html) com os dados embutidos.
 *
 * Uso: node gerar-consulta.js <planilhas .xlsx> <saida.html> [--json=dados.json]
 *
 * Aceita a base única (abas "Ordens de manutenção", "Consumo de materiais" e "Pendências")
 * ou as três exportações do Manusis separadas, de um ou vários anos. Tudo é cruzado pelo
 * número da OM. Com --json, grava também só os dados (o HTML de saída então os busca em
 * "dados.json", ao lado da página).
 *
 * Precisa do pacote xlsx (npm install xlsx). Os dados gerados são da operação:
 * não publique nem versione o arquivo de saída.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var XLSX = require('xlsx');
var Modelo = require('../modelo.js');

var args = process.argv.slice(2);
var opc = {};
var arquivos = args.filter(function (a) {
  var m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) { opc[m[1]] = m[2]; return false; }
  return true;
});
if (arquivos.length < 2) {
  console.error('Uso: node gerar-consulta.js <planilhas.xlsx...> <saida.html> [--json=dados.json]');
  process.exit(1);
}
var saida = arquivos.pop();

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
arquivos.forEach(function (arq) {
  var wb = XLSX.read(fs.readFileSync(arq), { type: 'buffer', cellDates: false, raw: false });
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
if (!nums.length) { console.error('Nenhuma OM encontrada (aba "Ordens de manutenção").'); process.exit(1); }

// ---- dicionários ---------------------------------------------------------------------
function Dic() { this.lista = []; this.idx = {}; }
Dic.prototype.id = function (v) { if (!(v in this.idx)) { this.idx[v] = this.lista.length; this.lista.push(v); } return this.idx[v]; };
var dStatus = new Dic(), dParque = new Dic(), dAtivo = new Dic(), dAtivoNome = {}, dTipo = new Dic(), dMat = new Dic(), dStPend = new Dic();

var O = { om: [], st: [], pq: [], at: [], dt: [], tp: [], desc: [], exec: [], fl: [], cmCol: [] };
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
var C = { o: [], m: [], q: [], u: [], v: [], s: [], d: [] };
var cons = [];
Object.keys(linhasCons).forEach(function (n) {
  if (!(n in posOM)) return;
  linhasCons[n].forEach(function (r) {
    cons.push({ o: posOM[n], nome: texto(r['Material']), q: numBR(r['Quantidade']), u: texto(r['Unidade de medida']),
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
});

// ---- pendências ----------------------------------------------------------------------
var P = { n: [], desc: [], st: [], ori: [], exe: [], dt: [], at: [], us: [], dc: [] };
Object.keys(linhasPend).sort(function (a, b) { return +a - +b; }).forEach(function (k) {
  var r = linhasPend[k];
  var ori = numOM(r['OM de origem']), exe = numOM(r['OM de execução']);
  P.n.push(k); P.desc.push(texto(r['Descrição'])); P.st.push(dStPend.id(texto(r['Status']) || '(sem status)'));
  P.ori.push(ori in posOM ? posOM[ori] : -1); P.exe.push(exe in posOM ? posOM[exe] : -1);
  P.dt.push(dataISO(r['Data de abertura'])); P.at.push(curtoAtivo(r['Ativo']));
  P.us.push(texto(r['Usuário'])); P.dc.push(dataISO(r['Data de conclusão']));
});

var datas = O.dt.filter(Boolean).sort();
var D = {
  gerado: new Date().toISOString().slice(0, 10),
  periodo: [datas[0], datas[datas.length - 1]],
  status: dStatus.lista, parques: dParque.lista, ativos: dAtivo.lista,
  ativosNome: dAtivo.lista.map(function (a) { return dAtivoNome[a] || a; }),
  tipos: dTipo.lista, falhas: falhas.rotulos, materiais: dMat.lista, statusPend: dStPend.lista,
  O: O, C: C, P: P
};
var json = JSON.stringify(D);
var modelo = fs.readFileSync(path.join(__dirname, '..', 'consulta.html'), 'utf8');
var marca = '/*__DADOS__*/null';
if (modelo.indexOf(marca) < 0) { console.error('consulta.html sem a marca ' + marca); process.exit(1); }
if (opc.json) {
  fs.writeFileSync(opc.json, json);
  fs.writeFileSync(saida, modelo);
} else {
  // arquivo avulso: ganha o esqueleto de página (no Artifact o esqueleto é posto na publicação)
  var pagina = '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<style>body{margin:0}[hidden]{display:none!important}</style>\n' +
    modelo.replace(marca, function () { return json.replace(/<\/(script)/gi, '<\\/$1'); }).replace('<header class="top">', '</head><body>\n<header class="top">') +
    '\n</body></html>\n';
  fs.writeFileSync(saida, pagina);
}
console.log('OMs: ' + O.om.length + ' · consumo: ' + C.o.length + ' linhas (' + C.s.reduce(function (a, b) { return a + b; }, 0) +
  ' com preço fora do padrão) · pendências: ' + P.n.length + ' · período ' + D.periodo.join(' a ') +
  ' · ' + (json.length / 1048576).toFixed(1) + ' MB de dados');
