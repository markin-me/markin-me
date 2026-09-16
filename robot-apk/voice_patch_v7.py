from pathlib import Path
import sys

path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')

old_mobile = '<div class="mobile-chat glass" id="mobileChatBar">\n    <input id="mobileChatInput" type="text" placeholder="Напиши роботу..." autocomplete="off">'
new_mobile = '<div class="mobile-chat glass" id="mobileChatBar">\n    <button id="mobileMic" class="voice-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>\n    <input id="mobileChatInput" type="text" placeholder="Напиши роботу..." autocomplete="off">'
if old_mobile in s:
    s = s.replace(old_mobile, new_mobile, 1)
elif 'id="mobileMic"' not in s:
    raise SystemExit('mobile chat marker not found')

voice_css = r'''

/* APK v7 native Android voice */
.voice-mic{flex:0 0 40px}
.voice-mic.listening,#panelMic.listening{background:#a82f43!important;border-color:#ff7990!important;animation:voicePulse 1s ease-in-out infinite}
@keyframes voicePulse{0%,100%{box-shadow:0 0 0 0 rgba(255,90,120,.18)}50%{box-shadow:0 0 0 7px rgba(255,90,120,.08)}}
.voice-settings{display:grid;gap:9px}
.voice-settings .voice-line{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:8px;align-items:center}
.voice-settings .voice-line>label{font-size:10px;color:#b8cad9}
.voice-settings select{min-width:0}
.voice-status{font-size:10px;line-height:1.4;color:#9fb2c6;padding:7px 9px;border:1px solid var(--line2);border-radius:10px;background:rgba(255,255,255,.025)}
.voice-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.voice-range{display:grid;grid-template-columns:1fr 44px;gap:7px;align-items:center}
.voice-range output{font-size:10px;text-align:right;color:#9fb2c6}
'''
style_end = s.find('</style>')
if style_end < 0:
    raise SystemExit('style close not found')
if 'APK v7 native Android voice' not in s:
    s = s[:style_end] + voice_css + s[style_end:]

needle = 'renderChatLog(), mountRandomMessagePresets();'
if needle in s and 'mountNativeVoiceSettings();' not in s[s.find(needle)-100:s.find(needle)+200]:
    s = s.replace(needle, 'renderChatLog(), mountRandomMessagePresets(), mountNativeVoiceSettings();', 1)
elif 'mountNativeVoiceSettings();' not in s:
    raise SystemExit('chat mount marker not found')

marker = '  window.RobotCharacter = {'
if marker not in s:
    raise SystemExit('RobotCharacter marker not found')

