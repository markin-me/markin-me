from pathlib import Path
import re, sys

path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')

# Android 9 syntax compatibility.
s = s.replace("const rows = timelines[key] ||= [];", "const rows = timelines[key] || (timelines[key] = []);")

# Broader WebGL compatibility and lower-cost renderer setup for old phones.
old = "const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});"
new = r'''const rendererCanvas = document.createElement('canvas');
const rendererAttrs = {antialias:true,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'};
const rendererContext = rendererCanvas.getContext('webgl2', rendererAttrs) || rendererCanvas.getContext('webgl', rendererAttrs) || rendererCanvas.getContext('experimental-webgl', rendererAttrs);
if(!rendererContext){
  const msg = document.createElement('div');
  msg.style.cssText = 'position:absolute;left:14px;right:14px;top:38%;z-index:9999;padding:18px;border-radius:16px;background:#2b3442;color:#fff;font:600 14px system-ui;text-align:center';
  msg.innerHTML = 'На этом Android WebView не удалось включить WebGL.<br><small style="opacity:.72">Обновите Android System WebView / Chrome и перезапустите приложение.</small>';
  stage.appendChild(msg);
  throw new Error('WebGL is unavailable in Android WebView');
}
window.__robotWebGL = (typeof WebGL2RenderingContext !== 'undefined' && rendererContext instanceof WebGL2RenderingContext) ? 2 : 1;
const renderer = new THREE.WebGLRenderer({canvas:rendererCanvas,context:rendererContext,antialias:true,alpha:true,preserveDrawingBuffer:false});'''
if old in s:
    s = s.replace(old, new, 1)
elif 'const rendererCanvas = document.createElement' not in s:
    raise SystemExit('renderer marker not found')

s = s.replace("renderer.setPixelRatio(Math.min(devicePixelRatio,2));", "renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(max-width:920px)').matches ? 1.25 : 1.7));", 1)
s = s.replace("renderer.shadowMap.enabled = true;", "renderer.shadowMap.enabled = !matchMedia('(max-width:920px)').matches;", 1)
# Lighter meshes are materially faster on Android 9 and are visually indistinguishable at phone size.
s = s.replace("new THREE.SphereGeometry(1,96,64)", "new THREE.SphereGeometry(1,56,40)")
s = s.replace("new THREE.SphereGeometry(1,72,36", "new THREE.SphereGeometry(1,48,24")
s = s.replace("Array.from({length:48}, createParticle)", "Array.from({length:24}, createParticle)")
# Bubble texture does not need a redraw every frame unless text is typing.
s = s.replace("renderFace(t); renderBubble(); updateSelectionHelper();", "renderFace(t); if(isSpeaking) renderBubble(); updateSelectionHelper();", 1)

# Filter benign ResizeObserver warnings from the visible runtime error banner.
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

# Stable resize scheduling.
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
elif 'let resizeFrame=0,lastResizeW=0,lastResizeH=0;' not in s:
    old_resize = '''function resize(){
  const r = stage.getBoundingClientRect();
  const w = Math.max(1,Math.round(r.width));
  const h = Math.max(1,Math.round(r.height));
  camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
}'''
    if old_resize not in s:
        raise SystemExit('resize function marker not found')
    s = s.replace(old_resize, resize_replacement.split("addEventListener")[0].rstrip(), 1)
    s = s.replace("addEventListener('resize',()=>{syncResponsivePanel();resize();});", "addEventListener('resize',function(){syncResponsivePanel();resize();},{passive:true});", 1)
    s = s.replace("const stageObserver = new ResizeObserver(()=>resize()); stageObserver.observe(stage);", "if(typeof ResizeObserver!=='undefined'){ const stageObserver=new ResizeObserver(function(){resize();}); stageObserver.observe(stage); } else { window.addEventListener('resize',resize,{passive:true}); }", 1)

# Give the model a little more breathing room on a phone and keep it centered in the free scene.
s = s.replace("const responsiveFit = stageAspect < .90 ? Math.min(3.2, .90 / stageAspect) : 1;", "const responsiveFit = stageAspect < .90 ? Math.min(3.35, (.96 / stageAspect) * 1.08) : 1;", 1)
s = s.replace("const desiredLookY=mobilePanelOpen?0.28:.03;", "const desiredLookY=mobilePanelOpen?-1.30:(isNarrow()?-1.42:.03);", 1)
s = s.replace("const desiredLookY=mobilePanelOpen?-0.10:(isNarrow()?-1.05:.03);", "const desiredLookY=mobilePanelOpen?-1.30:(isNarrow()?-1.42:.03);", 1)

