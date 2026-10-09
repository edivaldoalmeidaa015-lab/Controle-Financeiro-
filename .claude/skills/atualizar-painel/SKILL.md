---
name: atualizar-painel
description: Atualiza o Painel de Turbinas com uma planilha nova de OMs — a exportação do Manusis 4 (ordens_de_manutencao_*.xlsx ou o .zip dela) ou a Base_PowerBI_Ordens*.xlsx. Use quando o usuário enviar a planilha de ordens e pedir para atualizar, gerar ou republicar o painel.
---

# Atualizar o Painel de Turbinas

Objetivo: transformar a planilha de OMs enviada pelo usuário no painel com os
dados embutidos e o símbolo da empresa. Depois, atualizar o mesmo link e
entregar o arquivo. Responda sempre em português, com frases curtas.

## Passos

1. **Planilha.** Localize o arquivo que o usuário anexou: a exportação do Manusis
   (`ordens_de_manutencao_*.xlsx`, ou o `.zip` — extraia em uma pasta própria do
   scratchpad) ou a `Base_PowerBI_Ordens*.xlsx`. O `modelo.js` lê os dois formatos.
   Se não houver anexo, peça a planilha e pare.
   - Se vier também o consumo de materiais do Manusis (`consumo_de_materiais_*.xlsx` ou `.zip`),
     passe-o com `--consumo=<arquivo.xlsx>` no passo 4.
   - Se vier a exportação de pendências do Manusis (`pendencias_*.xlsx` ou `.zip`, aba "Pendências"),
     passe-a com `--pendencias=<arquivo.xlsx>` no passo 4 e na base única. Ela pode cobrir um período maior que as OMs (até 2 anos).
   - Para o usuário carregar no app, entregue uma **base única**: junte as duas com
     `node turbinas/scripts/juntar-bases.js <ordens.xlsx> <consumo.xlsx> <scratchpad>/Base_Painel_Turbinas_<data>.xlsx [--pendencias=<pendencias.xlsx>]`
     e recomprima o .xlsx com Python (`zipfile`, `ZIP_DEFLATED`, nível 9) — a gravação do SheetJS sai com uns 13 MB.
2. **Ferramentas.** No scratchpad, rode `npm install xlsx` (uma vez por sessão).
3. **Símbolo da empresa.** O logo **não** fica no repositório, porque ele é público.
   - Use `Artifact` com `action: "list"` e encontre o artefato "Painel de Turbinas".
   - Leia-o com `action: "read"`.
   - Extraia o data URI de `var LOGO_URL = "data:image/png;base64,..."` e salve como `simbolo.png` no scratchpad.
   - Se não achar, pergunte ao usuário pelo símbolo ou gere sem o logo.
4. **Gerar** com o comando abaixo (rode a partir do scratchpad; `NODE_PATH` apontando para o `node_modules` de lá):
   ```bash
   node turbinas/scripts/gerar-com-dados.js <planilha.xlsx> <scratchpad>/painel-turbinas-asa-branca.html \
     [--consumo=<consumo_de_materiais.xlsx>] [--pendencias=<pendencias.xlsx>] --logo=<scratchpad>/simbolo.png --logo-nome="Essentia Energia"
   ```
   - Se der erro do tipo "A planilha não tem a aba …", explique ao usuário qual aba falta e pare.
5. **Conferir.** Abra o HTML no Chromium (Playwright, `executablePath: '/opt/pw-browsers/chromium'`).
   - Verifique que os 4 indicadores (`.kpi`) aparecem.
   - Verifique que não há erros de página.
6. **Publicar e entregar.**
   - Publique com `Artifact` usando o `url` do artefato "Painel de Turbinas", para manter o mesmo link.
   - Envie o arquivo com `SendUserFile` (`display: "attach"`).
7. **Responder** em até 5 linhas:
   - quantidade de OMs;
   - período dos dados (data inicial e final);
   - backlog;
   - o link;
   - lembrete: abrir pelo Chrome e apagar o arquivo antigo do celular.

## Regras

- **Nunca** faça commit da planilha, do HTML gerado nem do logo. São dados da empresa e o repositório é público.
- Não coloque o link do artefato em arquivos do repositório.
