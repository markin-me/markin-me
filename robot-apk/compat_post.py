from pathlib import Path
import sys

path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')

# Chrome/WebView versions shipped with Android 9 do not parse logical assignment.
s = s.replace(
    "const rows = timelines[key] ||= [];",
    "const rows = timelines[key] || (timelines[key] = []);"
)

# Explicitly request WebGL2 first and WebGL1 as a fallback. three r160 still supports WebGL1.
old = "const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});"
new = r'''const rendererCanvas = document.createElement('canvas');
const rendererAttrs = {antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'};
const rendererContext = rendererCanvas.getContext('webgl2', rendererAttrs) || rendererCanvas.getContext('webgl', rendererAttrs) || rendererCanvas.getContext('experimental-webgl', rendererAttrs);
if(!rendererContext){
  const msg = document.createElement('div');
  msg.style.cssText = 'position:absolute;left:14px;right:14px;top:38%;z-index:9999;padding:18px;border-radius:16px;background:#2b3442;color:#fff;font:600 14px system-ui;text-align:center';
  msg.innerHTML = 'На этом Android WebView не удалось включить WebGL.<br><small style="opacity:.72">Обновите Android System WebView / Chrome и перезапустите приложение.</small>';
  stage.appendChild(msg);
  throw new Error('WebGL is unavailable in Android WebView');
}
window.__robotWebGL = (typeof WebGL2RenderingContext !== 'undefined' && rendererContext instanceof WebGL2RenderingContext) ? 2 : 1;
const renderer = new THREE.WebGLRenderer({canvas:rendererCanvas,context:rendererContext,antialias:true,alpha:true,preserveDrawingBuffer:true});'''
if old not in s:
    raise SystemExit('renderer marker not found')
s = s.replace(old, new, 1)

# ResizeObserver exists on normal Android 9 WebView, but keep a window-resize fallback.
old_ro = "const stageObserver = new ResizeObserver(()=>resize()); stageObserver.observe(stage);"
new_ro = "if(typeof ResizeObserver!=='undefined'){ const stageObserver=new ResizeObserver(function(){resize();}); stageObserver.observe(stage); } else { window.addEventListener('resize',resize); }"
if old_ro in s:
    s = s.replace(old_ro, new_ro, 1)

# Runtime errors should be visible on the device instead of leaving a silent blank UI.
needle = "try { window.__robotBootErrors.push(String(e.message || e.error || 'JavaScript error')); } catch(_) {}"
replacement = """try {
      var text = String(e.message || e.error || 'JavaScript error');
      window.__robotBootErrors.push(text);
      if(!document.getElementById('androidBootError')){
        var box=document.createElement('div'); box.id='androidBootError';
        box.style.cssText='position:fixed;left:10px;right:10px;bottom:74px;z-index:99999;padding:10px 12px;border-radius:12px;background:rgba(120,20,30,.94);color:white;font:600 11px system-ui;word-break:break-word';
        box.textContent='Ошибка запуска: '+text;
        document.body.appendChild(box);
      }
    } catch(_) {}"""
if needle in s:
    s = s.replace(needle, replacement, 1)

path.write_text(s, encoding='utf-8')
print('post compatibility patch applied')
