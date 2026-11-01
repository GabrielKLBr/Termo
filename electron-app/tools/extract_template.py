from bs4 import BeautifulSoup
from pathlib import Path
import json,re,html
ROOT=Path(__file__).resolve().parent.parent
RAW=(ROOT/'original/template-captura.html').read_text()
soup=BeautifulSoup(RAW,'html.parser')
assets=ROOT/'assets';assets.mkdir(exist_ok=True)
for i,img in enumerate(soup.find_all('img')):
 src=img.get('src','')
 if src.startswith('data:image/svg+xml;base64,'):
  import base64
  name={0:'sobre',1:'menu',2:'estatisticas',3:'configuracoes',4:'apagar'}.get(i,'icone')
  (assets/f'{name}.svg').write_bytes(base64.b64decode(src.split(',')[1]))
  # Keep the original data URI in HTML; extracted SVGs are backup and for offline use.
components={}
for name in ['wc-bar','wc-header','wc-notify','wc-kbd','wc-modal']:
 tag=soup.select_one(name)
 # only clones of original template components; no reimplementation
 components[name]=str(tag)
row=soup.select_one('wc-row');board=soup.select_one('wc-board')
rowstyle=row.find('style').text
boardstyle=board.find('style').text
(ROOT/'src').mkdir(exist_ok=True)
(ROOT/'src/styles.js').write_text('// CSS extracted from the provided Termo HTML capture, unchanged except CSS syntax artifacts.\nexport const BOARD_STYLE = '+json.dumps(boardstyle,ensure_ascii=False)+';\nexport const ROW_STYLE = '+json.dumps(rowstyle,ensure_ascii=False)+';\n')
headstyles='\n'.join(str(st) for st in soup.head.find_all('style'))
# Correct transcription artifacts from Markdown without changing styles.
components['wc-kbd']=components['wc-kbd'].replace('*background*','background').replace('grid-row: 3 span 1;', 'grid-row: 3 / span 1;')
header=soup.select_one('wc-header')
html_doc=f'''<!doctype html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#6E5C62"><meta name="color-scheme" content="light only">
<meta name="description" content="Termo, Dueto e Quarteto. Um jogo de palavras em português.">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Mitr:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<title>Termo</title>
{headstyles}
<style id="style_extension">
/* Complementos exclusivamente funcionais: preservam os estilos originais acima. */
#boards {{min-height:0;}}
wc-board {{min-width:0;min-height:0;}}
wc-kbd button:focus-visible, wc-header button:focus-visible {{outline:2px solid #fafaff;outline-offset:2px;}}
wc-bar a:focus-visible {{outline:2px solid #fafaff;}}
wc-modal[aria-hidden="false"] {{display:block !important;}}
#modal-content {{color:#fafaff;font-family:Mitr,sans-serif;font-size:min(3vh,19px);font-weight:300;line-height:1.55;}}
#modal-content h2 {{font-size:1.8em;line-height:1.2;margin:0 0 .7em;font-weight:600;color:#fafaff}}
#modal-content p {{margin:.65em 0;color:#ded5d9;}}
#modal-content button {{font-family:inherit;font-size:.98em;border:0;border-radius:.3em;background:#009afe;color:#fafaff;padding:.45em .9em;cursor:pointer;margin:.3em .3em .3em 0;}}
#modal-content button.secondary {{background:#615458;}}
#modal-content .close-dialog {{float:right;background:transparent;color:#fafaff;font-size:1.2em;padding:0 .3em;margin:0 0 .25em .5em;}}
#modal-content .switch-row {{display:flex;justify-content:space-between;align-items:center;gap:1.3em;padding:.4em 0;}}
#modal-content input[type=checkbox] {{width:1.1em;height:1.1em;accent-color:#3aa394;cursor:pointer;}}
#modal-content .stats-grid {{display:grid;grid-template-columns:repeat(4,1fr);gap:.5em;text-align:center;}}
#modal-content .stats-grid strong {{display:block;font-size:1.5em;font-weight:600;}}
#modal-content .stats-grid small {{font-size:.65em;color:#bbb;}}
#modal-content .bar-item {{display:flex;align-items:center;gap:.5em;margin:.35em 0;}}
#modal-content .bar-item>span {{width:1em;}}
#modal-content .bar-item>div {{background:#3aa394;color:white;text-align:right;min-width:1.1em;padding:.1em .4em;border-radius:.2em;font-weight:500;}}
#modal-content a {{color:#dee9ff;}}
#modal-content .message-line {{font-size:.85em;color:#bbb}}
#modal-content .help-letter {{display:inline-flex;width:1.9em;height:1.9em;justify-content:center;align-items:center;border:2px solid #4c4347;border-radius:10%;font-weight:600;color:#fff;margin-right:.12em;}}
#modal-content .help-letter.right {{background:var(--colorRight);border-color:var(--colorRight);}}
#modal-content .help-letter.place {{background:var(--colorPlace);border-color:var(--colorPlace);}}
#modal-content .help-letter.wrong {{background:var(--colorWrong);border-color:var(--colorWrong);}}
#modal-content .share-preview {{white-space:pre-wrap;font-size:.8em;line-height:1.4;word-break:break-word;}}
@media (max-width:520px) {{#modal-content {{font-size:16px;}}}}
</style>
</head><body>
{components['wc-bar']}
{components['wc-header']}
{components['wc-notify']}
<main id="boards" aria-label="Tabuleiros de palavras"></main>
{components['wc-kbd']}
{components['wc-modal'].replace('style="display: none;"','role="dialog" aria-modal="true" aria-hidden="true" style="display: none;"')}
<script type="module" src="./src/main.js"></script>
</body></html>'''
(ROOT/'index.html').write_text(html_doc)
print('wrote index',len(html_doc),'css board/row',len(boardstyle),len(rowstyle))
