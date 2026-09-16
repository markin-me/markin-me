from pathlib import Path
import sys

path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')

# v6: keep the face/visor centered in the actually free mobile area instead of using
# hard-coded camera Y offsets. The 3D canvas remains full-screen; UI is only an overlay.
old_stage_aspect = "const stageAspect = Math.max(.18, stage.clientWidth / Math.max(1, stage.clientHeight));"
new_stage_aspect = r'''const vvNow=window.visualViewport;
const sceneViewH=Math.max(1,Math.round(vvNow?vvNow.height:window.innerHeight));
const sceneViewTop=vvNow?vvNow.offsetTop:0;
window.__robotBaseViewportH=Math.max(window.__robotBaseViewportH||0,stage.clientHeight,sceneViewH);
const stageAspect=Math.max(.18,stage.clientWidth/Math.max(1,window.__robotBaseViewportH||stage.clientHeight));
let mobileFreeRatio=1;
let desiredSceneCenterPx=sceneViewH*.5;
if(isNarrow()){
  let freeBottom=sceneViewH;
  if(document.body.classList.contains('keyboard-open')){
    const chat=document.querySelector('.mobile-chat');
    if(chat){
      const r=chat.getBoundingClientRect();
      freeBottom=Math.max(120,Math.min(sceneViewH,r.top-sceneViewTop));
    }
  }else if(document.body.classList.contains('panel-open')){
    const p=document.querySelector('.panel');
    if(p){
      const r=p.getBoundingClientRect();
      freeBottom=Math.max(120,Math.min(sceneViewH,r.top-sceneViewTop));
    }
  }
  mobileFreeRatio=Math.max(.28,Math.min(1,freeBottom/sceneViewH));
  desiredSceneCenterPx=freeBottom*.5;
}'''
if old_stage_aspect not in s:
    raise SystemExit('stage aspect marker not found')
s=s.replace(old_stage_aspect,new_stage_aspect,1)

old_zoom = "const effectiveTargetZoom = targetZoom * responsiveFit;"
new_zoom = r'''const overlayFit=(isNarrow()&&mobileFreeRatio<.78)?Math.min(1.9,.78/Math.max(.35,mobileFreeRatio)):1;
  const effectiveTargetZoom = targetZoom * responsiveFit * overlayFit;'''
if old_zoom not in s:
    raise SystemExit('effective zoom marker not found')
s=s.replace(old_zoom,new_zoom,1)

old_look_candidates = [
    "const desiredLookY=mobilePanelOpen?-1.30:(isNarrow()?-1.42:.03);",
    "const desiredLookY=mobilePanelOpen?-0.10:(isNarrow()?-1.05:.03);",
    "const desiredLookY=mobilePanelOpen?0.28:.03;",
]
new_look = r'''const verticalWorldSpan=2*Math.max(1,cameraDistance)*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));
  const desiredOffsetNorm=(desiredSceneCenterPx-sceneViewH*.5)/Math.max(1,sceneViewH);
  const desiredLookY=isNarrow()?(.03+desiredOffsetNorm*verticalWorldSpan):.03;'''
replaced=False
for old in old_look_candidates:
    if old in s:
        s=s.replace(old,new_look,1)
        replaced=True
        break
if not replaced:
    raise SystemExit('desiredLookY marker not found')

# The camera calculation now runs every animation frame from the live UI geometry, so it follows
# keyboard/editor transitions without stale fixed offsets. Mark build for verification.
marker='</style>'
if marker not in s:
    raise SystemExit('style marker not found')
s=s.replace(marker,"\n/* APK v6 dynamic face centering */\n"+marker,1)

path.write_text(s,encoding='utf-8')
print('v6 dynamic face centering patch applied')
