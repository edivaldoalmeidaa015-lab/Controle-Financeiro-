#!/usr/bin/env node
/*
 * Gera uma versão do painel com os dados já embutidos (funciona offline,
 * sem precisar carregar a planilha no navegador).
 *
 * Uso: node gerar-com-dados.js <planilhas .xlsx/.zip: OMs, consumo e pendências, de um ou vários anos> <saida.html>
 *      [--base-completa=base.xlsx] [--consumo=consumo.xlsx] [--pendencias=pendencias.xlsx] [--logo=simbolo.png] [--logo-completo=logo.png] [--logo-nome="Empresa"]
 * Requer o pacote "xlsx" (SheetJS): npm install xlsx
 *
 * Atenção: o HTML gerado contém os dados da operação — não publique em
 * repositório público.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var XLSX = require('xlsx');
var Modelo = require('../modelo.js');

var args = process.argv.slice(2);
var opcao = function (nome) { var a = args.filter(function (x) { return x.indexOf('--' + nome + '=') === 0; })[0]; return a ? a.slice(nome.length + 3) : null; };
var posicionais = args.filter(function (x) { return x.indexOf('--') !== 0; });
// a saída é o último argumento .html; o resto são planilhas (OMs, consumo, pendências; .xlsx ou .zip, de qualquer ano)
var saida = posicionais.filter(function (x) { return /\.html?$/i.test(x); }).pop();
var entradas = posicionais.filter(function (x) { return x !== saida; });
['consumo', 'pendencias'].forEach(function (o) { if (opcao(o)) entradas.push(opcao(o)); });
if (!entradas.length || !saida) {
  console.error('Uso: node gerar-com-dados.js <planilhas .xlsx/.zip…> <saida.html> [--base-completa=base.xlsx] [--logo=logo.png] [--logo-nome="Empresa"]');
  process.exit(1);
}

var raiz = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(raiz, 'painel-antigo.html'), 'utf8');
var modeloJs = fs.readFileSync(path.join(raiz, 'modelo.js'), 'utf8');

/** Planilhas de um arquivo: o próprio .xlsx ou os .xlsx de dentro do .zip do Manusis. */
function planilhas(arq) {
  if (!/\.zip$/i.test(arq)) return [{ wb: XLSX.readFile(arq), nome: path.basename(arq), quando: fs.statSync(arq).mtimeMs }];
  var cp = require('child_process');
  var nomes = cp.execFileSync('unzip', ['-Z1', arq], { encoding: 'utf8' }).split('\n').filter(function (n) { return /\.xlsx?$/i.test(n); });
  return nomes.map(function (n) {
    return { wb: XLSX.read(cp.execFileSync('unzip', ['-p', arq, n], { maxBuffer: 1 << 30 }), { type: 'buffer' }), nome: path.basename(n) || path.basename(arq), quando: fs.statSync(arq).mtimeMs };
  });
}
var lidas = [].concat.apply([], entradas.map(planilhas));
var modelo;
if (lidas.every(function (x) { return Modelo.podeJuntar(x.wb); })) {
  // junta tudo numa planilha só; a exportação mais nova prevalece
  var momento = function (x) { var m = Modelo.momentoExportacao(x.nome); return m === null ? x.quando : m; };
  lidas.sort(function (a, b) { return momento(a) - momento(b); });
  var j = Modelo.juntarPlanilhas(lidas.map(function (x) { return { wb: x.wb }; }), XLSX), s = j.stats;
  console.log('Base juntada: ' + s.oms + ' OMs (abertura ' + s.omDeTxt + ' a ' + s.omAteTxt + '), ' + s.consumo + ' consumos, ' + s.pendencias + ' pendências');
  if (opcao('base-completa')) {
    XLSX.writeFile(j.wb, opcao('base-completa'), { compression: true, bookSST: true });
    console.log('Base completa gravada em ' + opcao('base-completa'));
  }
  if (!Modelo.temOrdens(j.wb)) throw new Error('Falta a planilha de OMs do Manusis.');
  modelo = Modelo.montar(j.wb, XLSX);
  if (Modelo.temConsumo(j.wb)) {
    var st = Modelo.juntarConsumo(modelo, j.wb, XLSX);
    console.log('Consumo: ' + st.linhas + ' consumos em ' + st.oms + ' OMs (' + st.fora + ' fora da base)');
  }
  if (Modelo.temPendencias(j.wb)) {
    var sp = Modelo.juntarPendencias(modelo, j.wb, XLSX);
    console.log('Pendências: ' + sp.linhas + ' (' + sp.ligadas + ' ligadas a OMs da base)');
  }
} else {
  // base antiga do Power BI: uma planilha só, como antes
  modelo = Modelo.montar(lidas[0].wb, XLSX);
}

// Leitor de Excel (SheetJS, versão enxuta) embutido: o botão "Atualizar base" funciona sem internet.
var leitorExcel = fs.readFileSync(require.resolve('xlsx/dist/xlsx.mini.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
// "</" dentro de JSON embutido fecharia a tag <script>
var json = JSON.stringify(modelo).replace(/<\//g, '<\\/');

var marcaDados = '<script id="dados-embutidos" type="application/json"></script>';
var marcaModelo = '<script src="modelo.js"></script>';
if (html.indexOf(marcaDados) < 0 || html.indexOf(marcaModelo) < 0) throw new Error('painel-antigo.html sem os marcadores esperados.');
html = html.replace(marcaDados, function () { return '<script id="dados-embutidos" type="application/json">' + json + '</script>'; })
  .replace(marcaModelo, function () { return '<script>\n' + modeloJs + '</script>\n<script>\n' + leitorExcel + '</script>'; });

var arquivoLogo = opcao('logo');
if (arquivoLogo) {
  var ext = path.extname(arquivoLogo).slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml');
  var dataUri = 'data:image/' + ext + ';base64,' + fs.readFileSync(arquivoLogo).toString('base64');
  var marcaLogo = "var LOGO_URL = '';", marcaNome = "var LOGO_NOME = 'Logo da empresa';";
  if (html.indexOf(marcaLogo) < 0 || html.indexOf(marcaNome) < 0) throw new Error('painel-antigo.html sem o marcador do logo.');
  html = html.replace(marcaLogo, function () { return 'var LOGO_URL = ' + JSON.stringify(dataUri) + ';'; })
    .replace(marcaNome, function () { return 'var LOGO_NOME = ' + JSON.stringify(opcao('logo-nome') || 'Logo da empresa') + ';'; })
    .replace(/<link rel="icon" href="[^"]*">/, function () { return '<link rel="icon" href="' + dataUri + '">'; });
}

// logo completa (símbolo + nome) para o topo em telas largas
var arquivoLogoCompleto = opcao('logo-completo');
if (arquivoLogoCompleto) {
  var extC = path.extname(arquivoLogoCompleto).slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml');
  var uriC = 'data:image/' + extC + ';base64,' + fs.readFileSync(arquivoLogoCompleto).toString('base64');
  var marcaC = "var LOGO_COMPLETO_URL = '';";
  if (html.indexOf(marcaC) < 0) throw new Error('painel-antigo.html sem o marcador da logo completa.');
  html = html.replace(marcaC, function () { return 'var LOGO_COMPLETO_URL = ' + JSON.stringify(uriC) + ';'; });
}

fs.writeFileSync(saida, html);
console.log('Gerado ' + saida + ' (' + Math.round(html.length / 1024) + ' KB, ' + modelo.ordens.om.length + ' OMs)');
