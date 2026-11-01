#!/usr/bin/env python3
"""Verifica se o JSON, o SQLite e o HTML único usam o mesmo banco.

Uso: python tools/test_dictionary.py
"""
import json
from pathlib import Path
import sqlite3
import unicodedata

root = Path(__file__).resolve().parent.parent
payload = json.loads((root / 'data/dictionary.json').read_text(encoding='utf-8'))
meta = json.loads((root / 'data/info.json').read_text(encoding='utf-8'))
normalize = lambda word: ''.join(
    ch for ch in unicodedata.normalize('NFD', word.upper())
    if not unicodedata.combining(ch)
)
with sqlite3.connect(root / 'data/dictionary.sqlite3') as conn:
    db_index = [list(row) for row in conn.execute('SELECT base, spelling FROM words ORDER BY base')]
    db_answers = [row[0] for row in conn.execute('SELECT spelling FROM answers ORDER BY base')]
    db_meta = {key: json.loads(value) for key, value in conn.execute('SELECT key, value FROM metadata')}
    assert conn.execute('SELECT count(*) FROM words WHERE is_answer=1').fetchone()[0] == len(db_answers)

assert payload['meta'] == meta == db_meta, 'Metadados diferentes entre os bancos'
assert payload['index'] == db_index, 'Índices diferentes entre os bancos'
assert payload['answers'] == db_answers, 'Respostas diferentes entre os bancos'
assert len(db_index) == meta['accepted']
assert len(db_answers) == meta['answers']
keys = {x[0] for x in db_index}
assert 'TRENS' in keys, 'TRENS não está nos palpites'
assert 'QWXYZ' not in keys, 'QWXYZ foi incorretamente aceito'
assert all(normalize(answer) in keys for answer in db_answers)

html = (root / 'termo-abrir-direto.html').read_text(encoding='utf-8')
start_tag = '<script type="application/json" id="termo-dictionary-data">'
assert html.count(start_tag) == 1
inline = html.split(start_tag, 1)[1].split('</script>', 1)[0]
assert json.loads(inline) == payload, 'O HTML único não incorpora o banco atual'
print(f'OK: {len(db_index):,} palpites, {len(db_answers):,} respostas; DB/JSON/HTML sincronizados.')