# Faster direct manipulation: less lag while dragging, without making idle animation jittery.
s = s.replace("headTargetY += dx*.0075; headTargetX += dy*.006;", "headTargetY += dx*.0105; headTargetX += dy*.0085;", 1)
s = s.replace("currentX += (headTargetX + idleX + b.x - currentX) * cfg.damping;", "currentX += (headTargetX + idleX + b.x - currentX) * (dragging ? Math.max(cfg.damping,.24) : cfg.damping);", 1)
s = s.replace("currentY += (headTargetY + idleY + b.y - currentY) * cfg.damping * .9;", "currentY += (headTargetY + idleY + b.y - currentY) * (dragging ? Math.max(cfg.damping,.24) : cfg.damping) * .9;", 1)

# Mobile overlay layout: 3D owns the whole screen. UI floats over it.
mobile_css = r'''

/* APK v5 mobile overlay layout */
@media (max-width:920px){
  #stage, body.panel-open #stage, body:not(.panel-open) #stage, body.keyboard-open #stage{inset:0!important;top:0!important;right:0!important;bottom:0!important;left:0!important}
  body.panel-open .topbar, body.panel-open .statebar{display:none!important}
  body.keyboard-open .topbar, body.keyboard-open .statebar, body.keyboard-open .dock{display:none!important}
  body.random-mode .statebar, body.random-mode .dock{display:none!important}
  body.panel-open .panel{top:39vh!important;bottom:8px!important}
  body.keyboard-open .mobile-chat{z-index:80!important}
  .mobile-chat{z-index:80!important}
}
body.random-mode .statebar,body.random-mode .dock{display:none!important}
'''
style_end = s.find('</style>')
if style_end < 0: raise SystemExit('style close not found')
if 'APK v5 mobile overlay layout' not in s:
    s = s[:style_end] + mobile_css + s[style_end:]

# Randomizer configuration and message presets.
random_pool_marker = "const randomAnimationPool=['greeting','nod','shake','laugh','success','error','love','excited','sleepy','curious','alert','scan','shy','cool','thinking'];"
random_support = r'''
const randomizerCfg={minDelay:.7,maxDelay:3,messageChance:.30,speechSpeed:1.25,messagesEnabled:true};
let randomMessagePresets=['Привет! 👋','Как настроение? 😊','Я рядом и готов помочь. 🤖','Сейчас подумаю... 🤔','Готово! 🎉','Отличная идея! ✨'];
function normalizeRandomizerCfg(){
  randomizerCfg.minDelay=Math.max(.25,Math.min(8,Number(randomizerCfg.minDelay)||.7));
  randomizerCfg.maxDelay=Math.max(randomizerCfg.minDelay+.1,Math.min(12,Number(randomizerCfg.maxDelay)||3));
  randomizerCfg.messageChance=Math.max(0,Math.min(1,Number(randomizerCfg.messageChance)||0));
  randomizerCfg.speechSpeed=Math.max(.5,Math.min(3,Number(randomizerCfg.speechSpeed)||1.25));
}
function saveRandomizerPrefs(){
  normalizeRandomizerCfg();
  try{localStorage.setItem('robotRandomizerV2',JSON.stringify({cfg:randomizerCfg,messages:randomMessagePresets}));}catch(_){ }
}
function loadRandomizerPrefs(){
  try{
    const raw=localStorage.getItem('robotRandomizerV2'); if(!raw)return;
    const data=JSON.parse(raw); if(data&&data.cfg)Object.assign(randomizerCfg,data.cfg);
    if(data&&Array.isArray(data.messages)&&data.messages.length)randomMessagePresets=data.messages.filter(Boolean).slice(0,40);
    normalizeRandomizerCfg();
  }catch(_){ }
}
function mountRandomizerSettings(){
  const root=document.getElementById('tab-animation'); if(!root||document.getElementById('randomizerSettings'))return;
  const d=document.createElement('details');d.id='randomizerSettings';d.open=true;d.innerHTML='<summary>Рандомайзер</summary>';
  const sec=document.createElement('div');sec.className='section';
  sec.appendChild(makeRange('minDelay','Минимальная пауза, сек',.25,5,.05,randomizerCfg,function(){normalizeRandomizerCfg();saveRandomizerPrefs();}));
  sec.appendChild(makeRange('maxDelay','Максимальная пауза, сек',.5,10,.05,randomizerCfg,function(){normalizeRandomizerCfg();saveRandomizerPrefs();}));
  sec.appendChild(makeRange('messageChance','Шанс фразы',0,1,.05,randomizerCfg,function(){saveRandomizerPrefs();}));
  sec.appendChild(makeRange('speechSpeed','Скорость печати фразы',.5,3,.05,randomizerCfg,function(){saveRandomizerPrefs();}));
  const row=document.createElement('div');row.className='row';row.innerHTML='<label>Случайные фразы</label><label class="toggle"><input id="randomMessagesEnabled" type="checkbox"> включены</label>';
  const cb=row.querySelector('input');cb.checked=!!randomizerCfg.messagesEnabled;cb.onchange=function(){randomizerCfg.messagesEnabled=cb.checked;saveRandomizerPrefs();};sec.appendChild(row);
  const note=document.createElement('div');note.className='face-note';note.textContent='Рандомайзер не повторяет одно состояние подряд. Фразы берутся из пресетов во вкладке «Чат».';sec.appendChild(note);
  d.appendChild(sec);root.insertBefore(d,root.firstChild);
  if(typeof enhanceRangeArrows==='function')enhanceRangeArrows(d);
}
function mountRandomMessagePresets(){
  const root=document.getElementById('tab-chat'); if(!root||document.getElementById('randomMessagePresets'))return;
  const d=document.createElement('details');d.id='randomMessagePresets';d.open=true;d.innerHTML='<summary>Фразы для рандомайзера</summary>';
  const sec=document.createElement('div');sec.className='section';
  const ta=document.createElement('textarea');ta.id='randomMessagesText';ta.placeholder='Одна фраза на строку';ta.value=randomMessagePresets.join('\n');
  ta.addEventListener('input',function(){randomMessagePresets=ta.value.split(/\n+/).map(function(x){return x.trim();}).filter(Boolean).slice(0,40);saveRandomizerPrefs();});
  sec.appendChild(ta);
  const note=document.createElement('div');note.className='face-note';note.textContent='Когда включён 🎲, робот иногда вместо обычной эмоции произносит одну из этих фраз.';sec.appendChild(note);
  d.appendChild(sec);root.insertBefore(d,root.firstChild);
}
loadRandomizerPrefs();
'''
if random_pool_marker not in s: raise SystemExit('random pool marker not found')
if 'const randomizerCfg=' not in s:
    s=s.replace(random_pool_marker, random_pool_marker+'\n'+random_support,1)

