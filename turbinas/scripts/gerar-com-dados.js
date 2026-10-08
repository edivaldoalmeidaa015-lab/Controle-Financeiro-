#!/usr/bin/env node
/*
 * Gera uma versão do painel com os dados já embutidos (funciona offline,
 * sem precisar carregar a planilha no navegador).
 *
 * Uso: node gerar-com-dados.js <planilha de OMs.xlsx> <saida.html> [--consumo=consumo_de_materiais.xlsx] [--logo=logo.png] [--logo-nome="Empresa"]
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
var entrada = posicionais[0], saida = posicionais[1];
if (!entrada || !saida) {
  console.error('Uso: node gerar-com-dados.js <planilha.xlsx> <saida.html> [--logo=logo.png] [--logo-nome="Empresa"]');
  process.exit(1);
}

var raiz = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
var modeloJs = fs.readFileSync(path.join(raiz, 'modelo.js'), 'utf8');
var modelo = Modelo.montar(XLSX.readFile(entrada), XLSX);
// consumo de materiais do Manusis (opcional): liga as baixas às OMs pelo número
if (opcao('consumo')) {
  var st = Modelo.juntarConsumo(modelo, XLSX.readFile(opcao('consumo')), XLSX);
  console.log('Consumo: ' + st.linhas + ' baixas em ' + st.oms + ' OMs (' + st.fora + ' fora da base)');
}
// Leitor de Excel (SheetJS, versão enxuta) embutido: o botão "Atualizar base" funciona sem internet.
var leitorExcel = fs.readFileSync(require.resolve('xlsx/dist/xlsx.mini.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
// "</" dentro de JSON embutido fecharia a tag <script>
var json = JSON.stringify(modelo).replace(/<\//g, '<\\/');

var marcaDados = '<script id="dados-embutidos" type="application/json"></script>';
var marcaModelo = '<script src="modelo.js"></script>';
if (html.indexOf(marcaDados) < 0 || html.indexOf(marcaModelo) < 0) throw new Error('index.html sem os marcadores esperados.');
html = html.replace(marcaDados, function () { return '<script id="dados-embutidos" type="application/json">' + json + '</script>'; })
  .replace(marcaModelo, function () { return '<script>\n' + modeloJs + '</script>\n<script>\n' + leitorExcel + '</script>'; });

var arquivoLogo = opcao('logo');
if (arquivoLogo) {
  var ext = path.extname(arquivoLogo).slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml');
  var dataUri = 'data:image/' + ext + ';base64,' + fs.readFileSync(arquivoLogo).toString('base64');
  var marcaLogo = "var LOGO_URL = '';", marcaNome = "var LOGO_NOME = 'Logo da empresa';";
  if (html.indexOf(marcaLogo) < 0 || html.indexOf(marcaNome) < 0) throw new Error('index.html sem o marcador do logo.');
  html = html.replace(marcaLogo, function () { return 'var LOGO_URL = ' + JSON.stringify(dataUri) + ';'; })
    .replace(marcaNome, function () { return 'var LOGO_NOME = ' + JSON.stringify(opcao('logo-nome') || 'Logo da empresa') + ';'; })
    .replace(/<link rel="icon" href="[^"]*">/, function () { return '<link rel="icon" href="' + dataUri + '">'; });
}

fs.writeFileSync(saida, html);
console.log('Gerado ' + saida + ' (' + Math.round(html.length / 1024) + ' KB, ' + modelo.ordens.om.length + ' OMs)');
