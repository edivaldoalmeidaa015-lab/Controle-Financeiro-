#!/usr/bin/env node
/*
 * Junta a exportação de ordens e a de consumo de materiais do Manusis 4 numa planilha só,
 * pronta para o "Atualizar base" do painel (abas "Ordens de manutenção", "Especialidades"
 * e "Consumo de materiais").
 *
 * Uso: node juntar-bases.js <ordens.xlsx> <consumo.xlsx> <saida.xlsx> [--logo=logo.png]
 * Com --logo, a logo da empresa vai numa aba "Logo" e o painel a aplica ao carregar a base.
 * Requer o pacote "xlsx" (SheetJS): npm install xlsx
 *
 * Atenção: a planilha gerada contém os dados da operação — não publique em repositório público.
 */
'use strict';
var XLSX = require('xlsx');
var Modelo = require('../modelo.js');

var fs = require('fs'), path = require('path');
var opcLogo = process.argv.filter(function (x) { return x.indexOf('--logo=') === 0; }).map(function (x) { return x.slice(7); })[0];
var a = process.argv.slice(2).filter(function (x) { return x.indexOf('--') !== 0; });
if (a.length < 3) { console.error('Uso: node juntar-bases.js <ordens.xlsx> <consumo.xlsx> <saida.xlsx>'); process.exit(1); }
var ordens = XLSX.readFile(a[0]), consumo = XLSX.readFile(a[1]);
if (!Modelo.temOrdens(ordens)) throw new Error(a[0] + ' não tem a aba "Ordens de manutenção".');
if (!Modelo.temConsumo(consumo)) throw new Error(a[1] + ' não tem a aba "Consumo de materiais".');
var nome = 'Consumo de materiais';
if (ordens.Sheets[nome]) { delete ordens.Sheets[nome]; ordens.SheetNames.splice(ordens.SheetNames.indexOf(nome), 1); }
XLSX.utils.book_append_sheet(ordens, consumo.Sheets[nome], nome);
if (opcLogo) {
  // data URI dividido em pedaços: uma célula do Excel guarda no máximo 32.767 caracteres
  var ext = path.extname(opcLogo).slice(1).toLowerCase().replace('jpg', 'jpeg');
  var uri = 'data:image/' + ext + ';base64,' + fs.readFileSync(opcLogo).toString('base64');
  var linhas = []; for (var i = 0; i < uri.length; i += 30000) linhas.push([uri.slice(i, i + 30000)]);
  if (ordens.Sheets.Logo) { delete ordens.Sheets.Logo; ordens.SheetNames.splice(ordens.SheetNames.indexOf('Logo'), 1); }
  XLSX.utils.book_append_sheet(ordens, XLSX.utils.aoa_to_sheet(linhas), 'Logo');
}
XLSX.writeFile(ordens, a[2], { compression: true });

// conferência: lê de volta como o painel lê
var M = Modelo.montar(XLSX.readFile(a[2]), XLSX);
var st = Modelo.juntarConsumo(M, XLSX.readFile(a[2]), XLSX);
console.log('Gerado ' + a[2] + ': ' + M.ordens.om.length + ' OMs, ' + st.linhas + ' baixas em ' + st.oms + ' OMs (' + st.fora + ' fora da base)');
