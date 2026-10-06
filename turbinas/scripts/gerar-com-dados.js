#!/usr/bin/env node
/*
 * Gera uma versão do painel com os dados já embutidos (funciona offline,
 * sem precisar carregar a planilha no navegador).
 *
 * Uso: node gerar-com-dados.js <Base_PowerBI_Ordens.xlsx> <saida.html>
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

var entrada = process.argv[2], saida = process.argv[3];
if (!entrada || !saida) {
  console.error('Uso: node gerar-com-dados.js <planilha.xlsx> <saida.html>');
  process.exit(1);
}

var raiz = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
var modeloJs = fs.readFileSync(path.join(raiz, 'modelo.js'), 'utf8');
var modelo = Modelo.montar(XLSX.readFile(entrada), XLSX);
// "</" dentro de JSON embutido fecharia a tag <script>
var json = JSON.stringify(modelo).replace(/<\//g, '<\\/');

var marcaDados = '<script id="dados-embutidos" type="application/json"></script>';
var marcaModelo = '<script src="modelo.js"></script>';
if (html.indexOf(marcaDados) < 0 || html.indexOf(marcaModelo) < 0) throw new Error('index.html sem os marcadores esperados.');
html = html.replace(marcaDados, function () { return '<script id="dados-embutidos" type="application/json">' + json + '</script>'; })
  .replace(marcaModelo, function () { return '<script>\n' + modeloJs + '</script>'; });

fs.writeFileSync(saida, html);
console.log('Gerado ' + saida + ' (' + Math.round(html.length / 1024) + ' KB, ' + modelo.ordens.om.length + ' OMs)');
