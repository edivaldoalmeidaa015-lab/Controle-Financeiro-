#!/usr/bin/env node
/*
 * Junta a exportação de ordens e a de consumo de materiais do Manusis 4 numa planilha só,
 * pronta para o "Atualizar base" do painel (abas "Ordens de manutenção", "Especialidades"
 * e "Consumo de materiais").
 *
 * Uso: node juntar-bases.js <ordens.xlsx> <consumo.xlsx> <saida.xlsx>
 * Requer o pacote "xlsx" (SheetJS): npm install xlsx
 *
 * Atenção: a planilha gerada contém os dados da operação — não publique em repositório público.
 */
'use strict';
var XLSX = require('xlsx');
var Modelo = require('../modelo.js');

var a = process.argv.slice(2);
if (a.length < 3) { console.error('Uso: node juntar-bases.js <ordens.xlsx> <consumo.xlsx> <saida.xlsx>'); process.exit(1); }
var ordens = XLSX.readFile(a[0]), consumo = XLSX.readFile(a[1]);
if (!Modelo.temOrdens(ordens)) throw new Error(a[0] + ' não tem a aba "Ordens de manutenção".');
if (!Modelo.temConsumo(consumo)) throw new Error(a[1] + ' não tem a aba "Consumo de materiais".');
var nome = 'Consumo de materiais';
if (ordens.Sheets[nome]) { delete ordens.Sheets[nome]; ordens.SheetNames.splice(ordens.SheetNames.indexOf(nome), 1); }
XLSX.utils.book_append_sheet(ordens, consumo.Sheets[nome], nome);
XLSX.writeFile(ordens, a[2], { compression: true });

// conferência: lê de volta como o painel lê
var M = Modelo.montar(XLSX.readFile(a[2]), XLSX);
var st = Modelo.juntarConsumo(M, XLSX.readFile(a[2]), XLSX);
console.log('Gerado ' + a[2] + ': ' + M.ordens.om.length + ' OMs, ' + st.linhas + ' baixas em ' + st.oms + ' OMs (' + st.fora + ' fora da base)');
