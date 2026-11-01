#!/usr/bin/env python3
"""Converte o prepare-dictionary.mjs para Python 3 (sem pacotes externos).

Fontes: https://github.com/fserb/pt-br
Saídas: dictionary.json (navegador), dictionary.sqlite3 (SQLite),
        info.json (metadados) e fserb-pt-br-LICENSE.txt.

Exemplos:
    python tools/prepare_dictionary.py
    python tools/prepare_dictionary.py --output-dir data --max-icf 14.5
    python tools/prepare_dictionary.py --corpus-dir caminho/para/fontes
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata
from urllib.parse import quote
from urllib.request import Request, urlopen

SOURCES = ("lexico", "conjugações", "icf", "listas/negativas", "LICENSE")
URL = "https://raw.githubusercontent.com/fserb/pt-br/master/"
FIVE = re.compile(r"^[a-záàâãéêíóôõúüç]{5}$", re.IGNORECASE)


def normalize_word(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip().lower())


def base_of(word: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", word)
                   if not unicodedata.combining(c)).upper()


def clean(text: str) -> list[str]:
    return [w for line in text.splitlines()
            if FIVE.fullmatch(w := normalize_word(line))]


def fetch(path: str, corpus_dir: Path | None) -> str:
    if corpus_dir is not None:
        return (corpus_dir / path).read_text(encoding="utf-8")
    url = URL + "/".join(quote(piece, safe="") for piece in path.split("/"))
    req = Request(url, headers={"User-Agent": "termo-ilimitado-dictionary-importer"})
    with urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8")


def sort_key(word: str) -> tuple[str, str]:
    """Aproxima o desempate pt-BR do JS em ambientes sem locale pt_BR."""
    return (base_of(word), word)


def build(texts: dict[str, str], max_icf: float, min_answers: int = 100):
    lex = clean(texts["lexico"])
    conj = clean(texts["conjugações"])
    negatives = {base_of(w) for w in clean(texts["listas/negativas"])}
    freq: dict[str, float] = {}
    for line in texts["icf"].splitlines():
        pos = line.rfind(",")
        if pos < 0:
            continue
        word = normalize_word(line[:pos])
        try:
            score = float(line[pos + 1:].strip())
        except ValueError:
            continue
        if FIVE.fullmatch(word) and math.isfinite(score):
            freq[word] = score

    lexical = set(lex)
    by_base: dict[str, list[str]] = {}
    for word in lexical:
        by_base.setdefault(base_of(word), []).append(word)

    def priority(word: str):
        return (freq.get(word, 99.0), 0 if word in lexical else 1, sort_key(word))

    indexed: dict[str, str] = {}
    for word in sorted(set(lex) | set(conj) | set(freq), key=priority):
        indexed.setdefault(base_of(word), word.upper())

    answers = []
    for key, words in by_base.items():
        if key in negatives:
            continue
        candidates = [w for w in words if freq.get(w, math.inf) <= max_icf]
        if candidates:
            answers.append(min(candidates, key=priority).upper())
    answers.sort(key=sort_key)

    if not indexed or len(answers) < min_answers:
        raise ValueError("Dados insuficientes; verifique as fontes e o limite ICF.")

    meta = {
        "source": "https://github.com/fserb/pt-br",
        "branch": "master",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "hashes": {name: hashlib.sha256(text.encode("utf-8")).hexdigest()
                   for name, text in texts.items()},
        "originals": {
            "lexico": len(texts["lexico"].strip().splitlines()),
            "conjugacoes": len(texts["conjugações"].strip().splitlines()),
            "icf": len(texts["icf"].strip().splitlines()),
        },
        "fiveLetterForms": {"lexico": len(lex), "conjugacoes": len(conj),
                            "icf": len(freq)},
        "accepted": len(indexed), "answers": len(answers), "maxICF": max_icf,
        "policy": ("Todas as grafias de cinco letras do léxico, conjugações e ICF "
                   "como palpites; respostas do léxico com ICF <= maxICF, "
                   "excluindo negativas; desambiguação pela pontuação ICF e "
                   "ordem lexicográfica.")
    }
    payload = {"meta": meta, "index": sorted(indexed.items()), "answers": answers}
    return payload, lexical, set(conj), freq


def save_db(path: Path, payload: dict, lexical: set[str] | None = None,
            conjugations: set[str] | None = None,
            freq: dict[str, float] | None = None) -> None:
    """SQLite consultável por Python e backend. Cria arquivo de forma atômica."""
    lexical, conjugations, freq = lexical or set(), conjugations or set(), freq or {}
    tmp = path.with_suffix(path.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    conn = sqlite3.connect(tmp)
    try:
        conn.executescript("""
            PRAGMA journal_mode=DELETE;
            CREATE TABLE words (
                base TEXT PRIMARY KEY NOT NULL CHECK(length(base) = 5),
                spelling TEXT NOT NULL,
                is_answer INTEGER NOT NULL DEFAULT 0 CHECK(is_answer IN (0, 1)),
                icf REAL
            );
            CREATE INDEX idx_words_answer ON words(is_answer);
            CREATE INDEX idx_words_spelling ON words(spelling);
            -- A grafia usada nas respostas pode ser diferente da forma
            -- preferencial do índice (ex.: SABIA / SÁBIA). Nunca inferir
            -- uma resposta apenas de words.spelling.
            CREATE TABLE answers (
                base TEXT PRIMARY KEY NOT NULL,
                spelling TEXT NOT NULL,
                FOREIGN KEY(base) REFERENCES words(base)
            );
            CREATE TABLE forms (
                spelling TEXT PRIMARY KEY NOT NULL,
                base TEXT NOT NULL,
                in_lexicon INTEGER NOT NULL DEFAULT 0,
                in_conjugations INTEGER NOT NULL DEFAULT 0,
                icf REAL,
                FOREIGN KEY(base) REFERENCES words(base)
            );
            CREATE INDEX idx_forms_base ON forms(base);
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        answer_bases = {base_of(w) for w in payload["answers"]}
        conn.executemany(
            "INSERT INTO words(base, spelling, is_answer, icf) VALUES (?, ?, ?, ?)",
            ((base, spelling, int(base in answer_bases),
              freq.get(spelling.lower())) for base, spelling in payload["index"])
        )
        conn.executemany(
            "INSERT INTO answers(base, spelling) VALUES (?, ?)",
            ((base_of(spelling), spelling) for spelling in payload["answers"])
        )
        if lexical or conjugations or freq:
            forms = sorted(lexical | conjugations | set(freq))
            conn.executemany(
                "INSERT INTO forms(spelling,base,in_lexicon,in_conjugations,icf) "
                "VALUES(?,?,?,?,?)",
                ((word, base_of(word), int(word in lexical),
                  int(word in conjugations), freq.get(word)) for word in forms)
            )
        else:
            conn.executemany(
                "INSERT INTO forms(spelling,base,in_lexicon,in_conjugations,icf) "
                "VALUES(?,?,?,?,?)",
                ((spelling.lower(), base, 0, 0, None)
                 for base, spelling in payload["index"])
            )
        conn.executemany("INSERT INTO metadata(key,value) VALUES (?,?)",
                         ((key, json.dumps(val, ensure_ascii=False))
                          for key, val in payload["meta"].items()))
        conn.commit()
    finally:
        conn.close()
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    script_dir = Path(__file__).resolve().parent
    root = script_dir.parent if script_dir.name == "tools" else script_dir
    parser.add_argument("--corpus-dir", type=Path,
                        default=Path(os.environ["TERMO_CORPUS_DIR"])
                        if os.environ.get("TERMO_CORPUS_DIR") else None,
                        help="Usar fontes locais em vez de baixar do GitHub")
    parser.add_argument("--output-dir", type=Path,
                        default=Path(os.environ.get("TERMO_OUTPUT_DIR", str(root / "data"))))
    parser.add_argument("--max-icf", type=float,
                        default=float(os.environ.get("TERMO_MAX_ICF", "14.5")))
    parser.add_argument("--from-json", type=Path,
                        help="Gerar/atualizar o SQLite a partir de dictionary.json já pronto")
    args = parser.parse_args()
    if not math.isfinite(args.max_icf):
        parser.error("--max-icf precisa ser finito")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.from_json:
        payload = json.loads(args.from_json.read_text(encoding="utf-8"))
        if not payload.get("index") or not payload.get("answers"):
            parser.error("--from-json precisa de um JSON com index e answers")
        license_text = None
        lexical = conjugations = freq = None
    else:
        try:
            with ThreadPoolExecutor(max_workers=5) as pool:
                contents = list(pool.map(lambda name: fetch(name, args.corpus_dir), SOURCES))
            texts = dict(zip(SOURCES, contents))
            payload, lexical, conjugations, freq = build(texts, args.max_icf)
            license_text = texts["LICENSE"]
        except (OSError, ValueError) as err:
            print(f"Falha ao preparar o dicionário: {err}", file=sys.stderr)
            return 1

    (output / "dictionary.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (output / "info.json").write_text(
        json.dumps(payload["meta"], ensure_ascii=False, indent=2), encoding="utf-8")
    save_db(output / "dictionary.sqlite3", payload, lexical, conjugations, freq)
    if license_text is not None:
        (output / "fserb-pt-br-LICENSE.txt").write_text(license_text, encoding="utf-8")
    print(f"Arquivo gerado: {output / 'dictionary.json'}")
    print(f"Banco SQLite:   {output / 'dictionary.sqlite3'}")
    print(f"Palpites: {len(payload['index']):,}; respostas: {len(payload['answers']):,}")
    print("Teste: SELECT * FROM words WHERE base = 'TRENS';")
    print("Respostas (acentos preservados): SELECT spelling FROM answers;")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
