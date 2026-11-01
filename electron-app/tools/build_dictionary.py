#!/usr/bin/env python3
"""Compatibilidade com o comando antigo.

A geração oficial é prepare_dictionary.py, que produz conjuntamente:
  data/dictionary.sqlite3, data/dictionary.json e data/info.json.
Não gere aqui outro formato: o front-end depende de index/answers.
"""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
raise SystemExit(subprocess.call([sys.executable, str(root / 'prepare_dictionary.py'), *sys.argv[1:]]))
