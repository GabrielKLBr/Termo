# Termo Desktop (Electron)

Projeto **npm + Electron 45** feito sobre o projeto HTML/CSS/JS existente. Mantém os Web Components originais, o template, o jogo Termo, Dueto e Quarteto e os dados gerados pelo Python. Não requer React, Vite, servidor local nem Python para jogar.

## Instalar e executar

Requer **Node.js 20+** e npm. Abra um terminal nesta pasta:

```powershell
npm install
npm start
```

Para depurar com o DevTools:

```powershell
npm run dev
```

`npm start` gera os ícones e abre a janela local do Electron. Para jogar, a aplicação lê `data/dictionary.json` por uma API isolada entre a interface e o processo principal. **Sem fetch(file://)** e sem precisar da internet. A UI web continua funcionando em um servidor HTTP, separadamente.

## Gerar o instalador e EXE portátil no Windows

```powershell
npm run build:win
```

Ou simplesmente:

```powershell
npm run build
```

O resultado aparece na pasta **`dist/`**:

- `Termo-Setup-1.0.0-x64.exe`: instalador NSIS com diretório de instalação selecionável;
- `Termo-Portable-1.0.0-x64.exe`: executável portátil.

O build executa **`npm run icons` automaticamente**, antes do empacotamento. Ele lê o SVG original em `assets/icon.svg` e gera:

- `build/icon.ico` com imagens de 16, 24, 32, 48, 64, 128 e 256 px;
- `build/icon.png` com imagem de 1024 px para outras plataformas.

Alterar `assets/icon.svg` e executar o build basta: não é necessário editar os ícones manualmente. A geração utiliza `sharp` + `png-to-ico` e **não** modifica o SVG.

Para testes adicionais, `npm run build:dir` cria a versão descompactada. Também existem `npm run build:linux` e `npm run build:mac`. Recomendamos gerar cada pacote no sistema de destino, pois alguns formatos/assinaturas dependem das ferramentas desse sistema.

## Teclado e transição suave entre modos

- **Barra de espaço** avança o cursor uma casa (sem preencher nem apagar a letra), nas versões Electron, web e HTML único. A seta direita continua funcionando normalmente. Após a última posição, o cursor fica no final da palavra.
- **Troca de modo com morph/FLIP**: as fileiras já existentes e seus cinco quadrados são **reutilizados**, movendo-se e redimensionando-se de sua geometria anterior até a posição final em cerca de 510 ms.
- Fileiras adicionais entram com **fade-in** e leve deslocamento; fileiras retiradas saem com **fade-out**, em camada temporária não clicável.
- As partidas de Termo, Dueto e Quarteto continuam independentes. Nenhum progresso é apagado pela animação.
- Ao ativar **Reduzir movimento** nas preferências de acessibilidade do sistema, a mudança ocorre sem animação. Cliques rápidos de um modo a outro cancelam a transição anterior.
- Os campos de digitação usam novamente os **cantos originais de 10%**, sem sobrescrita de raio pela versão Electron.
- Letras ainda não confirmadas mantêm fundo transparente e contorno, sem ficar cinza ao digitar. As cores de avaliação aparecem apenas ao confirmar com Enter.
- A mensagem repetitiva **“Tentativa registrada”** foi retirada. Avisos de erro, vitória e fim de jogo continuam.

Os arquivos compartilhados de implementação ficam em `src/main.js` e `src/styles.js`. Depois de modificar qualquer um deles, execute `python tools/build_single_html.py` para manter a versão web de arquivo único sincronizada.

## Barra e janela

- `frame:false`: remove borda, barra de título e botões nativos.
- `roundedCorners:true`: solicita cantos arredondados nativos no **Windows 11**; sistemas antigos podem não oferecer arredondamento real da janela sem bordas.
- Barra superior de modos ocupa **100% da largura da janela**, sem o limite original de 720/1440 px.
- `desktop-heading` fica **depois** de `wc-bar` no fluxo vertical. Ao expandir/recolher os modos, título, ações e botões da janela sobem/descem em conjunto.
- Ordem tradicional do Windows à direita: **minimizar, maximizar/restaurar, fechar**.
- Cada botão usa o **SVG original** (`minimzar.svg`, `maximizar.svg`, `restaurar.svg` e `fechar.svg`) com contorno de dois pixels e cantos arredondados como os outros ícones do cabeçalho.
- `maximizar.svg` alterna automaticamente para `restaurar.svg` ao maximizar, voltando ao ícone anterior quando restaurado (inclusive se a mudança ocorrer por atalho do sistema).
- A parte superior da janela é arrastável, incluindo a barra preta expandida, o título e as áreas vazias do cabeçalho. As abas, os ícones do jogo e os controles continuam clicáveis.
- Os botões da janela agora têm apenas **32 × 32 px** (com 5 px entre eles), e o hover é limitado ao interior das próprias bordas.
- A janela continua redimensionável e suas partidas são salvas separadamente por modo no `localStorage`.

**Observação:** o arredondamento externo é exclusivamente o nativo do Windows 11 (`roundedCorners: true`). O CSS não arredonda artificialmente a barra preta nem os componentes originais (teclado, botões, modais). A moldura invisível preserva maximização e redimensionamento.

## Árvore do projeto

```text
termo-electron/
├── package.json                  # npm + electron-builder
├── electron/
│   ├── main.cjs                 # janela, controle e acesso ao banco
│   └── preload.cjs              # contextBridge restrita (IPC seguro)
├── scripts/
│   └── generate-icons.mjs       # SVG -> PNG/ICO em cada build
├── build/
│   ├── icon.ico                 # gerado do icon.svg
│   └── icon.png                 # gerado do icon.svg
├── assets/                      # SVG originais, incluindo os de janela
├── src/
│   ├── main.js                  # lógica do jogo
│   ├── styles.js                # regras do template original
│   ├── desktop.js               # cabeçalho e controles Electron
│   └── desktop.css              # layout Electron sem alterar o arredondamento original
├── data/
│   ├── dictionary.json          # dicionário consumido pelo app
│   └── dictionary.sqlite3       # banco Python que gerou o JSON
├── prepare_dictionary.py        # gerador de banco SQLite e JSON
├── tools/                        # validação e HTML autônomo
├── tests/                        # testes estáticos e consistência de banco
├── index.html                   # Web Components e jogo
└── termo-abrir-direto.html      # versão HTML única independente
```

## Atualizar o banco de palavras

Com internet, pelo Python:

```powershell
python prepare_dictionary.py
python tools/build_single_html.py
npm start
```

O Python gera `data/dictionary.sqlite3` e `data/dictionary.json` com os mesmos dados. O app Electron usa a exportação JSON para carregar rapidamente o banco; o SQLite fica no projeto para inspeção/reprocessamento. O `data/dictionary.json` vai embutido no instalador. Não há banco remoto.

Os testes de consistência são executados com:

```powershell
npm test
```

O script `tools/build_single_html.py` remove os recursos específicos do Electron da variante HTML único. A variante web continua sendo independente e pode ser aberta no navegador como antes. Consulte também `README-WEB.md` e `LICENSE-DICIONARIO.txt`.

## Segurança e observações

O Electron usa `contextIsolation:true`, `nodeIntegration:false` e `sandbox:true`. O renderer não tem acesso direto ao disco nem ao módulo Electron, apenas a funções específicas para controlar a janela e ler o dicionário. Os links externos não são carregados dentro da aplicação.

Os executáveis gerados localmente **não vêm assinados digitalmente**. O Windows SmartScreen pode mostrar aviso em aplicativos sem assinatura. Isso não afeta a execução pelo `npm start`.

Projeto não oficial, não afiliado ao site original do Termo. Dicionário derivado de [fserb/pt-br](https://github.com/fserb/pt-br), sob licença MIT.

### Teclado de Dueto e Quarteto

As teclas exibem a avaliação de cada tabuleiro independentemente: duas metades no Dueto e quatro quadrantes no Quarteto, na ordem dos tabuleiros. Letras ausentes em todos os tabuleiros ficam apagadas; as demais mantêm as cores separadas. A versão de uma palavra preserva o teclado tradicional.
