"""Gera a versão HTML (com botões de copiar) de um relatório .md desta pasta.

Uso: python3 relatorios/gerar_html.py relatorios/<relatorio>.md
"""
import html
import json
import re
import sys

md_path = sys.argv[1]
html_path = md_path[:-3] + '.html'
src = open(md_path, encoding='utf-8').read().strip('\n').split('\n')


def inl(t):
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', html.escape(t))


out, wa, inlist = [], [], False
for l in src:
    if l.startswith('- '):
        if not inlist:
            out.append('<ul>')
            inlist = True
        out.append('<li>' + inl(l[2:]) + '</li>')
        wa.append('• ' + l[2:])
        continue
    if inlist:
        out.append('</ul>')
        inlist = False
    if l == '---':
        out.append('<hr>')
        wa.append('━━━━━━━━━━━━━━━━━━')
    elif l.startswith('#'):
        t = l.lstrip('#').strip()
        out.append('<p><b>' + html.escape(t) + '</b></p>')
        wa.append('*' + t + '*')
    elif l == '':
        out.append('')
        wa.append('')
    else:
        out.append('<div>' + inl(l) + '</div>')
        wa.append(l.replace('**', '*'))
if inlist:
    out.append('</ul>')
body = '\n'.join(out).replace('\n\n', '\n<br>\n')
watext = '\n'.join(wa)

page = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório Equipe 1</title>
<style>
:root{{--bg:#fff;--fg:#111;--mut:#666;--btn:#1a5fd0}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#1b1b1b;--fg:#eee;--mut:#aaa;--btn:#4c8dff}}}}
body{{background:var(--bg);color:var(--fg);font:16px/1.45 Calibri,Arial,sans-serif;margin:0;padding:16px;max-width:760px}}
.bar{{position:sticky;top:0;background:var(--bg);padding:8px 0 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}}
button{{background:var(--btn);color:#fff;border:0;border-radius:6px;padding:10px 14px;font-size:15px;cursor:pointer}}
#msg{{color:var(--mut);font-size:14px}}
#rel ul{{margin:4px 0;padding-left:24px}} #rel hr{{border:0;border-top:1px solid #999;margin:12px 0}} #rel p{{margin:0}}
</style></head><body>
<div class="bar"><button id="c1">Copiar com negrito (Word / e-mail)</button><button id="c2">Copiar para WhatsApp</button><span id="msg"></span></div>
<div id="rel">
{body}
</div>
<script>
const WA={json.dumps(watext, ensure_ascii=False)};
const msg=t=>{{document.getElementById('msg').textContent=t}};
function selCopy(el){{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);let ok=false;try{{ok=document.execCommand('copy')}}catch(e){{}}return ok}}
document.getElementById('c1').onclick=async()=>{{const el=document.getElementById('rel');
 try{{await navigator.clipboard.write([new ClipboardItem({{'text/html':new Blob([el.innerHTML],{{type:'text/html'}}),'text/plain':new Blob([el.innerText],{{type:'text/plain'}})}})]);msg('Copiado! Cole com Ctrl+V.');return}}catch(e){{}}
 msg(selCopy(el)?'Copiado! Cole com Ctrl+V.':'Texto selecionado: aperte Ctrl+C.')}};
document.getElementById('c2').onclick=async()=>{{try{{await navigator.clipboard.writeText(WA);msg('Copiado para WhatsApp! Cole com Ctrl+V.');return}}catch(e){{}}
 const t=document.createElement('textarea');t.value=WA;document.body.appendChild(t);t.select();let ok=false;try{{ok=document.execCommand('copy')}}catch(e){{}}t.remove();msg(ok?'Copiado para WhatsApp! Cole com Ctrl+V.':'Não consegui copiar automaticamente.')}};
</script></body></html>'''
open(html_path, 'w', encoding='utf-8').write(page)
print(html_path)
