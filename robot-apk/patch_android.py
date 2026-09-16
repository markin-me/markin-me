from pathlib import Path
import re, sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'robot-apk/app/src/main/assets/index.html')
s = path.read_text(encoding='utf-8')

# 1) Android 9 WebView: no ES-module bootstrap / network dependency.
start = s.find('<script type="module">')
if start < 0:
    raise SystemExit('module script marker not found')
load_marker = 'const THREE = await loadThree();'
end_boot = s.find(load_marker, start)
if end_boot < 0:
    raise SystemExit('Three bootstrap marker not found')
end_boot += len(load_marker)
compat_boot = '''<script src="three.min.js"></script>\n<script>\n(function(){\n  window.__robotBootErrors = [];\n  window.addEventListener('error', function(e){\n    try { window.__robotBootErrors.push(String(e.message || e.error || 'JavaScript error')); } catch(_) {}\n  });\n})();\nfunction deepClone(value){ return JSON.parse(JSON.stringify(value)); }\nif(!window.THREE){\n  document.body.innerHTML = '<div style="position:fixed;inset:16px;display:grid;place-items:center;background:#eef1f5;color:#192331;font:600 16px system-ui;text-align:center;padding:24px;border-radius:20px"><div><b>Не удалось запустить 3D-движок.</b><br><br>Перезапустите приложение.</div></div>';\n  throw new Error('Local Three.js failed to load');\n}\nconst THREE = window.THREE;'''
s = s[:start] + compat_boot + s[end_boot:]

# 2) structuredClone arrived long after the original Android 9 WebView.
s = s.replace('structuredClone(', 'deepClone(')

# 3) Remove optional chaining syntax (Chrome/WebView 80+), keep behavior.
repls = {
"pattern[y]?.[x]==='1'": "(pattern[y] && pattern[y][x])==='1'",
"profile?.accent": "profile && profile.accent",
"handler?.(key)": "handler && handler(key)",
"layersTab?.classList.contains('active')": "layersTab && layersTab.classList.contains('active')",
"$('#panelHeaderToggle')?.classList.toggle('active',open)": "$('#panelHeaderToggle') && $('#panelHeaderToggle').classList.toggle('active',open)",
"panel?.classList.remove('collapsed')": "panel && panel.classList.remove('collapsed')",
"btn?.classList.toggle('active',randomAnimationsEnabled)": "btn && btn.classList.toggle('active',randomAnimationsEnabled)",
"btn?.setAttribute('aria-pressed',randomAnimationsEnabled?'true':'false')": "btn && btn.setAttribute('aria-pressed',randomAnimationsEnabled?'true':'false')",
"$('#tab-layers')?.classList.contains('active')": "$('#tab-layers') && $('#tab-layers').classList.contains('active')",
"hits[0]?.object?.userData?.part": "(hits[0] && hits[0].object && hits[0].object.userData && hits[0].object.userData.part)",
"hits[0]?.object?.userData?.gizmoAxis": "(hits[0] && hits[0].object && hits[0].object.userData && hits[0].object.userData.gizmoAxis)",
"data.faceRig?.[k]": "data.faceRig && data.faceRig[k]",
"data.partRig?.[k]": "data.partRig && data.partRig[k]",
"data.partState?.[k]": "data.partState && data.partState[k]",
"stage.setPointerCapture?.(e.pointerId)": "stage.setPointerCapture && stage.setPointerCapture(e.pointerId)",
"document.querySelector('.panel')?.classList.contains('collapsed')": "document.querySelector('.panel') && document.querySelector('.panel').classList.contains('collapsed')",
"document.querySelector('.panel')?.offsetWidth": "document.querySelector('.panel') && document.querySelector('.panel').offsetWidth",
"$('#randomMode')?.setAttribute('aria-pressed','false')": "$('#randomMode') && $('#randomMode').setAttribute('aria-pressed','false')",
}
for a,b in repls.items():
    s = s.replace(a,b)

if '?.' in s:
    remaining = [line for line in s.splitlines() if '?.' in line]
    raise SystemExit('unhandled optional chaining: ' + '\n'.join(remaining[:8]))

