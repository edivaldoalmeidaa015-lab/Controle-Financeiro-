#!/usr/bin/env node
/*
 * Gera o painel "Consulta de OMs" (turbinas/consulta.html) com os dados embutidos.
 *
 * Uso: node gerar-consulta.js <planilhas .xlsx> <saida.html> [--json=dados.json]
 *      [--logo=simbolo.png --logo-nome="Nome da empresa"] [--logo-completo=logo-horizontal.png]
 *      (o símbolo vira o ícone da aba; o logo completo, se houver, vai no cabeçalho; ficam só no HTML gerado)
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
var ConsultaDados = require('../consulta-dados.js');
var livros = arquivos.map(function (arq) { return XLSX.read(fs.readFileSync(arq), { type: 'buffer', cellDates: false, raw: false }); });
var r;
try { r = ConsultaDados.montar(livros, XLSX, Modelo); } catch (e) { console.error(e.message); process.exit(1); }
var D = r.D, O = D.O, C = D.C, P = D.P;

var json = JSON.stringify(D);
var modelo = fs.readFileSync(path.join(__dirname, '..', 'consulta.html'), 'utf8');
// Os scripts do aplicativo vão dentro do HTML gerado: ele abre e lê planilhas novas sem internet.
// Bytes de controle (só aparecem dentro de textos do SheetJS) viram \uXXXX: mesmo código, HTML sem bytes de controle.
['vendor/xlsx.mini.min.js', 'modelo.js', 'consulta-dados.js'].forEach(function (arq) {
  var js = fs.readFileSync(path.join(__dirname, '..', arq), 'utf8')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); });
  var tag = '<script src="' + arq + '"></script>';
  if (modelo.indexOf(tag) < 0) { console.error('consulta.html sem ' + tag); process.exit(1); }
  modelo = modelo.replace(tag, function () { return '<script>' + js.replace(/<\/(script)/gi, '<\\/$1') + '</script>'; });
});
// manifesto e service worker só valem no site (GitHub Pages)
modelo = modelo.replace(/<!--PWA-->[\s\S]*?<!--\/PWA-->/g, '');
var marca = '/*__DADOS__*/null';
if (opc.logo) {
  var tipo = /\.svg$/i.test(opc.logo) ? 'svg+xml' : /\.jpe?g$/i.test(opc.logo) ? 'jpeg' : 'png';
  var uri = 'data:image/' + tipo + ';base64,' + fs.readFileSync(opc.logo).toString('base64');
  var nomeEmp = (opc['logo-nome'] || 'Logo').replace(/"/g, '&quot;');
  var cab = '<img src="' + uri + '" alt="' + nomeEmp + '" title="' + nomeEmp + '">';
  if (opc['logo-completo']) cab = '<span class="logo-full"><img src="data:image/png;base64,' + fs.readFileSync(opc['logo-completo']).toString('base64') +
    '" alt="' + nomeEmp + '"></span><span class="brand-sep"></span>';
  modelo = modelo.replace(/<!--LOGO-->[\s\S]*?<!--\/LOGO-->/, function () { return cab; })
    .replace('<title>', function () { return '<link rel="icon" href="' + uri + '">\n<title>'; });
}
if (modelo.indexOf(marca) < 0) { console.error('consulta.html sem a marca ' + marca); process.exit(1); }
if (opc.json) {
  // Artifact: a publicação põe o esqueleto da página; os dados vão em dados.json ao lado
  fs.writeFileSync(opc.json, json);
  fs.writeFileSync(saida, modelo.replace(/<!--ESQ-->[\s\S]*?<!--\/ESQ-->/g, ''));
} else {
  // arquivo avulso: página completa com os dados dentro
  fs.writeFileSync(saida, modelo.replace(/<!--\/?ESQ-->/g, '').replace(marca, function () { return json.replace(/<\/(script)/gi, '<\\/$1'); }));
}
console.log('OMs: ' + O.om.length + ' · consumo: ' + C.o.length + ' linhas (' + C.s.reduce(function (a, b) { return a + b; }, 0) +
  ' com preço fora do padrão) · pendências: ' + P.n.length + ' · período ' + D.periodo.join(' a ') +
  ' · ' + (json.length / 1048576).toFixed(1) + ' MB de dados');
