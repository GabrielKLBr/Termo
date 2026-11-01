# Termo: interface baseada no template original

Jogo independente de **Termo**, **Dueto** e **Quarteto**, em HTML/CSS/JavaScript, preservando os Web Components, Shadow DOM, estilos, animações e teclado do template fornecido.

## Jogar no celular ou no computador, sem instalar nada

**Abra `termo-abrir-direto.html`** diretamente pelo gerenciador de arquivos. Ele já contém o banco de palavras incorporado, por isso funciona até em `file://`, sem servidor e sem conexão. Todas as palavras são verificadas contra o banco, mesmo no modo offline. A palavra **TRENS** é aceita como tentativa.

## Rodar o projeto normal

Os arquivos `data/dictionary.json` e `data/dictionary.sqlite3` **já vêm no ZIP**. Não é preciso baixá-los ao jogar.

```bash
python -m http.server 8000
```

Abra http://localhost:8000/. Não use `index.html` diretamente em `file://`, já que esse arquivo tem módulos e carrega o JSON usando `fetch`. Se quiser abrir um arquivo sem servidor, use `termo-abrir-direto.html`.

O Service Worker armazena `dictionary.json` e os demais recursos do jogo para visitas offline, depois da primeira instalação bem-sucedida em HTTP(S).

## Fonte única das palavras

O arquivo **`prepare_dictionary.py`** (na raiz) transforma o corpus [fserb/pt-br](https://github.com/fserb/pt-br) em:

| Arquivo | Função |
|---|---|
| `data/dictionary.sqlite3` | Banco SQLite para Python ou backend, com as tabelas `words`, `forms`, `answers` e `metadata` |
| `data/dictionary.json` | Exportação compatível com navegador do **mesmo índice e das mesmas respostas** do SQLite |
| `data/info.json` | Contagens, fontes, hashes e política de seleção |
| `data/fserb-pt-br-LICENSE.txt` | Licença das palavras |

O jogo **não** usa listas limitadas embutidas no JavaScript, nem busca palavras soltas do GitHub durante a partida. A validação usa as chaves normalizadas do campo `index` e o sorteio usa exclusivamente `answers`.

O banco fornecido neste pacote contém **11.296 palpites válidos e 2.137 possíveis respostas**. Acentos são preservados para mostrar as respostas corretamente e ignorados na comparação de letras. Por exemplo, `SÁBIA` pode ser resposta, mesmo quando `SABIA` é a grafia preferencial no índice.

### Atualizar o banco

Com internet, dentro da pasta do projeto:

```bash
python prepare_dictionary.py
python tools/build_single_html.py
```

A primeira linha baixa `lexico`, `conjugações`, `icf` e `listas/negativas`, gerando **os dois formatos**. A segunda cria novamente `termo-abrir-direto.html` a partir do banco SQLite e confere se suas palavras e respostas correspondem a `dictionary.json`.

É possível regular o ICF para permitir outras soluções:

```bash
python prepare_dictionary.py --max-icf 14.5
```

Ou reconstruir a versão SQLite a partir de um JSON previamente exportado, sem baixar o corpus:

```bash
python prepare_dictionary.py --from-json data/dictionary.json
python tools/build_single_html.py
```

**Atenção:** `--from-json` reconstitui as palavras e soluções, mas não contém todas as marcações de origem das formas presentes no corpus original. Se precisar dessas marcações na tabela `forms`, gere a partir das fontes originais. O comando antigo `python tools/build_dictionary.py` é um atalho para `prepare_dictionary.py`, sem gerar um formato diferente.

## Teclado e animação de mudança de modo

Pressione **Espaço** para avançar para a próxima casa sem inserir uma letra. É possível deixar uma casa em branco temporariamente, preenchê-la depois com as setas ou clicando no quadrado e confirmar somente quando a palavra tiver cinco letras.

Ao mudar entre **Termo**, **Dueto** e **Quarteto**, as fileiras compartilhadas se movem e mudam de tamanho suavemente, enquanto as fileiras adicionadas/desaparecidas recebem um fade. A animação não modifica as partidas salvas e é desativada automaticamente quando o sistema solicita **movimento reduzido**. Tudo funciona igual no `index.html` e no `termo-abrir-direto.html`.

## Regras e funcionamento

- **Termo:** 1 tabuleiro, 6 tentativas.
- **Dueto:** 2 tabuleiros, 7 tentativas.
- **Quarteto:** 4 tabuleiros, 9 tentativas.
- Cada tentativa é validada contra o mesmo índice do banco, nos três modos, incluindo conjugações aceitas pelo gerador Python.
- As respostas são sorteadas da tabela `answers`, sem repetição dentro da mesma partida.
- Cada modo mantém uma partida, rascunho e estatísticas independentes; ao voltar para uma partida em andamento, ela continua.
- Salvamentos antigos continuam quando todas as suas respostas pertencem ao banco atual. Ao trocar o banco, partidas antigas incompatíveis são reiniciadas.
- Teclado virtual e físico, animação das letras, tratamento de repetições, compartilhamento, alto contraste e layout responsivo.
- Se o JSON estiver ausente ou corrompido, a versão de servidor mostra um **erro de carregamento** em vez de aceitar combinações inválidas como palavras.

## Arquivos principais

- `original/template-captura.html`: HTML original do template disponibilizado.
- `index.html`: interface com os Web Components originais.
- `src/main.js`: lógica do jogo, validação e carregamento do banco Python.
- `src/styles.js`: estilos originais dos tabuleiros.
- `prepare_dictionary.py`: gera SQLite e JSON juntos.
- `tools/build_single_html.py`: embute o banco SQLite no HTML único.
- `tools/build_dictionary.py`: compatibilidade com o comando de geração antigo.
- `sw.js`: cache PWA incluindo `dictionary.json`.

Para verificar a consistência dos três formatos do banco, execute `python tools/test_dictionary.py`.

## Créditos

Dicionário de [fserb/pt-br](https://github.com/fserb/pt-br), licença MIT, © 2021 Fernando Serboncini. Este projeto é independente e não afiliado ao site original do Termo.