# 4) Android/mobile viewport + keyboard behavior.
viewport_css = r'''

    /* Android APK: content stays inside the real app viewport; system bars are handled natively. */
    :root{--keyboard-offset:0px;--visible-height:100vh}
    html,body{min-height:100%;overscroll-behavior:none}
    @media (max-width:920px){
      .mobile-chat{bottom:calc(7px + var(--keyboard-offset))!important}
      body.keyboard-open.panel-open .panel{
        top:8px!important;
        bottom:calc(8px + var(--keyboard-offset))!important;
        height:auto!important;
        max-height:none!important;
        min-height:0!important;
      }
      body.keyboard-open.panel-open .panel .tab-pane.active{min-height:0!important;overflow:auto!important;-webkit-overflow-scrolling:touch}
      body.keyboard-open .dock{display:none!important}
      body.keyboard-open .statebar{opacity:.22;pointer-events:none}
    }
'''
head_close = s.find('</style>')
if head_close < 0:
    raise SystemExit('style close not found')
s = s[:head_close] + viewport_css + s[head_close:]

keyboard_js = r'''

// Android viewport / soft keyboard compatibility.
(function(){
  var root = document.documentElement;
  var body = document.body;
  var focusTimer = 0;
  function formControl(el){
    if(!el || !el.tagName) return false;
    var t = el.tagName.toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select';
  }
  function updateKeyboardViewport(){
    var vv = window.visualViewport;
    var offset = 0;
    if(vv){
      offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--visible-height', Math.max(1, Math.round(vv.height)) + 'px');
    } else {
      root.style.setProperty('--visible-height', Math.max(1, window.innerHeight) + 'px');
    }
    root.style.setProperty('--keyboard-offset', offset + 'px');
    if(formControl(document.activeElement)) body.classList.add('keyboard-open');
  }
  function revealFocused(el){
    if(!formControl(el)) return;
    var pane = el.closest ? el.closest('.tab-pane') : null;
    window.setTimeout(function(){
      try{
        if(pane){
          var er=el.getBoundingClientRect(), pr=pane.getBoundingClientRect();
          if(er.bottom > pr.bottom - 14) pane.scrollTop += er.bottom - pr.bottom + 24;
          else if(er.top < pr.top + 14) pane.scrollTop -= pr.top - er.top + 24;
        } else if(el.scrollIntoView){
          el.scrollIntoView(false);
        }
      }catch(_){}
      updateKeyboardViewport();
    }, 260);
  }
  document.addEventListener('focusin', function(e){
    if(!formControl(e.target)) return;
    body.classList.add('keyboard-open');
    clearTimeout(focusTimer);
    updateKeyboardViewport();
    revealFocused(e.target);
  }, true);
  document.addEventListener('focusout', function(){
    clearTimeout(focusTimer);
    focusTimer = window.setTimeout(function(){
      if(!formControl(document.activeElement)){
        body.classList.remove('keyboard-open');
        root.style.setProperty('--keyboard-offset','0px');
      }
      updateKeyboardViewport();
    }, 220);
  }, true);
  window.addEventListener('resize', updateKeyboardViewport);
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', updateKeyboardViewport);
    window.visualViewport.addEventListener('scroll', updateKeyboardViewport);
  }
  updateKeyboardViewport();
})();
'''
marker = '// public API'
pos = s.find(marker)
if pos < 0:
    raise SystemExit('public API marker not found')
s = s[:pos] + keyboard_js + '\n' + s[pos:]

# 5) Make GLB export explicit offline rather than trying a remote ES module in old WebView.
s = re.sub(
    r"async function exportGLB\(\)\{.*?\n\}",
    "function exportGLB(){ toast('GLB-экспорт в Android 9 сборке пока отключён'); }",
    s,
    count=1,
    flags=re.S,
)

for forbidden in ['type="module"', 'await loadThree()', 'structuredClone(', 'https://cdn.jsdelivr.net/npm/three@0.167.1', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.167.1', 'https://esm.sh/three@']:
    if forbidden in s:
        raise SystemExit('forbidden token remains: ' + forbidden)
if '<script src="three.min.js"></script>' not in s:
    raise SystemExit('local Three.js script missing')

path.write_text(s, encoding='utf-8')
print('patched', path, len(s.encode('utf-8')), 'bytes')
