# Instruções para o Claude neste repositório

- Responda sempre em português, com frases curtas: o usuário não programa.
- **Consulta de OMs** (`turbinas/consulta.html`): toda mudança vale para os dois modos de tela,
  **Computador** e **Celular** (botão no topo do painel; `body.pc` e `body.cel` no CSS). Ajuste o
  layout dos dois e confira cada mudança nos dois antes de entregar: no Playwright, uma tela de
  computador (1440 px de largura) e um celular (`devices['Pixel 7']`), sem rolagem lateral da página.
- Para atualizar o painel com planilhas novas, siga a skill `atualizar-painel`.
- Nunca faça commit de planilhas, HTML com dados, `dados.json` ou do logo da empresa (o repositório é público).
