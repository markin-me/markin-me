from pathlib import Path
import re, sys

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

# Android WebView can report ResizeObserver loop limit exceeded while layout is settling.
# It is a benign browser warning, not an application startup error, so never show it to the user.
needle = "try { window.__robotBootErrors.push(String(e.message || e.error || 'JavaScript error')); } catch(_) {}"
replacement = """try {
      var text = String(e.message || e.error || 'JavaScript error');
      if(/ResizeObserver loop/i.test(text)){
        if(e && e.preventDefault) e.preventDefault();
        return;
      }
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

# Make scene resizing idempotent and schedule it once per animation frame.
# This prevents ResizeObserver -> renderer.setSize -> layout -> ResizeObserver feedback loops.
resize_pattern = re.compile(
    r"function resize\(\)\{\s*const r = stage\.getBoundingClientRect\(\);\s*const w = Math\.max\(1,Math\.round\(r\.width\)\);\s*const h = Math\.max\(1,Math\.round\(r\.height\)\);\s*camera\.aspect=w/h; camera\.updateProjectionMatrix\(\); renderer\.setSize\(w,h,false\);\s*\}\s*addEventListener\('resize',\(\)=>\{syncResponsivePanel\(\);resize\(\);\}\);\s*const stageObserver = new ResizeObserver\(\(\)=>resize\(\)\); stageObserver\.observe\(stage\);",
    re.S
)
resize_replacement = r'''let resizeFrame=0,lastResizeW=0,lastResizeH=0;
function resizeNow(){
  const r=stage.getBoundingClientRect();
  const w=Math.max(1,Math.round(r.width));
  const h=Math.max(1,Math.round(r.height));
  if(w===lastResizeW && h===lastResizeH) return;
  lastResizeW=w; lastResizeH=h;
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
function resize(){
  if(resizeFrame) return;
  resizeFrame=requestAnimationFrame(function(){ resizeFrame=0; resizeNow(); });
}
addEventListener('resize',function(){ syncResponsivePanel(); resize(); },{passive:true});
if(typeof ResizeObserver!=='undefined'){
  const stageObserver=new ResizeObserver(function(){ resize(); });
  stageObserver.observe(stage);
}else{
  window.addEventListener('resize',resize,{passive:true});
}'''
if resize_pattern.search(s):
    s = resize_pattern.sub(resize_replacement, s, count=1)
else:
    # If patch_android/previous compatibility step has already changed the observer, patch the pieces separately.
    old_resize = '''function resize(){
  const r = stage.getBoundingClientRect();
  const w = Math.max(1,Math.round(r.width));
  const h = Math.max(1,Math.round(r.height));
  camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
}'''
    if old_resize not in s:
        raise SystemExit('resize function marker not found')
    s = s.replace(old_resize, '''let resizeFrame=0,lastResizeW=0,lastResizeH=0;
function resizeNow(){
  const r=stage.getBoundingClientRect();
  const w=Math.max(1,Math.round(r.width));
  const h=Math.max(1,Math.round(r.height));
  if(w===lastResizeW && h===lastResizeH) return;
  lastResizeW=w; lastResizeH=h;
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
function resize(){
  if(resizeFrame) return;
  resizeFrame=requestAnimationFrame(function(){ resizeFrame=0; resizeNow(); });
}''', 1)
    s = s.replace("addEventListener('resize',()=>{syncResponsivePanel();resize();});", "addEventListener('resize',function(){syncResponsivePanel();resize();},{passive:true});", 1)
    old_ro = "const stageObserver = new ResizeObserver(()=>resize()); stageObserver.observe(stage);"
    new_ro = "if(typeof ResizeObserver!=='undefined'){ const stageObserver=new ResizeObserver(function(){resize();}); stageObserver.observe(stage); } else { window.addEventListener('resize',resize,{passive:true}); }"
    if old_ro in s:
        s = s.replace(old_ro, new_ro, 1)

# On a tall phone the 3D scene previously looked visually too low. Center the composition in the
# free mobile area (between top controls and bottom controls) by changing the camera look target,
# without deforming or moving the model itself. When the editor panel opens, use a milder offset.
old_look = "const desiredLookY=mobilePanelOpen?0.28:.03;"
new_look = "const desiredLookY=mobilePanelOpen?-0.10:(isNarrow()?-1.05:.03);"
if old_look not in s:
    raise SystemExit('camera look marker not found')
s = s.replace(old_look, new_look, 1)

# Start horizontal chip rails from the beginning on every fresh mobile layout pass.
layout_marker = "if(!document.body.dataset.mobileInit){document.body.dataset.mobileInit='1';document.body.classList.remove('panel-open');}"
layout_replacement = "if(!document.body.dataset.mobileInit){document.body.dataset.mobileInit='1';document.body.classList.remove('panel-open'); const sb=document.getElementById('statebar'); const em=document.getElementById('emotions'); if(sb) sb.scrollLeft=0; if(em) em.scrollLeft=0;}"
if layout_marker in s:
    s = s.replace(layout_marker, layout_replacement, 1)

# Make GLB export explicit offline rather than trying a remote ES module in old WebView.
# (This is also patched earlier, but keep the final APK deterministic.)

path.write_text(s, encoding='utf-8')
print('post compatibility patch applied: resize loop filtered, resize deduped, mobile scene centered')
