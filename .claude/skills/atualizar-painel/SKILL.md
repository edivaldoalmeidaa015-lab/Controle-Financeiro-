---
name: atualizar-painel
description: Atualiza a Consulta de OMs (o painel de turbinas) com planilhas novas do Manusis 4 — ordens de manutenção, consumo de materiais e pendências (.xlsx ou .zip), ou a base única. Use quando o usuário enviar as planilhas e pedir para atualizar, gerar ou republicar o painel.
---

# Atualizar a Consulta de OMs

O aplicativo é a **Consulta de OMs** (`turbinas/consulta.html`). No GitHub Pages ela abre vazia e
o usuário carrega as planilhas no próprio aparelho. Esta skill gera a versão com os dados dentro:
o artefato "Consulta de OMs" no Claude e um arquivo offline. Responda sempre em português, com frases curtas.

## Passos

1. **Planilhas.** Localize os arquivos que o usuário anexou: exportações do Manusis
   (`ordens_de_manutencao_*`, `consumo_de_materiais_*`, `pendencias_*`; `.xlsx` ou `.zip` — extraia o
   `.zip` numa pasta própria do scratchpad) ou a base única (abas "Ordens de manutenção",
   "Consumo de materiais", "Pendências"). Podem ser de vários anos. Se não houver anexo, peça e pare.
2. **Ferramentas.** No scratchpad, rode `npm install xlsx@0.18.5` (uma vez por sessão).
3. **Logo da empresa.** Não fica no repositório (ele é público).
   - Liste os artefatos (`Artifact`, `action: "list"`) e leia o "Consulta de OMs" (`action: "read"`).
   - Extraia do `<link rel="icon" href="data:image/png;base64,...">` o símbolo (`simbolo.png`) e, do
     `<span class="logo-full"><img src="data:image/png;base64,...">`, o logo completo (`logo-completo.png`).
   - Se não achar, pergunte ao usuário ou gere sem logo.
4. **Gerar** (a partir da raiz do repositório, com `NODE_PATH` no `node_modules` do scratchpad):
   ```bash
   node turbinas/scripts/gerar-consulta.js <planilhas...> <scratchpad>/art/consulta-oms.html --json=<scratchpad>/art/dados.json \
     --logo=<scratchpad>/simbolo.png --logo-completo=<scratchpad>/logo-completo.png --logo-nome="Essentia Energia"
   node turbinas/scripts/gerar-consulta.js <planilhas...> <scratchpad>/Consulta_OMs_offline.html \
     --logo=<scratchpad>/simbolo.png --logo-completo=<scratchpad>/logo-completo.png --logo-nome="Essentia Energia"
   ```
   - Se der erro do tipo "Nenhuma OM encontrada", explique qual aba falta e pare.
5. **Conferir.** Abra o arquivo offline no Chromium (Playwright) e veja se `#k-om .k-val` aparece, sem erros de página.
6. **Publicar e entregar.**
   - Publique `consulta-oms.html` com `Artifact` no `url` do artefato "Consulta de OMs" (mesmo link),
     com `files: {"dados.json": "<scratchpad>/art/dados.json"}`. Mantenha a capacidade `downloads` (exportar Excel).
   - Envie `Consulta_OMs_offline.html` com `SendUserFile` (`display: "attach"`).
7. **Responder** em até 5 linhas: quantidade de OMs, período (data inicial e final), consumos com preço
   fora do padrão, o link, e o lembrete de apagar o arquivo offline antigo do celular.

## Regras

- **Nunca** faça commit das planilhas, do HTML gerado, do `dados.json` nem do logo. São dados da empresa e o repositório é público.
- Não coloque o link do artefato em arquivos do repositório.
- O Painel de Turbinas antigo (`turbinas/painel-antigo.html`, `scripts/gerar-com-dados.js`) só é gerado se o usuário pedir por ele.
