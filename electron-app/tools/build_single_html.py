#!/usr/bin/env python3
"""Gera termo-abrir-direto.html com o banco SQLite incorporado como JSON.

Consulta o banco de prepare_dictionary.py e compara com o JSON exportado.
Assim, o HTML único funciona no celular sem servidor nem conexão.
"""
import json
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
index = (root / 'index.html').read_text(encoding='utf-8')
# A versão standalone é web, sem recursos Electron que não podem ser embutidos.
index = index.replace('<link rel="stylesheet" href="./src/desktop.css">', '')
index = index.replace('<script defer src="./src/desktop.js"></script>', '')
styles = (root / 'src/styles.js').read_text(encoding='utf-8').replace('export const ', 'const ')
main = (root / 'src/main.js').read_text(encoding='utf-8')
main = main.replace("import { BOARD_STYLE, ROW_STYLE } from './styles.js';\n", '')
main = main.replace('export {evaluate,NORM,MODES,parseDictionary};', '')
assert 'export ' not in main, 'O script autônomo não pode conter exports.'

browser_data = json.loads((root / 'data/dictionary.json').read_text(encoding='utf-8'))
with sqlite3.connect(root / 'data/dictionary.sqlite3') as conn:
    pairs = [list(row) for row in conn.execute('SELECT base, spelling FROM words ORDER BY base')]
    answers = [row[0] for row in conn.execute('SELECT spelling FROM answers ORDER BY base')]
    metadata = {key: json.loads(value) for key, value in conn.execute('SELECT key, value FROM metadata')}

assert pairs == browser_data['index'], 'Os índices de dictionary.sqlite3 e dictionary.json diferem.'
assert answers == browser_data['answers'], 'As respostas de dictionary.sqlite3 e dictionary.json diferem.'
assert metadata == browser_data['meta'], 'Os metadados dos bancos diferem.'

# Embutir o banco do SQLite diretamente garante que file:// não depende de fetch.
inline_payload = json.dumps({'meta': metadata, 'index': pairs, 'answers': answers},
                            ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
needle = '<script type="module" src="./src/main.js"></script>'
assert needle in index, 'Ponto de inserção do script não encontrado.'
result = index.replace(needle,
    f'<script type="application/json" id="termo-dictionary-data">{inline_payload}</script>\n'
    f'<script>\n{styles}\n{main}\n</script>')
path = root / 'termo-abrir-direto.html'
path.write_text(result, encoding='utf-8')
print(f'Gerado: {path} ({path.stat().st_size:,} bytes; {len(pairs):,} palpites; {len(answers):,} respostas).')
