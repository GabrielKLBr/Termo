# Termo Infinito (site)

Site independente com dicionário incorporado no HTML, modos Termo, Dueto e Quarteto e botão de download para Windows.

- `index.html`: versão completa do jogo (funciona sem backend, exceto consulta da release).
- `termo-abrir-direto.html`: cópia idêntica, pode abrir localmente.
- `windows-download.js`: menu de downloads do Windows, com links de fallback da release v1.0.0.
- `api/downloads.mjs`: consulta a **última release pública** do GitHub, sem expor token.
- `sw.js`: cache offline do jogo; não armazena respostas da API de downloads.

**Importante:** enviar esse código ao GitHub não atualiza automaticamente o Vercel sem integração Git no projeto.