# Random timing + speaking preset integration.
s=s.replace("const delay=immediate?120:(350+Math.random()*2650);", "normalizeRandomizerCfg(); const delay=immediate?120:((randomizerCfg.minDelay+Math.random()*(randomizerCfg.maxDelay-randomizerCfg.minDelay))*1000);",1)
insert_before = "    const candidates=randomAnimationPool.filter(k=>stateProfiles[k]&&k!==behavior);"
message_logic = r'''    if(randomizerCfg.messagesEnabled && randomMessagePresets.length && Math.random()<randomizerCfg.messageChance){
      const text=randomMessagePresets[Math.floor(Math.random()*randomMessagePresets.length)];
      startSpeech(text,false,'speaking',randomizerCfg.speechSpeed);
      scheduleRandomAnimation(false);
      return;
    }
'''
if insert_before in s and 'Math.random()<randomizerCfg.messageChance' not in s:
    s=s.replace(insert_before,message_logic+insert_before,1)

# Body class drives chip/emotion visibility in random mode.
class_marker = "  btn?.setAttribute('aria-pressed',randomAnimationsEnabled?'true':'false');"
if class_marker in s and "classList.toggle('random-mode'" not in s:
    s=s.replace(class_marker,class_marker+"\n  document.body.classList.toggle('random-mode',randomAnimationsEnabled);",1)

# Mount settings every time the corresponding tabs are rebuilt.
anim_end = "  sec.querySelector('#returnWaiting').onclick=()=>setState('waiting');\n}"
if anim_end in s and 'mountRandomizerSettings();' not in s[s.find(anim_end)-100:s.find(anim_end)+200]:
    s=s.replace(anim_end,"  sec.querySelector('#returnWaiting').onclick=()=>setState('waiting');\n  mountRandomizerSettings();\n}",1)
chat_marker = "  renderChatLog();\n}\nfunction renderChatLog()"
if chat_marker in s:
    s=s.replace(chat_marker,"  renderChatLog();\n  mountRandomMessagePresets();\n}\nfunction renderChatLog()",1)

# Horizontal rails always start from the first chip on fresh mobile layout.
layout_marker = "if(!document.body.dataset.mobileInit){document.body.dataset.mobileInit='1';document.body.classList.remove('panel-open');}"
layout_replacement = "if(!document.body.dataset.mobileInit){document.body.dataset.mobileInit='1';document.body.classList.remove('panel-open'); const sb=document.getElementById('statebar'); const em=document.getElementById('emotions'); if(sb) sb.scrollLeft=0; if(em) em.scrollLeft=0;}"
if layout_marker in s:
    s=s.replace(layout_marker,layout_replacement,1)

path.write_text(s,encoding='utf-8')
print('post compatibility patch v5 applied')