voice_js = r'''
  /* APK v7 native Android voice runtime */
  var nativeVoicePrefs = {autoSpeak:true,autoSend:false,recognitionLang:"ru-RU",voiceName:"",rate:.95,pitch:1};
  var nativeVoiceList = [], nativeVoiceInputId = "mobileChatInput", nativeVoiceListening = false, nativeVoiceRetry = 0;
  function loadNativeVoicePrefs(){
    try{
      var raw=localStorage.getItem("robotNativeVoiceV1");
      if(raw){ var data=JSON.parse(raw); if(data) Object.assign(nativeVoicePrefs,data); }
    }catch(_){ }
    nativeVoicePrefs.rate=Math.max(.5,Math.min(1.6,Number(nativeVoicePrefs.rate)||.95));
    nativeVoicePrefs.pitch=Math.max(.5,Math.min(1.6,Number(nativeVoicePrefs.pitch)||1));
  }
  function saveNativeVoicePrefs(){ try{localStorage.setItem("robotNativeVoiceV1",JSON.stringify(nativeVoicePrefs));}catch(_){ } }
  function nativeVoiceAvailable(){ return !!(window.AndroidVoice && typeof AndroidVoice.startListening==="function"); }
  function setNativeVoiceStatus(text){ var el=document.getElementById("nativeVoiceStatus"); if(el)el.textContent=text; }
  function setNativeListening(on){
    nativeVoiceListening=!!on;
    document.body.classList.toggle("voice-listening",nativeVoiceListening);
    [document.getElementById("mobileMic"),document.getElementById("panelMic")].forEach(function(b){if(b)b.classList.toggle("listening",nativeVoiceListening);});
  }
  function activeVoiceInput(){ return document.getElementById(nativeVoiceInputId)||document.getElementById("mobileChatInput")||document.getElementById("chatInput"); }
  function startNativeDictation(targetId){
    if(!nativeVoiceAvailable()){ toast("Голосовой ввод доступен в Android APK"); return; }
    nativeVoiceInputId=targetId||"mobileChatInput";
    if(nativeVoiceListening){ try{AndroidVoice.stopListening();}catch(_){ } setNativeListening(false); setState("waiting",false); return; }
    var el=activeVoiceInput(); if(el){ try{el.blur();}catch(_){ } }
    setNativeListening(true); setNativeVoiceStatus("Слушаю… говорите"); setState("listening",false);
    try{ AndroidVoice.startListening(nativeVoicePrefs.recognitionLang||"ru-RU"); }
    catch(e){ setNativeListening(false); setNativeVoiceStatus("Не удалось включить микрофон"); toast("Не удалось включить микрофон"); }
  }
  function submitRecognizedText(text){
    var input=activeVoiceInput(); if(input) input.value=text||"";
    if(!text || !nativeVoicePrefs.autoSend) return;
    sendChatMessage(text);
    if(input) input.value="";
  }
  function requestNativeVoices(){
    if(!nativeVoiceAvailable()) return;
    try{ AndroidVoice.requestVoices(); }catch(_){ }
  }
  function renderNativeVoiceSelect(){
    var sel=document.getElementById("nativeVoiceSelect"); if(!sel)return;
    var keep=nativeVoicePrefs.voiceName||"";
    sel.innerHTML="";
    var def=document.createElement("option"); def.value=""; def.textContent="Системный голос"; sel.appendChild(def);
    var lang=(nativeVoicePrefs.recognitionLang||"ru-RU").toLowerCase().slice(0,2);
    var rows=nativeVoiceList.slice().sort(function(a,b){
      var am=(a.locale||"").toLowerCase().indexOf(lang)===0?0:1, bm=(b.locale||"").toLowerCase().indexOf(lang)===0?0:1;
      if(am!==bm)return am-bm;
      if(!!a.network!==!!b.network)return a.network?1:-1;
      return String(a.name||"").localeCompare(String(b.name||""));
    });
    rows.forEach(function(v){
      var o=document.createElement("option"); o.value=v.name||"";
      o.textContent=(v.locale||"—")+" · "+(v.name||"voice")+(v.network?" · сеть":" · локальный");
      sel.appendChild(o);
    });
    sel.value=keep;
    if(sel.value!==keep){ sel.value=""; nativeVoicePrefs.voiceName=""; saveNativeVoicePrefs(); }
    if(rows.length) setNativeVoiceStatus("Доступно голосов: "+rows.length+". Можно выбрать системный или конкретный голос.");
  }
  function mountNativeVoiceSettings(){
    var root=document.getElementById("tab-chat"); if(!root||document.getElementById("nativeVoiceSettings"))return;
    var d=document.createElement("details"); d.id="nativeVoiceSettings"; d.open=true; d.innerHTML="<summary>Голос и микрофон Android</summary>";
    var sec=document.createElement("div"); sec.className="section voice-settings";
    sec.innerHTML='\
      <div class="voice-line"><label>Озвучивать реплики</label><label class="toggle"><input id="nativeAutoSpeak" type="checkbox"> включено</label></div>\
      <div class="voice-line"><label>Автоотправка после диктовки</label><label class="toggle"><input id="nativeAutoSend" type="checkbox"> включена</label></div>\
      <div class="voice-line"><label>Язык распознавания</label><select id="nativeSpeechLang"><option value="ru-RU">Русский</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="de-DE">Deutsch</option><option value="nl-NL">Nederlands</option></select></div>\
      <div class="voice-line"><label>Голос робота</label><select id="nativeVoiceSelect"><option value="">Системный голос</option></select></div>\
      <div class="voice-line"><label>Скорость</label><div class="voice-range"><input id="nativeVoiceRate" type="range" min="0.5" max="1.6" step="0.05"><output id="nativeVoiceRateOut"></output></div></div>\
      <div class="voice-line"><label>Высота голоса</label><div class="voice-range"><input id="nativeVoicePitch" type="range" min="0.5" max="1.6" step="0.05"><output id="nativeVoicePitchOut"></output></div></div>\
      <div class="voice-actions"><button class="mini-btn" id="panelMic">🎤 Диктовка</button><button class="mini-btn" id="nativeVoiceTest">▶ Проверить голос</button></div>\
      <div class="voice-status" id="nativeVoiceStatus">Проверяю Android SpeechRecognizer и TextToSpeech…</div>';
    d.appendChild(sec); root.insertBefore(d,root.firstChild);
    var autoSpeak=sec.querySelector("#nativeAutoSpeak"), autoSend=sec.querySelector("#nativeAutoSend"), lang=sec.querySelector("#nativeSpeechLang"), voice=sec.querySelector("#nativeVoiceSelect"), rate=sec.querySelector("#nativeVoiceRate"), pitch=sec.querySelector("#nativeVoicePitch"), rateOut=sec.querySelector("#nativeVoiceRateOut"), pitchOut=sec.querySelector("#nativeVoicePitchOut");
    autoSpeak.checked=!!nativeVoicePrefs.autoSpeak; autoSend.checked=!!nativeVoicePrefs.autoSend; lang.value=nativeVoicePrefs.recognitionLang||"ru-RU"; rate.value=nativeVoicePrefs.rate; pitch.value=nativeVoicePrefs.pitch;
    function syncOut(){rateOut.textContent=Number(rate.value).toFixed(2);pitchOut.textContent=Number(pitch.value).toFixed(2);}
    syncOut();
    autoSpeak.onchange=function(){nativeVoicePrefs.autoSpeak=autoSpeak.checked;saveNativeVoicePrefs();};
    autoSend.onchange=function(){nativeVoicePrefs.autoSend=autoSend.checked;saveNativeVoicePrefs();};
    lang.onchange=function(){nativeVoicePrefs.recognitionLang=lang.value;saveNativeVoicePrefs();renderNativeVoiceSelect();};
    voice.onchange=function(){nativeVoicePrefs.voiceName=voice.value;saveNativeVoicePrefs();};
    rate.oninput=function(){nativeVoicePrefs.rate=Number(rate.value);syncOut();saveNativeVoicePrefs();};
    pitch.oninput=function(){nativeVoicePrefs.pitch=Number(pitch.value);syncOut();saveNativeVoicePrefs();};
    sec.querySelector("#panelMic").onclick=function(){startNativeDictation("chatInput");};
    sec.querySelector("#nativeVoiceTest").onclick=function(){
      if(!nativeVoiceAvailable()){toast("Проверка голоса доступна в Android APK");return;}
      try{AndroidVoice.speak("Привет! Это выбранный голос робота.",nativeVoicePrefs.voiceName||"",nativeVoicePrefs.rate,nativeVoicePrefs.pitch);}catch(_){toast("Не удалось запустить голос");}
    };
    renderNativeVoiceSelect();
    if(nativeVoiceAvailable()){ setNativeVoiceStatus(nativeVoiceList.length?"Голосовые функции Android готовы":"Загружаю список голосов…"); requestNativeVoices(); }
    else setNativeVoiceStatus("Нативные голосовые функции доступны только внутри Android APK.");
  }
  loadNativeVoicePrefs();
  window.NativeVoice={
    _onPartial:function(text){ var input=activeVoiceInput(); if(input)input.value=text||""; setNativeVoiceStatus("Слушаю… "+(text||"")); },
    _onResult:function(text){ setNativeListening(false); setNativeVoiceStatus("Распознано: "+(text||"")); submitRecognizedText(text||""); setState("waiting",false); },
    _onError:function(code,message){ setNativeListening(false); setNativeVoiceStatus("Ошибка микрофона: "+(message||code||"unknown")); setState("waiting",false); toast("Микрофон: "+(message||"ошибка")); },
    _onListeningState:function(state){ if(state==="ready"||state==="speech")setNativeListening(true); if(state==="stopped")setNativeListening(false); },
    _onVoices:function(json){ try{nativeVoiceList=JSON.parse(json||"[]")||[];}catch(_){nativeVoiceList=[];} renderNativeVoiceSelect(); if(!nativeVoiceList.length && nativeVoiceRetry++<4)setTimeout(requestNativeVoices,700); },
    _onTtsStart:function(){ setState("speaking",false); },
    _onTtsDone:function(){ if(isSpeaking)stopSpeech(); },
    _onTtsError:function(message){ setNativeVoiceStatus("Ошибка озвучки: "+(message||"TTS")); }
  };
  var __robotStartSpeech=startSpeech;
  startSpeech=function(text,withVoice,state,typeSpeed){
    var canNative=!!(nativeVoicePrefs.autoSpeak && window.AndroidVoice && typeof AndroidVoice.speak==="function");
    __robotStartSpeech(text,canNative?false:withVoice,state,typeSpeed);
    if(canNative && text){
      try{AndroidVoice.speak(String(text),nativeVoicePrefs.voiceName||"",nativeVoicePrefs.rate,nativeVoicePrefs.pitch);}
      catch(_){ }
    }
  };
  (function(){
    var mic=document.getElementById("mobileMic"); if(mic)mic.onclick=function(){startNativeDictation("mobileChatInput");};
    if(nativeVoiceAvailable())setTimeout(requestNativeVoices,350);
  })();
'''

if 'APK v7 native Android voice runtime' not in s:
    s = s.replace(marker, voice_js + '\n' + marker, 1)

path.write_text(s, encoding='utf-8')
print('voice patch applied', path, len(s))
