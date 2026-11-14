// Shared live print connection panel. Settings and Orders use this same implementation.
(function(window){
'use strict';
const productionZoneSelectContexts=new Map();
function renderStoreTimezoneSelector(context) {

      if (!context.select) return;

      const options = Array.from(context.select.options || []);

      const selectedValue = String(context.select.value || "");

      const selectedOption = options.find((option) => String(option.value) === selectedValue) || null;
      const grouped=context.select.id==='settingsProductionZonePrinter';
      const indicator=online=>{const dot=document.createElement('span');dot.className='production-printer-status '+(online==='true'?'is-online':'is-offline');dot.setAttribute('aria-hidden','true');return dot;};

      if (context.value) {

        context.value.textContent = selectedOption ? (grouped?selectedOption.dataset.printerLabel||selectedOption.textContent:selectedOption.textContent) : "—";
        if(grouped&&selectedOption?.dataset.online)context.value.prepend(indicator(selectedOption.dataset.online));
        if(grouped&&context.trigger)context.trigger.title=selectedOption?.textContent||'';

      }

      if (context.trigger) {

        context.trigger.disabled = options.length === 0 || (context.respectDisabled && context.select.disabled);

      }

      if (context.selector) {

        context.selector.classList.toggle("is-disabled", options.length === 0 || (context.respectDisabled && context.select.disabled));

      }

      if (!context.menu) {

        if (!options.length) closeStoreTimezoneDropdown(context);

        return;

      }

      context.menu.innerHTML = "";

      let connectionId=null,agentId=null;
      options.forEach((option) => {
        if(grouped&&option.dataset.connectionId){
          if(connectionId!==option.dataset.connectionId){
            connectionId=option.dataset.connectionId;agentId=null;
            const heading=document.createElement('div');heading.className='production-printer-connection';heading.textContent=option.dataset.connectionName;context.menu.append(heading);
          }
          if(agentId!==option.dataset.agentId){
            agentId=option.dataset.agentId;
            const heading=document.createElement('div');heading.className='production-printer-device';heading.append(indicator(option.dataset.agentOnline),document.createTextNode(option.dataset.agentName));context.menu.append(heading);
          }
        }

        const value = String(option.value || "");

        const item = document.createElement("button");

        item.type = "button";
        item.disabled=option.disabled;

        item.className = `new-order-right-select-option${value === selectedValue ? " is-selected" : ""}`;

        item.setAttribute("role", "option");

        item.setAttribute("aria-selected", value === selectedValue ? "true" : "false");

        item.setAttribute("data-store-timezone-option", value);

        item.textContent = grouped?(option.dataset.printerLabel||option.textContent):(option.textContent||value);
        if(grouped&&option.dataset.online){item.prepend(indicator(option.dataset.online));item.classList.add('production-printer-option');item.title=option.textContent;item.setAttribute('aria-label',option.textContent);}

        context.menu.appendChild(item);

      });

      if (!options.length) {

        closeStoreTimezoneDropdown(context);

      }

    }
function closeStoreTimezoneDropdown(context) {
      if(context.topLayer && context.menu?.matches(':popover-open'))context.menu.hidePopover();

      const timezoneField = context.selector && context.selector.closest

        ? context.selector.closest(".settings-store-timezone-field")

        : null;

      if (timezoneField) {

        timezoneField.classList.remove("is-open");

      }

      if (context.selector) {

        context.selector.classList.remove("is-open", "is-drop-up");

      }

      if (context.trigger) {

        context.trigger.setAttribute("aria-expanded", "false");

      }

    }
function openStoreTimezoneDropdown(context) {

      if (!context.selector || !context.trigger || context.trigger.disabled) return;
      if(context.topLayer){
        context.selector.classList.add('is-open');
        context.menu.showPopover();
        const bounds=context.trigger.getBoundingClientRect();
        const panel=context.selector.closest('#settingsProductionZonePanel, #settingsPrintApiPanel').getBoundingClientRect();
        const left=Math.max(8,panel.left+12),right=Math.min(window.innerWidth-8,panel.right-12);
        const top=Math.max(8,panel.top+8),bottom=Math.min(window.innerHeight-8,panel.bottom-8);
        const below=Math.max(0,bottom-bounds.bottom-8),above=Math.max(0,bounds.top-top-8);
        context.menu.style.width=`${Math.min(Math.max(bounds.width,context.minMenuWidth || 0),right-left)}px`;
        context.menu.style.maxHeight=`${Math.max(1,Math.min(230,Math.max(above,below)))}px`;
        const width=context.menu.offsetWidth,height=context.menu.offsetHeight;
        context.menu.style.left=`${Math.max(left,Math.min(bounds.left,right-width))}px`;
        context.menu.style.top=`${Math.max(top,Math.min(bottom-height,below>=height?bounds.bottom+8:bounds.top-height-8))}px`;
        context.trigger.setAttribute('aria-expanded','true');
        return;
      }

      const timezoneField = context.selector.closest

        ? context.selector.closest(".settings-store-timezone-field")

        : null;

      const menuHeight = context.menu

        ? Math.min(context.menu.scrollHeight || 0, 230)

        : 0;

      const triggerRect = context.trigger.getBoundingClientRect();

      const shouldDropUp = menuHeight > 0

        && triggerRect.bottom + 8 + menuHeight > window.innerHeight - 12

        && triggerRect.top > menuHeight + 20;

      if (timezoneField) {

        timezoneField.classList.add("is-open");

      }

      context.selector.classList.toggle("is-drop-up", shouldDropUp);

      context.selector.classList.add("is-open");

      context.trigger.setAttribute("aria-expanded", "true");

    }
function toggleStoreTimezoneDropdown(forceOpen,context) {

      if (!context.selector || !context.trigger || context.trigger.disabled) return;

      const shouldOpen = typeof forceOpen === "boolean"

        ? forceOpen

        : !context.selector.classList.contains("is-open");

      if (!shouldOpen) {

        closeStoreTimezoneDropdown(context);

        return;

      }

      selectors.beforeOpen?.();

      openStoreTimezoneDropdown(context);

    }
function enhanceProductionZoneSelect(select){
      if(!select || productionZoneSelectContexts.has(select))return;
      const selector=document.createElement('div');selector.className='new-order-right-select-wrap production-zone-system-select';
      select.parentNode.insertBefore(selector,select);selector.append(select);select.classList.add('hidden');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      const trigger=document.createElement('button');trigger.type='button';trigger.className='new-order-right-select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      trigger.setAttribute('aria-label',select.getAttribute('aria-label') || ({settingsProductionZoneStore:'Филиал',settingsProductionZonePrinter:'Принтер',settingsProductionZoneDateScope:'Какие заказы печатать автоматически'})[select.id] || 'Выбрать значение');
      const value=document.createElement('span');const arrow=document.createElement('i');arrow.className='fas fa-chevron-down';trigger.append(value,arrow);
      const menu=document.createElement('div');menu.className='new-order-right-select-menu production-zone-system-menu';menu.setAttribute('role','listbox');menu.setAttribute('popover','manual');selector.append(trigger,menu);
      if(select.hasAttribute('data-time-part'))menu.classList.add('production-zone-time-menu');
      if(select.id==='settingsProductionZonePrinter')menu.classList.add('production-printer-menu');
      const context={select,selector,trigger,menu,value,respectDisabled:true,topLayer:true,minMenuWidth:select.hasAttribute('data-time-part')?64:0};productionZoneSelectContexts.set(select,context);
      trigger.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        const open=!selector.classList.contains('is-open');
        for(const other of productionZoneSelectContexts.values())if(other!==context)closeStoreTimezoneDropdown(other);
        renderStoreTimezoneSelector(context);toggleStoreTimezoneDropdown(open,context);
      });
      menu.addEventListener('click',event=>{
        const option=event.target.closest('[data-store-timezone-option]');if(!option || select.disabled || option.disabled)return;
        event.preventDefault();event.stopPropagation();select.value=option.getAttribute('data-store-timezone-option');select.dispatchEvent(new Event('change',{bubbles:true}));closeStoreTimezoneDropdown(context);trigger.focus();
      });
      selector.addEventListener('keydown',event=>{if(event.key==='Escape'){closeStoreTimezoneDropdown(context);trigger.focus();event.stopPropagation();}});
      select.addEventListener('change',()=>renderStoreTimezoneSelector(context));renderStoreTimezoneSelector(context);
    }
document.addEventListener('click',event=>{for(const context of productionZoneSelectContexts.values())if(!context.selector.contains(event.target))closeStoreTimezoneDropdown(context);});

const selectors={contexts:productionZoneSelectContexts,renderStoreTimezoneSelector,closeStoreTimezoneDropdown,openStoreTimezoneDropdown,toggleStoreTimezoneDropdown,enhanceProductionZoneSelect};
function create(host){
const productionZoneSelectContexts=selectors.contexts;
const {renderStoreTimezoneSelector,closeStoreTimezoneDropdown,openStoreTimezoneDropdown,toggleStoreTimezoneDropdown,enhanceProductionZoneSelect}=selectors;
const printApiCard = document.getElementById("settingsPrintApiCard");

const printApiPanel = document.getElementById("settingsPrintApiPanel");
printApiPanel?.querySelector('.settings-panel-scroll')?.addEventListener('scroll',()=>{for(const context of productionZoneSelectContexts.values())if(printApiPanel.contains(context.selector))closeStoreTimezoneDropdown(context);});

const settingsPrintApiStore = document.getElementById("settingsPrintApiStore");

const settingsPrintApiStoreValue = document.getElementById("settingsPrintApiStoreValue");

const settingsPrintApiToken = document.getElementById("settingsPrintApiToken");

const settingsPrintApiGenerateBtn = document.getElementById("settingsPrintApiGenerateBtn");

const settingsPrintApiCopyToken = document.getElementById("settingsPrintApiCopyToken");

const settingsPrintApiRevealToken = document.getElementById("settingsPrintApiRevealToken");

const settingsPrintApiCheckBtn = document.getElementById("settingsPrintApiCheckBtn");

const settingsPrintApiPrinterStatus = document.getElementById("settingsPrintApiPrinterStatus");

const settingsPrintApiPrinterStatusValue = document.getElementById("settingsPrintApiPrinterStatusValue");

const settingsPrintApiPrinterName = document.getElementById("settingsPrintApiPrinterName");

const settingsPrintApiName = document.getElementById("settingsPrintApiName");

const settingsPrintApiHierarchy = document.getElementById("settingsPrintApiHierarchy");

const settingsPrintApiNotifyNewOrder = document.getElementById("settingsPrintApiNotifyNewOrder");

const settingsPrintApiNotifyNewMessage = document.getElementById("settingsPrintApiNotifyNewMessage");

const settingsPrintApiOrderSoundUploadBtn = document.getElementById("settingsPrintApiOrderSoundUploadBtn");

const settingsPrintApiOrderSoundPlayBtn = document.getElementById("settingsPrintApiOrderSoundPlayBtn");

const settingsPrintApiOrderSoundClearBtn = document.getElementById("settingsPrintApiOrderSoundClearBtn");

const settingsPrintApiOrderSoundFile = document.getElementById("settingsPrintApiOrderSoundFile");

const settingsPrintApiOrderSoundUrl = document.getElementById("settingsPrintApiOrderSoundUrl");

const settingsPrintApiOrderSoundLabel = document.getElementById("settingsPrintApiOrderSoundLabel");

const settingsPrintApiMessageSoundUploadBtn = document.getElementById("settingsPrintApiMessageSoundUploadBtn");

const settingsPrintApiMessageSoundPlayBtn = document.getElementById("settingsPrintApiMessageSoundPlayBtn");

const settingsPrintApiMessageSoundClearBtn = document.getElementById("settingsPrintApiMessageSoundClearBtn");

const settingsPrintApiMessageSoundFile = document.getElementById("settingsPrintApiMessageSoundFile");

const settingsPrintApiMessageSoundUrl = document.getElementById("settingsPrintApiMessageSoundUrl");

const settingsPrintApiMessageSoundLabel = document.getElementById("settingsPrintApiMessageSoundLabel");

const settingsPrintApiEditBtn = document.getElementById("settingsPrintApiEditBtn");

const settingsPrintApiCancelBtn = document.getElementById("settingsPrintApiCancelBtn");

const settingsPrintApiFooterView = document.getElementById("settingsPrintApiFooterView");

const settingsPrintApiFooterEdit = document.getElementById("settingsPrintApiFooterEdit");

const settingsPrintApiSaveSettingsBtn = document.getElementById("settingsPrintApiSaveSettingsBtn");

const printApiTabs = new Map();

let printApiRefreshTimer = null;

let printApiConnectionCheckInFlight = false;

let printApiAutoRefreshDelayMs = 5000;

const PRINT_API_AUTO_REFRESH_MIN_MS = 5000;

const PRINT_API_AUTO_REFRESH_MAX_MS = 30000;

let printApiDraftMode = false;

let printApiListLoaded = false;

let printApiListItems = [];

let printApiDeviceSnapshot = {printers:[],agents:[]};

const printApiExpandedDevices=new Set();

const printApiAudioStates=new Map(),printApiAudioNames=new Map();

let printApiControlState = null;

let printApiActiveStoreId = 0;

let printApiSelectedConnectionId = 0;

let printApiSettingsDirty = false;

let printApiDirtyStoreId = 0;

let printApiOriginal = {

    store_id: 0,

    token: "",

    printer_status: "Нажмите \"Проверить подключение\"",

    printer_name: "Статус не проверен",

    notify_new_order_enabled: 1,

    notify_new_message_enabled: 1,

    sound_new_order_url: "",

    sound_new_message_url: ""

  };

function isPrintApiTabId(tabId) {
    return String(tabId || "").startsWith("print-api");
  }

setPrintApiDraftMode(true);

if (printApiCard) {

      printApiCard.addEventListener("click", () => {

        if (host.rightDefault) host.rightDefault.classList.add("hidden");

        const firstOpenTab = Array.from(printApiTabs.keys())[0] || "";

        if (firstOpenTab) {

          host.setActiveRightTab(firstOpenTab);

          return;

        }

        startCreatePrintApi();

      });

    }

if (settingsPrintApiEditBtn) {

      settingsPrintApiEditBtn.addEventListener("click", () => {

        updatePrintApiOriginalFromCurrentForm();

        clearPrintApiSettingsDirty();

        setPrintApiDraftMode(true);

      });

    }

if (settingsPrintApiCancelBtn) {

      settingsPrintApiCancelBtn.addEventListener("click", async () => {

        if (!printApiDraftMode) return;

        await cancelPrintApiDraft();

      });

    }

if (settingsPrintApiStore) {

      settingsPrintApiStore.addEventListener("change", () => {

        clearPrintApiSettingsDirty();

        const storeId = Number(settingsPrintApiStore.value);
        printApiActiveStoreId = storeId;
        printApiSelectedConnectionId = 0;

        if (storeId) {

          resetPrintApiFormForCreate(storeId);

          printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;

          schedulePrintApiAutoRefresh();

        }

      });

    }

if (settingsPrintApiCheckBtn) {

      settingsPrintApiCheckBtn.addEventListener("click", () => {

        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

        if (storeId && printApiSelectedConnectionId) checkPrintApiConnection(storeId);

      });

    }

if (settingsPrintApiGenerateBtn) {

      settingsPrintApiGenerateBtn.addEventListener("click", () => {

        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

        if (storeId) generatePrintApiToken(storeId);

      });

    }

if (settingsPrintApiSaveSettingsBtn) {

      settingsPrintApiSaveSettingsBtn.addEventListener("click", async () => {

        if (!printApiDraftMode) return;

        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

        if (!storeId) return;

        const initialText = settingsPrintApiSaveSettingsBtn.textContent || "";

        settingsPrintApiSaveSettingsBtn.disabled = true;

        settingsPrintApiSaveSettingsBtn.textContent = "Сохранение...";

        try {

          const info = await savePrintApiNotificationSettings(storeId);

          clearPrintApiSettingsDirty();

          applyPrintApiNotificationSettings(info);

          applyPrintApiDeviceState(info);

          updatePrintApiOriginalFromCurrentForm();

          setPrintApiDraftMode(true);

          await loadPrintApiCards();
          const connectionId=Number(info?.connection_id||info?.id||printApiSelectedConnectionId);
          if(connectionId>0){
            const oldKey=host.activeRightTabId;
            const newKey=getPrintApiTabKey(storeId,connectionId);
            const state=getPrintApiTabState(oldKey)||{};
            const title=String(info?.display_name||settingsPrintApiName?.value||'API');
            const node=host.rightTabs?.querySelector(`[data-right-tab="${oldKey}"]`);
            setPrintApiTabState(newKey,{...state,key:newKey,storeId:Number(storeId),connectionId,title,isDraft:false,
              snapshot:collectPrintApiFormSnapshot(),original:{...printApiOriginal},dirty:false});
            host.ensureTab(newKey,title);
            if(oldKey!==newKey){
              host.setActiveRightTab(newKey);
              node?.remove();
              clearPrintApiTabState(oldKey);
            }
            persistActivePrintApiTabState();
          }

        } catch (err) {

          console.error("Не удалось сохранить настройки print API:", err);

          alert("Не удалось сохранить подключение: "+err.message);

        } finally {

          settingsPrintApiSaveSettingsBtn.disabled = false;

          settingsPrintApiSaveSettingsBtn.textContent = initialText || "Сохранить";

        }

      });

    }

if (settingsPrintApiOrderSoundPlayBtn) {

      settingsPrintApiOrderSoundPlayBtn.addEventListener("click", () => {

        playSoundPreview(settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "", "Order");

      });

    }

if (settingsPrintApiMessageSoundPlayBtn) {

      settingsPrintApiMessageSoundPlayBtn.addEventListener("click", () => {

        playSoundPreview(settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : "", "Message");

      });

    }

if (settingsPrintApiOrderSoundClearBtn) {

      settingsPrintApiOrderSoundClearBtn.addEventListener("click", () => {

        if (settingsPrintApiOrderSoundUrl) settingsPrintApiOrderSoundUrl.value = "";

        markPrintApiSettingsDirty();

        refreshPrintApiSoundUiFromInputs();

      });

    }

if (settingsPrintApiMessageSoundClearBtn) {

      settingsPrintApiMessageSoundClearBtn.addEventListener("click", () => {

        if (settingsPrintApiMessageSoundUrl) settingsPrintApiMessageSoundUrl.value = "";

        markPrintApiSettingsDirty();

        refreshPrintApiSoundUiFromInputs();

      });

    }

if (settingsPrintApiNotifyNewOrder) {

      settingsPrintApiNotifyNewOrder.addEventListener("change", () => {

        markPrintApiSettingsDirty();

      });

    }

if (settingsPrintApiNotifyNewMessage) {

      settingsPrintApiNotifyNewMessage.addEventListener("change", () => {

        markPrintApiSettingsDirty();

      });

    }

if (settingsPrintApiPrinterName) {

      settingsPrintApiPrinterName.addEventListener("change", () => {

        markPrintApiSettingsDirty();

      });

    }

if (settingsPrintApiCopyToken) {

      settingsPrintApiCopyToken.addEventListener("click", async () => {

        try {

          const value = settingsPrintApiToken ? settingsPrintApiToken.value : "";

          if (value) await navigator.clipboard.writeText(value);

        } catch (err) {

          console.error("Не удалось скопировать токен:", err);

        }

      });

    }

function populatePrintApiStores(items) {

      if (!settingsPrintApiStore) return;
      const selectedStoreId = settingsPrintApiStore.value;

      settingsPrintApiStore.innerHTML = "";

      const list = Array.isArray(items) ? items : [];

      list.forEach((store) => {

        const opt = document.createElement("option");

        opt.value = String(store.id);

        opt.textContent = store.name ? `${store.name} (#${store.id})` : `Филиал #${store.id}`;

        settingsPrintApiStore.appendChild(opt);

      });
      settingsPrintApiStore.value = selectedStoreId;
    }

function resetPrintApiFormForCreate(storeId = 0) {
      printApiDeviceSnapshot.removed_devices=[];
      if (settingsPrintApiStore) settingsPrintApiStore.value = storeId ? String(storeId) : "";
      if (settingsPrintApiName) settingsPrintApiName.value = "";
      if (settingsPrintApiToken) settingsPrintApiToken.value = "";
      if (settingsPrintApiToken) settingsPrintApiToken.type = "password";
      if (settingsPrintApiRevealToken) syncPrintApiTokenIcons();
      resetPrintApiDeviceState({
        statusText: "Сначала выберите филиал",
        printerText: "Нет токена подключения"
      });
      applyPrintApiNotificationSettings({
        notify_new_order_enabled: 1,
        notify_new_message_enabled: 1,
        sound_new_order_url: "",
        sound_new_message_url: ""
      });
      if (settingsPrintApiGenerateBtn) syncPrintApiTokenIcons();
      updatePrintApiOriginalFromCurrentForm();
      clearPrintApiSettingsDirty();
    }

function setPrintApiDeviceState(statusText, printerText, printers = [], agents = []) {
      const removals=printApiDeviceSnapshot.removed_devices || [];
      const excludedAgents=new Set(removals.map(item=>Number(item.agent_id||0)));
      const excludedPrinters=new Set(removals.map(item=>Number(item.printer_id||0)));
      agents=(agents||[]).filter(agent=>!excludedAgents.has(Number(agent.id))).map(agent=>({...agent,printers:(agent.printers||[]).filter(printer=>!excludedPrinters.has(Number(printer.id)))}));
      const remainingIds=new Set(agents.flatMap(agent=>(agent.printers||[]).map(printer=>Number(printer.id))));
      printers=(printers||[]).filter(printer=>Number(printer.token_id)===printApiSelectedConnectionId&&remainingIds.has(Number(printer.id)));
      printApiDeviceSnapshot = {printers,agents,removed_devices:removals};

      if (settingsPrintApiPrinterStatus) settingsPrintApiPrinterStatus.value = String(statusText || "");
      if (settingsPrintApiPrinterStatusValue) settingsPrintApiPrinterStatusValue.textContent = String(statusText || "");
      if(settingsPrintApiCheckBtn){
        const connected=statusText==='Соединение установлено';
        settingsPrintApiCheckBtn.classList.toggle('is-connected',connected);
        settingsPrintApiCheckBtn.setAttribute('aria-label',`Соединение: ${statusText || 'не проверено'}. Нажмите, чтобы повторить проверку`);
      }

      if (settingsPrintApiPrinterName) {
        const items = Array.isArray(printers) ? printers : [];
        settingsPrintApiPrinterName.innerHTML = "";
        if (!items.length) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = String(printerText || "Нет подключенных принтеров");
          settingsPrintApiPrinterName.appendChild(opt);
        } else {
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = "Не выбран";
          settingsPrintApiPrinterName.appendChild(emptyOpt);
          items.forEach((printer) => {
            const opt = document.createElement("option");
            const id = Number(printer && printer.id);
            const systemName = String((printer && printer.system_name) || "");
            const displayName = String((printer && printer.display_name) || systemName);
            const status = String((printer && printer.status) || "");
            opt.value = id > 0 ? String(id) : "";
            const flags = [];
            if (status) flags.push(status);
            const connection = printApiListItems.find((item) => Number(item.token_id) === Number(printer.token_id));
            opt.textContent = `${connection?.display_name || `Подключение #${printer.token_id}`} → ${printer.device_name || `Компьютер #${printer.agent_id}`} → ${displayName || systemName}${displayName && systemName && displayName !== systemName ? ` (${systemName})` : ""}${flags.length ? ` - ${flags.join(", ")}` : ""}`;
            if (status === "offline") opt.className = "muted";
            settingsPrintApiPrinterName.appendChild(opt);
          });
        }
      }

      const summary=document.getElementById('settingsPrintApiSummary');
      if(summary){
        const devices=Array.isArray(agents)?agents:[],online=devices.filter(item=>Number(item.is_online)===1).length;
        const printers=devices.flatMap(item=>(item.printers||[]).map(printer=>({online:Number(item.is_online)===1&&printer.status==='online'})));
        const printerOnline=printers.filter(item=>item.online).length;
        const latest=devices.map(item=>item.last_heartbeat_at).filter(Boolean).sort().pop();
        summary.textContent=`Устройства: ${online} онлайн / ${devices.length-online} офлайн. Принтеры: ${printerOnline} онлайн / ${printers.length-printerOnline} офлайн.${latest?' Последняя связь: '+new Date(latest).toLocaleString('ru-RU'):''}`;
      }
      if (settingsPrintApiHierarchy) {
        const signature=JSON.stringify([printApiSelectedConnectionId,agents]);
        if(settingsPrintApiHierarchy.dataset.signature!==signature){
          settingsPrintApiHierarchy.dataset.signature=signature;
          settingsPrintApiHierarchy.replaceChildren();
          const devices=Array.isArray(agents)?agents:[];
          const printerOnline=(agent,printer)=>Number(agent.is_online)===1&&Number(agent.agent_running)===1&&printer.status==='online';
          const counters=(online,total)=>{
            const counts=document.createElement('span');counts.className='print-device-counts';
            const on=document.createElement('span');on.className='is-online';on.textContent=String(online);on.title='Принтеров онлайн';
            const off=document.createElement('span');off.className='is-offline';off.textContent=String(total-online);off.title='Принтеров офлайн';
            counts.append(document.createTextNode('Принтеры: '),on,document.createTextNode(' / '),off);return counts;
          };
          const dot=online=>{
            const indicator=document.createElement('span');indicator.className='print-device-dot '+(online?'is-online':'is-offline');indicator.title=online?'Онлайн':'Не в сети';indicator.setAttribute('role','img');indicator.setAttribute('aria-label',indicator.title);return indicator;
          };
          const iconButton=(icon,title,action)=>{
            const button=queueButton('',action);button.className='btn btn-icon btn-sm';button.title=title;button.setAttribute('aria-label',title);const image=document.createElement('i');image.className='fas '+icon;image.setAttribute('aria-hidden','true');button.append(image);return button;
          };
          const summary=document.createElement('div');summary.className='print-devices-summary';
          const total=devices.flatMap(agent=>agent.printers||[]).length;
          const online=devices.reduce((sum,agent)=>sum+(agent.printers||[]).filter(printer=>printerOnline(agent,printer)).length,0);
          const count=document.createElement('span');count.textContent=`Устройства: ${devices.length}`;summary.append(count,counters(online,total));settingsPrintApiHierarchy.append(summary);
          if(!devices.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Устройства ещё не подключены';settingsPrintApiHierarchy.append(empty);}
          for(const agent of devices){
            const id=Number(agent.id),key=printApiSelectedConnectionId+':'+id;
            const printers=agent.printers||[],online=Number(agent.is_online)===1&&Number(agent.agent_running)===1;
            const section=document.createElement('section');section.className='print-device-group';
            const opened=printApiExpandedDevices.has(key);section.classList.toggle('is-open',opened);
            const header=document.createElement('div');header.className='print-device-header';
            const toggle=document.createElement('button');toggle.type='button';toggle.className='print-device-toggle';toggle.setAttribute('aria-expanded',String(opened));
            const copy=document.createElement('span');copy.className='print-device-copy';
            const name=document.createElement('strong');name.textContent=agent.device_name||`Компьютер #${id}`;
            copy.append(name,counters(printers.filter(printer=>printerOnline(agent,printer)).length,printers.length));toggle.append(dot(online),copy);
            const actions=document.createElement('div');actions.className='print-device-actions';
            const info=document.createElement('details');info.className='settings-print-api-connection-info print-device-info';
            const trigger=document.createElement('summary');trigger.className='btn btn-icon btn-sm';trigger.title='Информация об устройстве';trigger.setAttribute('aria-label',trigger.title);trigger.innerHTML='<i class="fas fa-info-circle" aria-hidden="true"></i>';
            const popover=document.createElement('div');popover.className='settings-delivery-zone-info-popover';
            const title=document.createElement('strong');title.textContent=agent.device_name||`Компьютер #${id}`;popover.append(title);
            for(const text of [`Устройство #${id}`,online?'Онлайн':'Не в сети',`Версия агента: ${agent.agent_version||'—'}`,agent.last_heartbeat_at?'Последняя связь: '+new Date(agent.last_heartbeat_at).toLocaleString('ru-RU'):'Связь не установлена']){const line=document.createElement('div');line.textContent=text;popover.append(line);}
            info.append(trigger,popover);actions.append(info,iconButton('fa-trash','Удалить устройство',()=>removePrintApiDevice({agent_id:id})));
            header.append(toggle,actions);
            const body=document.createElement('div');body.className='print-device-printers';body.classList.toggle('hidden',!opened);
            toggle.addEventListener('click',()=>{const open=body.classList.contains('hidden');body.classList.toggle('hidden',!open);section.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));open?printApiExpandedDevices.add(key):printApiExpandedDevices.delete(key);});
            if(!printers.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Принтеры ещё не подключены';body.append(empty);}
            for(const printer of printers){
              const row=document.createElement('div');row.className='print-device-printer';
              const name=document.createElement('span');name.className='print-device-printer-name';name.textContent=printer.display_name||printer.system_name||'Принтер';
              const buttons=document.createElement('div');buttons.className='print-device-actions';
              const test=iconButton('fa-print','Тестовая печать',()=>testPrintApiPrinter(Number(printer.id)));
              buttons.append(test,iconButton('fa-trash','Удалить принтер',()=>removePrintApiDevice({printer_id:Number(printer.id)})));
              row.append(dot(printerOnline(agent,printer)),name,buttons);body.append(row);
            }
            section.append(header,body);settingsPrintApiHierarchy.append(section);
          }
        }
      }

      if (printApiListLoaded) {
        renderPrintApiCards();
      }

      syncPrintApiSelects();

    }

function renderPrintTemplatePreview(type, print = false, context = null) {
      const ui = context || host.extraPrintTemplates[type];
      clearTimeout(ui.timer);
      ui.print.disabled = true;
      ui.preview.onload = null;
      try {
        const fragments = {
          "assembly.items_html": '<tr><td class="check"><span class="box"></span></td><td><b>{{ item.variant_label }} {{ item.name }}</b><div class="detail">• {{ item.ingredient_quantity }} {{ item.ingredient_unit }} {{ item.ingredient_name }}</div><div class="detail">• {{ item.option_variant }} {{ item.option_title }}</div><div class="detail">• {{ item.client_composition }}</div></td><td class="qty">{{ item.quantity }}</td></tr>',
          "assembly.comment_html": '<div class="note">{{ order.comment }}</div>',
          "delivery.comment_html": '<div class="note">{{ order.address_comment }}<br>{{ order.comment }}</div>',
          "payment.summary_html": '<div class="pay">{{ payment.summary_html }}</div>',
        };
        fragments["delivery.tear_line_html"] = '<div style="margin-top:6mm;border-top:1px dashed #000"></div>';
        if (type === 'assembly_batch') {
          fragments["assembly.items_html"] = '<tr><td colspan="3" style="text-align:center;border-top:2px solid #000;border-bottom:2px solid #000;padding:12px 3px;font-size:14px;font-weight:bold">?? ???????: {{ order.time }}</td></tr>' + fragments["assembly.items_html"] + '<tr><td colspan="3" style="padding:6mm 0 2mm;border:0"><div style="border-top:1px dashed #000"></div></td></tr>';
        }
        const html = type === "job" ? ui.html.value : ui.html.value.replace(/{{\s*([\w.]+)\s*}}/g, (variable, key) => Object.hasOwn(fragments, key) ? fragments[key] : variable);
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (type === 'assembly_batch') {
          const header = doc.querySelector('header');
          if (header && header.textContent.trim() === '????? ???? ??????') header.textContent = '????? ???? ?????? ? {{ order.schedule_date }}';
        }
        const version = String(ui.previewVersion = (ui.previewVersion || 0) + 1);
        doc.documentElement.dataset.printPreviewVersion = version;
        // Strip active content before srcdoc; CSP also blocks external resources.
        doc.querySelectorAll("script,iframe,frame,frameset,object,embed,base,meta,link,form").forEach(el => el.remove());
        doc.querySelectorAll("*").forEach(el => {
          for (const attr of [...el.attributes]) {
            if (/^on/i.test(attr.name) || ["href", "src", "srcset", "action", "formaction", "xlink:href", "target", "srcdoc"].includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
          }
        });
        const policy = doc.createElement("meta");
        policy.httpEquiv = "Content-Security-Policy";
        policy.content = "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
        doc.head.prepend(policy);
        if (type === "job") {
          ui.preview.onload = () => {
            ui.preview.style.height = `${ui.preview.contentDocument.body.scrollHeight + 2}px`;
            if(print){ui.preview.contentWindow.focus();ui.preview.contentWindow.print();}
          };
          ui.error.classList.add("hidden");
          ui.preview.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
          return;
        }
        const layout = doc.createElement("style");
        layout.textContent = `body{width:100%;} .qty{white-space:normal;overflow-wrap:anywhere;width:100px;} .pay span:last-child{white-space:normal;}
          @media print{body{width:80mm;}}`;
        doc.head.appendChild(layout);
        const screen = doc.createElement("style");
        screen.media = "screen";
        screen.textContent = "html,body{font-size:13px;}header{font-size:16px}.detail{font-size:12px}";
        screen.id = "print-template-screen-style";
        doc.head.appendChild(screen);
        ui.preview.onload = () => {
          try {
            const rendered = ui.preview.contentDocument;
            if (rendered.documentElement.dataset.printPreviewVersion !== version) return;
            const height = rendered.body.scrollHeight;
            ui.preview.style.height = `${height + 2}px`;
            const screenStyle = rendered.getElementById("print-template-screen-style");
            screenStyle.media = "not all";
            rendered.body.style.width = "80mm";
            const printHeight = rendered.body.scrollHeight;
            rendered.body.style.width = "";
            screenStyle.media = "screen";
            const page = rendered.createElement("style");
            page.textContent = `@page { size: 80mm ${Math.ceil(printHeight * 25.4 / 96 + 1)}mm; margin: 0; }`;
            rendered.head.appendChild(page);
            ui.print.disabled = false;
            if (print) { ui.preview.contentWindow.focus(); ui.preview.contentWindow.print(); }
          } catch (error) {
            ui.error.textContent = `Ошибка предпросмотра/печати: ${error.message}`;
            ui.error.classList.remove("hidden");
          }
        };
        ui.error.classList.add("hidden");
        ui.preview.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
      } catch (error) {
        ui.error.textContent = error.message;
        ui.error.classList.remove("hidden");
        ui.preview.srcdoc = "";
      }
    }

function renderPrintApiCards() {
      if (!host.apiPanelCards) return;
      host.apiPanelCards.replaceChildren();
      host.apiPanelCards.setAttribute('role','table');
      host.apiPanelCards.setAttribute('aria-label','Подключения API печати');
      if(host.settingsApiCardsHeader){host.settingsApiCardsHeader.classList.remove('hidden');host.apiPanelCards.append(host.settingsApiCardsHeader);}
      const connections=(Array.isArray(printApiListItems)?printApiListItems:[]).filter(item=>Number(item.token_id)>0);
      if(!connections.length){
        const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Пока нет подключений API';host.apiPanelCards.append(empty);return;
      }
      for(const item of connections){
        const storeId=Number(item.store_id),connectionId=Number(item.token_id||0);
        const row=document.createElement('div');row.className='order-row product-row settings-api-table-row';row.setAttribute('role','row');row.tabIndex=0;
        row.classList.toggle('is-active',connectionId>0&&printApiSelectedConnectionId===connectionId);
        const open=()=>openPrintApiForStore(storeId,String(item.store_name||''),connectionId);
        row.addEventListener('click',open);
        row.addEventListener('keydown',event=>{if(event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open();}});
        const cell=(className='')=>{const element=document.createElement('div');element.className=className;element.setAttribute('role','cell');row.append(element);return element;};
        const connected=connectionId>0&&Number(item.agent_online)===1;
        const state=cell('settings-api-table-indicator');
        const dot=document.createElement('span');dot.className='settings-api-status-dot '+(connected?'is-online':'is-offline');
        dot.title=connected?'Агент на связи':'Связи с агентом нет';dot.setAttribute('role','img');dot.setAttribute('aria-label',dot.title);state.append(dot);
        const name=cell('product-title');name.textContent=String(item.display_name||(connectionId>0?`Подключение #${connectionId}`:'Нет подключения'));name.title=name.textContent;
        const store=cell('muted');store.textContent=String(item.store_name||'');store.title=store.textContent;
        if(!connectionId){
          for(let index=0;index<3;index++)cell('settings-api-table-number').textContent='—';
          const action=cell('settings-api-table-number');const add=document.createElement('button');add.type='button';add.className='btn btn-icon btn-sm';add.title='Добавить подключение';add.setAttribute('aria-label',add.title);const icon=document.createElement('i');icon.className='fas fa-plus';add.append(icon);add.addEventListener('click',event=>{event.stopPropagation();open();});action.append(add);host.apiPanelCards.append(row);continue;
        }
        const printers=cell('settings-api-table-number settings-api-printer-counts');
        const online=Number(item.printer_online_count||0),offline=Math.max(0,Number(item.printer_count||0)-online);
        for(const [count,state,label] of [[online,'online','онлайн'],[offline,'offline','офлайн']]){
          const value=document.createElement('span');value.className='is-'+state;value.textContent=String(count);value.title=`Принтеров ${label}: ${count}`;value.setAttribute('aria-label',value.title);printers.append(value);
        }
        for(const [view,field,title] of [['queue','queue_count','Открыть очередь печати'],['errors','failed_count','Открыть ошибки печати']]){
          const count=Number(item[field]||0),host=cell('settings-api-table-number');
          const button=document.createElement('button');button.type='button';button.className='btn btn-link btn-sm settings-api-table-count';button.textContent=String(count);button.title=title;button.setAttribute('aria-label',`${title}: ${count}`);
          button.classList.toggle('has-errors',view==='errors'&&count>0);
          button.addEventListener('click',async event=>{event.stopPropagation();await open();if(printApiSelectedConnectionId===connectionId)showPrintQueueView(view);});host.append(button);
        }
        const paused=Number(item.printing_paused)===1,action=cell('settings-api-table-number');
        const pause=document.createElement('button');pause.type='button';pause.className='btn btn-icon btn-sm';pause.title=paused?'Продолжить печать':'Остановить печать';pause.setAttribute('aria-label',pause.title);pause.setAttribute('aria-pressed',String(paused));
        const icon=document.createElement('i');icon.className='fas '+(paused?'fa-play':'fa-pause');pause.append(icon);
        pause.addEventListener('click',event=>{event.stopPropagation();setPrintApiPause(storeId,connectionId,!paused,pause);});action.append(pause);
        host.apiPanelCards.append(row);
      }
    }

[settingsPrintApiName].filter(Boolean).forEach((control) => {
      control.addEventListener("input", markPrintApiSettingsDirty);
      control.addEventListener("change", markPrintApiSettingsDirty);
    });

function getPrintApiTabKey(storeId, connectionId = 0) {
      return connectionId > 0 ? `print-api-connection-${Number(connectionId)}` : `print-api-store-${Number(storeId || 0)}`;
    }

function getPrintApiNewTabKey() {
      return "print-api-new";
    }

function getPrintApiTabState(key) {
      return printApiTabs.get(String(key || "")) || null;
    }

function setPrintApiTabState(key, state) {
      if (!key) return;
      printApiTabs.set(String(key), { ...(state || {}) });
    }

function clearPrintApiTabState(key) {
      if (!key) return;
      printApiTabs.delete(String(key));
    }

function syncPrintApiTabsHeader() {
      if (!host.rightTabs) return;
      host.rightTabs.querySelectorAll(".product-tab").forEach((tab) => {
        const tabId = tab.getAttribute("data-right-tab") || "";
        tab.classList.toggle("is-active", tabId === host.activeRightTabId);
      });
    }

function removePrintApiDevice(selection) {
      const current=printApiDeviceSnapshot;
      let removals=[...(current.removed_devices||[])];
      if(selection.agent_id){
        const agent=current.agents.find(item=>Number(item.id)===Number(selection.agent_id));
        const ids=new Set((agent?.printers||[]).map(item=>Number(item.id)));
        removals=removals.filter(item=>!ids.has(Number(item.printer_id)));
      }
      removals.push(selection);
      const selected=String(settingsPrintApiPrinterName?.value||'');
      printApiDeviceSnapshot.removed_devices=removals;
      setPrintApiDeviceState(settingsPrintApiPrinterStatus?.value,'',current.printers,current.agents);
      if(settingsPrintApiPrinterName)settingsPrintApiPrinterName.value=selected;
      syncPrintApiSelects();
      markPrintApiSettingsDirty();
    }

document.getElementById('settingsPrintApiDeleteBtn')?.addEventListener('click',async event=>{
      const scope=printQueueScope(),key=host.activeRightTabId;
      if(!scope.connection_id)return;
      const connection=printApiListItems.find(item=>Number(item.token_id)===scope.connection_id);
      if(connection)scope.store_id=Number(connection.store_id);
      if(!confirm('Удалить подключение, его устройства, всю очередь и историю печати? Ключ перестанет работать.'))return;
      const queueCache=printQueueCacheScope();
      const button=event.currentTarget;button.disabled=true;
      try{
        const remove=detach=>authFetch('/api/admin/tenant/print-api/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,detach_zone_printers:detach})});
        let response=await remove(false),result=await response.json();
        if(response.status===409&&result.error==='PRINT_CONNECTION_ZONE_CONFIRM_REQUIRED'){
          if(!confirm(result.message))return;
          response=await remove(true);result=await response.json();
        }
        if(!response.ok||!result.ok)throw new Error(result.message||result.error);
        try{await queueCache?.clear();}catch(error){console.error('Не удалось очистить кэш удалённого подключения:',error);}
        host.rightTabs?.querySelector(`[data-right-tab="${key}"] .product-tab-close`)?.click();
        clearPrintApiTabState(key);
        if(host.activeRightTabId===key){host.rightTabs?.querySelector(`[data-right-tab="${key}"]`)?.remove();host.setActiveRightTab('');}
        await loadPrintApiCards();
      }catch(error){alert('Не удалось удалить подключение: '+error.message);}finally{button.disabled=false;}
    });

function syncPrintApiTokenIcons() {
      const revealed=settingsPrintApiToken?.type==='text';
      if(settingsPrintApiRevealToken){settingsPrintApiRevealToken.innerHTML=`<i class="fas ${revealed?'fa-eye':'fa-eye-slash'}" aria-hidden="true"></i>`;settingsPrintApiRevealToken.title=revealed?'Скрыть токен':'Показать токен';settingsPrintApiRevealToken.setAttribute('aria-label',settingsPrintApiRevealToken.title);}
      if(settingsPrintApiGenerateBtn){settingsPrintApiGenerateBtn.innerHTML='<i class="fas fa-sync-alt" aria-hidden="true"></i>';settingsPrintApiGenerateBtn.title='Обновить токен';settingsPrintApiGenerateBtn.setAttribute('aria-label','Обновить токен');}
    }

function applyPrintApiControlState(info) {
      printApiControlState=info&&info.printing_paused!=null?{
        printing_paused:Number(info.printing_paused),print_control_version:Number(info.print_control_version||0),print_control_confirmed:Number(info.print_control_confirmed||0)
      }:null;
      const button=document.getElementById('settingsPrintApiPauseBtn'),status=document.getElementById('settingsPrintApiPauseStatus');
      if(!button)return;
      button.disabled=!printApiControlState||!printApiSelectedConnectionId;
      const paused=printApiControlState?.printing_paused===1;
      button.replaceChildren();const icon=document.createElement('i');icon.className='fas '+(paused?'fa-play':'fa-pause');button.append(icon);button.title=paused?'Продолжить печать':'Остановить печать';button.setAttribute('aria-label',button.title);
      if(status)status.textContent=!printApiControlState?'':paused?(printApiControlState.print_control_confirmed?'Пауза подтверждена агентами на связи':'Выдача остановлена. Ожидается подтверждение агентов'):'';
    }

async function setPrintApiPause(storeId,connectionId,paused,button) {
      if(button?.getAttribute('aria-busy')==='true')return;
      button?.setAttribute('aria-busy','true');
      try{
        const response=await authFetch('/api/admin/tenant/print-api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_id:storeId,connection_id:connectionId,paused})});
        const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'PRINT_CONTROL_FAILED');
        if(Number(settingsPrintApiStore?.value)===Number(storeId)&&printApiSelectedConnectionId===Number(connectionId))applyPrintApiControlState(result.data);
        await loadPrintApiCards();
      }catch(error){alert('Не удалось изменить паузу печати: '+error.message);}finally{button?.removeAttribute('aria-busy');}
    }

document.getElementById('settingsPrintApiPauseBtn')?.addEventListener('click',event=>{
      if(printApiControlState)setPrintApiPause(Number(settingsPrintApiStore?.value),printApiSelectedConnectionId,printApiControlState.printing_paused!==1,event.currentTarget);
    });

function collectPrintApiFormSnapshot() {
      return {
        store_id: Number(settingsPrintApiStore && settingsPrintApiStore.value) || 0,
        connection_id: printApiSelectedConnectionId,
        ...printApiControlState,
        removed_devices: printApiDeviceSnapshot.removed_devices || [],
        printers: printApiDeviceSnapshot.printers,
        agents: printApiDeviceSnapshot.agents,
        name: String(settingsPrintApiName && settingsPrintApiName.value || ""),
        token: String((settingsPrintApiToken && settingsPrintApiToken.value) || ""),
        printer_status: String((settingsPrintApiPrinterStatus && settingsPrintApiPrinterStatus.value) || ""),
        printer_name: String((settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || ""),
        default_printer_id: Number(settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || 0,
        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,
        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,
        sound_new_order_url: String((settingsPrintApiOrderSoundUrl && settingsPrintApiOrderSoundUrl.value) || ""),
        sound_new_message_url: String((settingsPrintApiMessageSoundUrl && settingsPrintApiMessageSoundUrl.value) || "")
      };
    }

function applyPrintApiSnapshot(snapshot) {
      const safe = snapshot || {};
      if (settingsPrintApiStore) settingsPrintApiStore.value = safe.store_id ? String(safe.store_id) : "";
      printApiSelectedConnectionId = Number(safe.connection_id || 0);
      if (settingsPrintApiName) settingsPrintApiName.value = String(safe.name || "");
      if (settingsPrintApiToken) settingsPrintApiToken.value = String(safe.token || "");
      if (settingsPrintApiToken) settingsPrintApiToken.type = "password";
      if (settingsPrintApiRevealToken) syncPrintApiTokenIcons();
      printApiDeviceSnapshot.removed_devices=safe.removed_devices || [];
      setPrintApiDeviceState(safe.printer_status, safe.printer_name, safe.printers, safe.agents);
      if(settingsPrintApiPrinterName)settingsPrintApiPrinterName.value=String(safe.default_printer_id||safe.printer_name||"");
      applyPrintApiNotificationSettings(safe);
      applyPrintApiControlState(safe);
      if (settingsPrintApiGenerateBtn) {
        syncPrintApiTokenIcons();
      }
      clearPrintApiSettingsDirty();
      syncPrintApiSelects();

    }

function persistActivePrintApiTabState() {
      if (!isPrintApiTabId(host.activeRightTabId)) return;
      const active = getPrintApiTabState(host.activeRightTabId);
      if (!active) return;
      active.snapshot = collectPrintApiFormSnapshot();
      active.store_id = Number(active.snapshot.store_id || active.store_id || 0);
      active.connectionId = Number(active.snapshot.connection_id || 0);
      active.isDraft = !active.connectionId;
      active.original = {...printApiOriginal};
      active.dirty = printApiSettingsDirty;
      active.queueState = {view:printQueueView,filters:{...printQueueFilters},before:printQueueBefore,selected:[...printQueueSelected]};
      setPrintApiTabState(host.activeRightTabId, active);
    }

function renderActivePrintApiTab() {
      const active = getPrintApiTabState(host.activeRightTabId);
      showPrintQueueView('settings');
      populatePrintApiStores(host.storesState.items);
      if (!active || (!active.snapshot && !active.connectionId)) {
        resetPrintApiFormForCreate();
        setPrintApiDraftMode(true);
        return;
      }
      applyPrintApiSnapshot(active.snapshot || {store_id:active.storeId,connection_id:active.connectionId});
      if(active.original)printApiOriginal={...active.original};
      printApiSettingsDirty=Boolean(active.dirty);
      setPrintApiDraftMode(true);
      const queue=active.queueState;
      printQueueFilters=queue?{...queue.filters}:{agent_id:[],printer_id:[],template_name:[]};
      if(queue && queue.view!=='settings'){
        printQueueView=queue.view;printQueueBefore=queue.before;
        printQueueSelected.clear();queue.selected.forEach(id=>printQueueSelected.add(id));
        applyPrintApiSection(queue.view);
        if(!['devices','notifications'].includes(queue.view))loadPrintQueue();
      }
    }

let printRealtimeSocket=null,printRealtimeReconnect=null,printRealtimeTimer=null,printRealtimeRefreshing=false;

let printRealtimeConnected=false;

const printRealtimeChanges=new Map();

function schedulePrintRealtimeRefresh(change){
      const key=JSON.stringify([change.kind,change.store_id||0,change.connection_id||0]);printRealtimeChanges.set(key,change);
      if(printRealtimeTimer||printRealtimeRefreshing)return;
      printRealtimeTimer=setTimeout(async()=>{
        printRealtimeTimer=null;printRealtimeRefreshing=true;
        const changes=[...printRealtimeChanges.values()];printRealtimeChanges.clear();
        try{
          const storeId=Number(settingsPrintApiStore?.value),connectionId=printApiSelectedConnectionId;
          const relevant=changes.filter(item=>(!item.store_id||Number(item.store_id)===storeId)&&(!item.connection_id||Number(item.connection_id)===connectionId));
          const queueChanged=relevant.some(item=>item.kind==='queue'||item.kind==='resync');
          for(const item of changes.filter(item=>item.kind==='queue')){
            for(const connection of printApiListItems.filter(connection=>(!item.store_id||Number(connection.store_id)===Number(item.store_id))&&(!item.connection_id||Number(connection.token_id)===Number(item.connection_id)))){
              await window.AdminPersistentCache?.scope({domain:'print:queue:'+Number(connection.token_id),version:1,storeId:Number(connection.store_id)})?.clear();
            }
          }
          await loadPrintApiCards();
          if(host.productionZonePanel&&!host.productionZonePanel.classList.contains('hidden')&&changes.some(item=>['devices','presence','resync'].includes(item.kind)&&(!item.store_id||Number(item.store_id)===Number(host.productionZoneStoreSelect?.value))))await host.loadProductionZones({printersOnly:true});
          if(isPrintApiTabId(host.activeRightTabId)&&storeId===Number(settingsPrintApiStore?.value)&&connectionId===printApiSelectedConnectionId){
            if(queueChanged&&!printQueueBusy&&printQueueBody?.querySelector('.print-queue-toolbar')&&!['settings','devices','notifications'].includes(printQueueView))await loadPrintQueue({background:true});
            if(relevant.some(item=>item.kind!=='queue'))await checkPrintApiConnection(storeId,{silent:true});
          }
        }catch(error){console.error('Не удалось применить событие печати:',error);}
        finally{
          printRealtimeRefreshing=false;
          if(printRealtimeChanges.size){const next=[...printRealtimeChanges.values()][0];schedulePrintRealtimeRefresh(next);}
        }
      },150);
    }

function startPrintRealtime(){
      if (printRealtimeSocket) return;
      if (!window.AdminPersistentCache?.realtime) throw new Error('ADMIN_REALTIME_UNAVAILABLE');
      printRealtimeSocket = window.AdminPersistentCache.realtime.subscribe('print', () => ({}), message => {
        if (message.type === 'print.ready') {
          printRealtimeConnected = true;
          schedulePrintRealtimeRefresh({ kind: 'resync' });
        }
        if (message.type === 'print.changed') schedulePrintRealtimeRefresh(message);
        if (message.type === 'connection.closed') printRealtimeConnected = false;
      });
    }

async function loadPrintApiCards() {
      try {
        const res = await authFetch("/api/admin/tenant/print-api/list?_ts=" + Date.now());
        const data = await res.json();
        if (!data || !data.ok || !data.data) throw new Error("LOAD_FAILED");
        printApiListLoaded = true;
        void startPrintRealtime();
        printApiListItems = Array.isArray(data.data.items) ? data.data.items : [];
        renderPrintApiCards();
        host.onConnectionsChanged?.(printApiListItems);
        return data.data;
      } catch (err) {
        console.error("Не удалось загрузить список print API:", err);
        printApiListLoaded = false;
        printApiListItems = [];
        renderPrintApiCards();
        return null;
      }
    }

let printQueueView = 'settings';

let printQueuePdfUrl = null;

function releasePrintQueuePdf() {
      if(printQueuePdfUrl)URL.revokeObjectURL(printQueuePdfUrl);
      printQueuePdfUrl=null;
    }

let printQueueVersion = 0;

let printQueueBefore = null;

let printQueueFilters = { agent_id: [], printer_id: [], template_name: [] };

const printQueueSelected = new Set();

let printQueueVisibleJobs = [];

let printQueueBusy = false;

let printQueuePendingAction = null;

const printQueueChecks = [];

const printQueueBody = document.getElementById('settingsPrintApiQueueBody');

const printQueueSettings = document.getElementById('settingsPrintApiSettingsBody');

const printQueueNav = document.getElementById('settingsPrintApiQueueNav');

const queueLabels = {settings:'Настройки',all:'Очередь печати',devices:'Устройства',notifications:'Уведомления'};

printQueueNav?.querySelectorAll('[data-print-view]').forEach(button=>{
      button.textContent=queueLabels[button.dataset.printView];
      button.addEventListener('click',()=>showPrintQueueView(button.dataset.printView));
    });

function printQueueScope() {
      return {store_id:Number(settingsPrintApiStore?.value||0),connection_id:Number(printApiSelectedConnectionId||0)};
    }

function printQueueScopeKey() { return JSON.stringify(printQueueScope()); }

function queueButton(text, action) {
      const button=document.createElement('button'); button.type='button';button.className='btn btn-link btn-sm';button.textContent=text;button.addEventListener('click',action);return button;
    }

async function printQueueRequest(path,options={}) {
      const scope=printQueueScope();
      if(!scope.store_id||!scope.connection_id)throw new Error('Сначала сохраните подключение API');
      const response=await authFetch('/api/admin/tenant/print-api/jobs'+path,options);
      const result=await response.json();
      if(!response.ok||!result.ok){
        const messages={PRINT_SELECTION_TOO_LARGE:'За один запрос можно обработать не больше 200 заданий',BAD_PRINT_SELECTION:'Некорректный список заданий',BAD_PRINT_SCOPE:'Не выбрано подключение API',PRINT_JOB_PROCESSING:'Задание уже обрабатывается агентом. Его нельзя удалить до завершения обработки',PRINT_JOB_NOT_REPEATABLE:'Повтор доступен для выполненных заданий и заданий с ошибкой',PRINT_CONNECTION_INACTIVE:'Подключение отключено: повторная печать недоступна',PRINT_JOB_NOT_FOUND:'Часть заданий уже недоступна в этом подключении'};
        throw new Error(messages[result.error]||result.error||'Ошибка очереди');
      }
      return result.data;
    }

function applyPrintApiSection(view) {
      const queue=!['settings','devices','notifications'].includes(view);
      printQueueSettings?.classList.toggle('hidden',view!=='settings');
      printQueueBody?.classList.toggle('hidden',!queue);
      document.getElementById('settingsPrintApiDevicesBody')?.classList.toggle('hidden',view!=='devices');
      document.getElementById('settingsPrintApiNotificationsBody')?.classList.toggle('hidden',view!=='notifications');
      printApiPanel?.classList.toggle('is-print-queue',queue);
      printApiPanel?.querySelector('.settings-print-api-control-bar')?.classList.toggle('hidden',!queue);
      const connectionInfo=printApiPanel?.querySelector('.settings-print-api-connection-info');
      if(connectionInfo)connectionInfo.open=false;
      const filterMenu=printQueueBody?.querySelector('.print-queue-filters');
      if(filterMenu)filterMenu.open=false;
      for(const slot of ['Order','Message']){if(view==='notifications')syncPrintApiAudioSlot(slot,{revalidate:true});else printApiAudioStates.get(slot)?.audio?.pause();}
      printApiPanel?.classList.toggle('is-print-devices',view==='devices');
      printQueueNav?.querySelectorAll('[data-print-view]').forEach(button=>{
        const active=button.dataset.printView===view||(button.dataset.printView==='all'&&queue);
        button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));
      });
    }

function showPrintQueueView(view) {
      releasePrintQueuePdf();printQueueView=view;printQueueVersion++;printQueueBefore=null;printQueueSelected.clear();
      applyPrintApiSection(view);
      if(!['settings','devices','notifications'].includes(view))loadPrintQueue();
    }

function printQueueCheckbox(jobs) {
      const label=document.createElement('label');label.className='product-row-select-control';
      const input=document.createElement('input');input.type='checkbox';input.className='product-row-select-input';input.setAttribute('aria-label','Выбрать задания');
      const box=document.createElement('span');box.className='product-row-select-box';box.setAttribute('aria-hidden','true');label.append(input,box);
      const ids=jobs.map(job=>Number(job.id));
      input.addEventListener('change',()=>{
        if(label.closest('.print-queue-select-toggle')&&printQueueSelected.size){
          printQueueSelected.clear();
        }else{
          for(const id of ids){if(input.checked)printQueueSelected.add(id);else printQueueSelected.delete(id);}
        }
        syncPrintQueueSelection();
      });
      printQueueChecks.push({input,ids});return label;
    }

function syncPrintQueueSelection() {
      for(const {input,ids} of printQueueChecks){const count=ids.filter(id=>printQueueSelected.has(id)).length;input.checked=ids.length>0&&count===ids.length;input.indeterminate=count>0&&count<ids.length;input.disabled=printQueueBusy||!ids.length;}
      printQueueBody?.querySelectorAll('[data-print-job-ids]').forEach(row=>row.classList.toggle('is-multi-selected',JSON.parse(row.dataset.printJobIds).some(id=>printQueueSelected.has(id))));
      printQueueBody?.querySelectorAll('[data-print-mutation]').forEach(button=>{
        const ids=JSON.parse(button.closest('[data-print-job-ids]').dataset.printJobIds);
        const jobs=printQueueVisibleJobs.filter(job=>ids.includes(Number(job.id)));
        button.disabled=!printQueueServerConfirmed||printQueueBusy||!jobs.some(job=>button.dataset.printMutation==='repeat'?['pending','done','failed'].includes(job.status):true);
      });
      const toolbar=printQueueBody?.querySelector('.print-queue-toolbar');if(!toolbar)return;
      const selected=printQueueVisibleJobs.filter(job=>printQueueSelected.has(Number(job.id)));
      toolbar.classList.toggle('has-selection',selected.length>0);
      toolbar.querySelector('.print-queue-selection-count').textContent=`Выбрано: ${selected.length}`;
      toolbar.querySelector('[data-selection-action="repeat"]').disabled=!printQueueServerConfirmed||printQueueBusy||!selected.length||selected.some(job=>!['pending','done','failed'].includes(job.status));
      toolbar.querySelector('[data-selection-action="delete"]').disabled=!printQueueServerConfirmed||printQueueBusy||!selected.length;
      toolbar.querySelector('[data-selection-action="clear"]').disabled=!printQueueServerConfirmed||printQueueBusy;
    }

function printQueueRow(jobs, options = {}) {
      const job=jobs[jobs.length-1];
      const row=document.createElement('div');row.className='order-row print-queue-row';row.dataset.printJobIds=JSON.stringify(jobs.map(item=>Number(item.id)));
      row.append(printQueueCheckbox(jobs));
      const content=document.createElement('div');content.className='order-col';
      const title=document.createElement(options.expand?'button':'div');title.className='product-title';title.textContent=options.title||job.job_name||'—';
      const target=document.createElement('div');target.className='muted';target.textContent=`${job.agent_name||'Без компьютера'} → ${job.printer_name||'Без принтера'} · Заданий: ${jobs.length}`;
      if(options.expand){title.type='button';title.classList.add('print-queue-expand');title.setAttribute('aria-expanded',String(options.open));title.addEventListener('click',options.expand);}
      if(options.subtitle)target.textContent=options.subtitle;
      content.append(title,target);
      const counts=new Map();for(const item of jobs)counts.set(item.status,(counts.get(item.status)||0)+1);
      const status=document.createElement('span');status.className='badge';status.textContent=[...counts].map(([state,count])=>`${({pending:'Ожидает',processing:'Выполняется',failed:'Ошибка',done:'Выполнено'})[state]||state}: ${count}`).join(' · ');
      if(counts.has('done'))status.title='Выполнено: агент передал документ в очередь Windows';
      const repeat=jobs.filter(item=>['pending','done','failed'].includes(item.status)).map(item=>item.id);
      const remove=jobs.map(item=>item.id);
      const actions=document.createElement('div');actions.className='print-queue-row-actions';
      for(const [icon,label,action,disabled] of [
        ['fa-eye','Просмотр заданий',()=>previewPrintQueueJobs(jobs),false],
        ['fa-redo',`Повторить задания (${repeat.length})`,()=>mutatePrintQueue('repeat',repeat),!repeat.length],
        ['fa-trash',`Удалить задания (${remove.length})`,()=>mutatePrintQueue('delete',remove),!remove.length]]){
        const button=queueButton('',action);button.className='btn btn-icon btn-sm';button.title=label;button.setAttribute('aria-label',label);if(icon!=='fa-eye')button.dataset.printMutation=icon==='fa-redo'?'repeat':'delete';button.disabled=disabled||(icon!=='fa-eye'&&!printQueueServerConfirmed);const image=document.createElement('i');image.className='fas '+icon;button.append(image);actions.append(button);
      }
      row.append(content,status,actions);return row;
    }

const printQueueExpanded=new Set();

function printQueueAccordion(jobs,key,title,subtitle,level,build){
      const section=document.createElement('section');section.className='print-queue-accordion';section.dataset.level=String(level);
      const content=document.createElement('div');content.className='print-queue-accordion-content';
      const open=printQueueExpanded.has(key);content.classList.toggle('hidden',!open);section.classList.toggle('is-open',open);
      let built=false;
      const expand=()=>{
        const opened=content.classList.contains('hidden');content.classList.toggle('hidden',!opened);section.classList.toggle('is-open',opened);
        header.querySelector('.print-queue-expand').setAttribute('aria-expanded',String(opened));
        if(opened){printQueueExpanded.add(key);if(!built){built=true;build(content);syncPrintQueueSelection();}}else printQueueExpanded.delete(key);
      };
      const header=printQueueRow(jobs,{title,subtitle,expand,open});section.append(header,content);
      if(open){built=true;build(content);}
      return section;
    }

async function loadPrintQueueJobContent(job,container,title){
      container.textContent='Загрузка документа…';
      const scope=printQueueScopeKey();
      try{
        const item=await printQueueRequest('/'+job.id+'?'+new URLSearchParams(printQueueScope()));
        if(scope!==printQueueScopeKey()||!container.isConnected)return;
        container.replaceChildren();
        const heading=document.createElement('p');heading.textContent=job.order_id>0?'Заказ '+(job.public_id||'#'+job.order_id):'Без заказа';container.append(heading);
        if(item.last_error){const error=document.createElement('p');error.textContent=item.last_error;container.append(error);}
        if(item.document.html){
          const doc=new DOMParser().parseFromString(item.document.html,'text/html');
          const name=doc.querySelector('.item-name,.product-name,.label-name,[data-item-name]');
          if(name?.textContent.trim())title.textContent=name.textContent.trim();
          const frame=document.createElement('iframe');frame.title=item.job_name;frame.setAttribute('sandbox','allow-same-origin');frame.className='print-queue-document-frame';
          const error=document.createElement('p'),print=document.createElement('button');container.append(error,frame);
          renderPrintTemplatePreview('job',false,{html:{value:item.document.html},preview:frame,error,print});
        }else if(item.document.pdf_base64){
          const button=queueButton('Просмотреть документ',()=>previewPrintQueueJobs([job]));container.append(button);
        }
      }catch(error){if(container.isConnected)container.textContent='Не удалось загрузить документ: '+error.message;}
    }

async function previewPrintQueueJobs(jobs){
      const scope=printQueueScope(),key=printQueueScopeKey();
      // Reuse the saved-document preview; fetch in bounded batches.
      const documents=[];
      try{
        for(let index=0;index<jobs.length;index+=4){
          documents.push(...await Promise.all(jobs.slice(index,index+4).map(job=>printQueueRequest('/'+job.id+'?'+new URLSearchParams(scope)))));
          if(key!==printQueueScopeKey())return;
        }
        if(documents.every(job=>Boolean(job.document.html))){
          const combined=document.implementation.createHTMLDocument('Печать');
          for(const [index,job] of documents.entries()){
            const doc=new DOMParser().parseFromString(job.document.html,'text/html');
            const section=combined.createElement('section');section.className='print-saved-page';
            // Scope each saved template's styles so templates do not overwrite each other.
            const styles=[...doc.querySelectorAll('style')].map(style=>style.textContent).join('\n');
            doc.querySelectorAll('style').forEach(style=>style.remove());
            const style=combined.createElement('style');style.textContent=`@scope (#print-saved-${index}) {${styles.replace(/(^|[},\s])(?:html|body)(?=[\s,{.:#>])/g,'$1:scope')}}`;
            section.id=`print-saved-${index}`;section.append(style,...doc.body.childNodes);combined.body.append(section);
          }
          const layout=combined.createElement('style');layout.textContent='.print-saved-page{break-after:page}.print-saved-page:last-child{break-after:auto}';combined.head.append(layout);
          let frame=document.getElementById('settingsPrintApiBrowserPreview');
          if(!frame){frame=document.createElement('iframe');frame.id='settingsPrintApiBrowserPreview';frame.title='Предпросмотр печати';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';document.body.append(frame);}
          const error=document.createElement('p'),print=document.createElement('button');
          renderPrintTemplatePreview('job',true,{html:{value:combined.documentElement.outerHTML},preview:frame,error,print});
          return;
        }
        // PDF documents use the browser PDF viewer and its native print preview.
        for(const job of documents){
          if(job.document.html){await previewPrintQueueJobs([job]);continue;}
          if(!job.document.pdf_base64)throw new Error('В задании отсутствует документ');
          const bytes=Uint8Array.from(atob(job.document.pdf_base64.replace(/^data:application\/pdf;base64,/,'')),char=>char.charCodeAt(0));
          const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
          const frame=document.createElement('iframe');frame.title=job.job_name;frame.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:600px';
          frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};frame.src=url;document.body.append(frame);
          frame.contentWindow.addEventListener('afterprint',()=>{frame.remove();URL.revokeObjectURL(url);},{once:true});
        }
      }catch(error){alert('Не удалось открыть предпросмотр: '+error.message);}
    }

document.addEventListener('click',event=>{
      const filters=printQueueBody?.querySelector('.print-queue-filters[open]');
      if(filters&&!filters.contains(event.target))filters.open=false;
    });

printQueueBody?.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      const filters=printQueueBody.querySelector('.print-queue-filters[open]');
      if(filters){filters.open=false;filters.querySelector('summary')?.focus();event.stopPropagation();}
    });

function printQueueFilterValues(field) {
      const value=printQueueFilters[field];return Array.isArray(value)?value.map(String):value?[String(value)]:[];
    }

function renderPrintQueueToolbar(data) {
      let toolbar=printQueueBody.querySelector('.print-queue-toolbar');
      const signature=JSON.stringify([data.agents,data.printers,data.templates]);
      if(toolbar&&toolbar.dataset.options!==signature){
        const control=toolbar.querySelector('.settings-print-api-control-bar');
        if(control)printApiPanel.insertBefore(control,printApiPanel.querySelector('.settings-panel-scroll'));
        toolbar.remove();toolbar=null;
      }
      if(!toolbar){
        toolbar=document.createElement('div');toolbar.className='print-queue-toolbar';toolbar.dataset.options=signature;
        const tabs=document.createElement('div');tabs.className='settings-print-api-tabs print-queue-status-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Статус печати');
        for(const [view,title] of [['all','Все'],['queue','Ожидают'],['errors','Ошибки'],['done','Выполнены']]){
          const button=queueButton(title,()=>showPrintQueueView(view));button.dataset.queueStatus=view;button.setAttribute('role','tab');tabs.append(button);
        }
        toolbar.append(tabs);
        const control=printApiPanel.querySelector('.settings-print-api-control-bar');
        if(control)toolbar.append(control);
        const filters=document.createElement('details');filters.className='print-queue-filters';
        const trigger=document.createElement('summary');trigger.className='btn btn-icon btn-sm';trigger.title='Фильтры';trigger.setAttribute('aria-label','Фильтры');trigger.innerHTML='<i class="fas fa-filter" aria-hidden="true"></i><span class="print-queue-filter-count hidden"></span>';
        const menu=document.createElement('div');menu.className='settings-delivery-zone-info-popover print-queue-filter-menu';
        for(const [field,label] of [['agent_id','Устройства'],['printer_id','Принтеры'],['template_name','Шаблоны']]){
          const accordion=document.createElement('details');accordion.className='print-queue-filter-section';
          const heading=document.createElement('summary');heading.textContent=label;accordion.append(heading);
          const options=field==='template_name'?(data.templates||[]).map(item=>[item.title,item.title]):field==='agent_id'?(data.agents||[]).map(item=>[item.id,item.device_name||`Компьютер #${item.id}`]):(data.printers||[]).map(item=>[item.id,`${item.display_name||item.system_name} · ${(data.agents||[]).find(agent=>Number(agent.id)===Number(item.agent_id))?.device_name||'#'+item.agent_id}`]);
          for(const [value,title] of options){
            const row=document.createElement('label');row.className='print-queue-filter-option';
            const checkbox=document.createElement('span');checkbox.className='product-row-select-control';
            const input=document.createElement('input');input.type='checkbox';input.className='product-row-select-input';input.dataset.filterField=field;input.value=String(value);input.checked=printQueueFilterValues(field).includes(String(value));
            const box=document.createElement('span');box.className='product-row-select-box';box.setAttribute('aria-hidden','true');checkbox.append(input,box);row.append(checkbox,document.createTextNode(title));
            input.addEventListener('change',()=>{
              const selected=new Set(printQueueFilterValues(field));input.checked?selected.add(input.value):selected.delete(input.value);printQueueFilters[field]=[...selected];
              printQueueBefore=null;printQueueSelected.clear();loadPrintQueue();
            });accordion.append(row);
          }
          if(!options.length){const empty=document.createElement('span');empty.className='muted';empty.textContent='Нет данных';accordion.append(empty);}
          menu.append(accordion);
        }
        menu.append(queueButton('Сбросить',()=>{printQueueFilters={agent_id:[],printer_id:[],template_name:[]};menu.querySelectorAll('input').forEach(input=>input.checked=false);printQueueBefore=null;printQueueSelected.clear();loadPrintQueue();}));
        filters.append(trigger,menu);toolbar.append(filters);
        const actions=document.createElement('div');actions.className='print-queue-selected-actions';
        for(const [action,icon,title] of [['repeat','fa-print','Распечатать выбранное'],['delete','fa-trash','Удалить выбранное'],['clear','fa-broom','Очистить всю очередь']]){
          const button=queueButton('',()=>mutatePrintQueue(action,[...printQueueSelected]));button.className='btn btn-icon btn-sm';button.dataset.selectionAction=action;button.title=title;button.setAttribute('aria-label',title);button.innerHTML=`<i class="fas ${icon}" aria-hidden="true"></i>`;actions.append(button);
        }
        const count=document.createElement('span');count.className='print-queue-selection-count';actions.append(count);toolbar.append(actions);
        printQueueBody.prepend(toolbar);
      }
      for(const [view,title,count] of [['all','Все',null],['queue','Ожидают',data.counts?.queue_count],['errors','Ошибки',data.counts?.failed_count],['done','Выполнены',data.counts?.done_count]]){
        const button=toolbar.querySelector(`[data-queue-status="${view}"]`);button.textContent=title+(view==='all'?'':count==null?' —':' '+Number(count||0));button.classList.toggle('is-active',view===printQueueView);button.setAttribute('aria-selected',String(view===printQueueView));
      }
      toolbar.querySelectorAll('button').forEach(button=>button.disabled=false);
      applyPrintApiControlState(printApiControlState);
      if(!printQueueServerConfirmed){const pause=toolbar.querySelector('#settingsPrintApiPauseBtn');if(pause)pause.disabled=true;}
      let selectAll=toolbar.querySelector('.print-queue-select-toggle');
      if(!selectAll){selectAll=document.createElement('span');selectAll.className='print-queue-select-toggle';toolbar.prepend(selectAll);}
      const oldInput=selectAll.querySelector('input');
      const oldIndex=printQueueChecks.findIndex(item=>item.input===oldInput);
      if(oldIndex>=0)printQueueChecks.splice(oldIndex,1);
      selectAll.replaceChildren(printQueueCheckbox(data.jobs));
      const count=['agent_id','printer_id','template_name'].reduce((sum,field)=>sum+printQueueFilterValues(field).length,0);
      toolbar.querySelectorAll('input[data-filter-field]').forEach(input=>input.checked=printQueueFilterValues(input.dataset.filterField).includes(input.value));
      const badge=toolbar.querySelector('.print-queue-filter-count');badge.textContent=String(count);badge.classList.toggle('hidden',!count);
      toolbar.querySelector('.print-queue-filters > summary').title=count?`Фильтры: ${count}`:'Фильтры';
    }

let printQueueServerConfirmed=false;

function printQueueCacheScope(){
      return window.AdminPersistentCache?.scope({domain:'print:queue:'+Number(printApiSelectedConnectionId||0),version:1,storeId:Number(settingsPrintApiStore?.value||0)});
    }

function setPrintQueueLoadStatus(message){
      let status=printQueueBody.querySelector('.print-queue-load-status');
      if(!status){status=document.createElement('p');status.className='muted print-queue-load-status';status.setAttribute('role','status');printQueueBody.querySelector('.print-queue-toolbar')?.after(status);}
      status.textContent=message;status.classList.toggle('hidden',!message);
    }

function renderPrintQueueData(data,scopeKey){
        const renderKey=JSON.stringify([printQueueBody.dataset.cacheContext,scopeKey,printQueueView,printQueueFilters,printQueueBefore,Boolean(data.placeholder),data.jobs,data.next,data.accumulation]);
        if(printQueueBody.dataset.renderKey===renderKey&&printQueueBody.querySelector('.print-queue-toolbar')){
          renderPrintQueueToolbar(data);syncPrintQueueSelection();return;
        }
        printQueueBody.dataset.renderKey=renderKey;printQueueChecks.length=0;
        const toolbar=printQueueBody.querySelector('.print-queue-toolbar');
        for(const child of [...printQueueBody.childNodes])if(child!==toolbar)child.remove();
        printQueueVisibleJobs=data.jobs;
        const visible=new Set(data.jobs.map(job=>Number(job.id)));for(const id of printQueueSelected)if(!visible.has(id))printQueueSelected.delete(id);
        renderPrintQueueToolbar(data);

        if(Number(data.accumulation?.order_count)>0){
          const summary=document.createElement('p');summary.className='muted print-queue-accumulation';
          const at=String(data.accumulation.release_at||'');summary.textContent=`Накопление: ${Number(data.accumulation.order_count)} заказов`+(at?' · печать '+at.slice(8,10)+'.'+at.slice(5,7)+' в '+at.slice(11,16):'');printQueueBody.append(summary);
        }
        const groups=new Map();for(const job of data.jobs){if(!groups.has(job.group_key))groups.set(job.group_key,[]);groups.get(job.group_key).push(job);}
        if(!data.placeholder&&!data.jobs.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Заданий нет';printQueueBody.append(empty);}
        for(const jobs of groups.values()){
          const first=jobs[0],key=printQueueScopeKey()+':'+first.group_key;
          const orderTitle=first.order_id>0?'Заказ '+(first.public_id||'#'+first.order_id):'Без заказа';
          const completed=jobs.filter(job=>job.status==='done').length;
          const group=printQueueAccordion(jobs,key,orderTitle,`Выполнено ${completed} из ${jobs.length}`,0,body=>{
            const templates=new Map();
            for(const job of jobs){const name=job.job_name||'—';if(!templates.has(name))templates.set(name,[]);templates.get(name).push(job);}
            for(const [name,items] of templates){
              body.append(printQueueAccordion(items,key+':'+name,name,`Заданий: ${items.length}`,1,children=>{
                for(const job of items){
                  const item=printQueueAccordion([job],key+':job:'+job.id,`${job.job_name||'—'} · #${job.id}`,`${orderTitle} · ${job.agent_name||'Без компьютера'} → ${job.printer_name||'Без принтера'}`,2,content=>{
                    const title=content.parentElement.querySelector('.print-queue-expand');loadPrintQueueJobContent(job,content,title);
                  });children.append(item);
                }
              }));
            }
          });printQueueBody.append(group);
        }
        const pages=document.createElement('div');pages.className='settings-print-api-actions';
        if(printQueueBefore)pages.append(queueButton('В начало',()=>{printQueueBefore=null;printQueueSelected.clear();loadPrintQueue();}));
        if(data.next)pages.append(queueButton('Следующие заказы',()=>{printQueueBefore=data.next;printQueueSelected.clear();loadPrintQueue();}));printQueueBody.append(pages);syncPrintQueueSelection();
    }

async function loadPrintQueue({background=false} = {}) {
      if(!printQueueBody||['settings','devices','notifications'].includes(printQueueView)||printQueueBusy)return;
      const version=++printQueueVersion,scopeKey=printQueueScopeKey();releasePrintQueuePdf();
      const cache=printQueueCacheScope();
      const query=new URLSearchParams({...printQueueScope(),...Object.fromEntries(['agent_id','printer_id','template_name'].map(field=>[field,JSON.stringify(printQueueFilterValues(field).sort())])),view:printQueueView,...(printQueueBefore?{before:printQueueBefore}:{})});
      const cacheKey=query.toString(),contextKey=JSON.stringify([cache?.namespace,cacheKey]);
      const current=()=>version===printQueueVersion&&scopeKey===printQueueScopeKey()&&cache?.namespace===printQueueCacheScope()?.namespace;
      const changedContext=printQueueBody.dataset.cacheContext!==contextKey;
      printQueueBody.dataset.cacheContext=contextKey;
      printQueueBody.setAttribute('aria-busy','true');
      let hasData=!changedContext&&Boolean(printQueueBody.querySelector('.print-queue-accordion'));
      let cacheError='';
      if(changedContext||!printQueueBody.querySelector('.print-queue-toolbar')){
        printQueueServerConfirmed=false;
        renderPrintQueueData({placeholder:true,jobs:[],agents:[],printers:[],templates:[],counts:{},next:null},scopeKey);
      }
      if(!background||!hasData)setPrintQueueLoadStatus(hasData?'Обновление данных…':'Загрузка очереди…');
      try{
        if(changedContext){
          try{
            if(!cache?.complete)throw new Error('Не определён пользователь или компания для кэша');
            const entry=await cache.getEntry(cacheKey,{allowStale:true});
            if(!current())return;
            if(entry?.data){printQueueServerConfirmed=false;renderPrintQueueData(entry.data,scopeKey);hasData=true;setPrintQueueLoadStatus('Показаны сохранённые данные. Обновление…');}
          }catch(error){cacheError='Не удалось прочитать IndexedDB';console.error(cacheError,error);}
        }
        const data=await printQueueRequest('?'+query);
        if(!current())return;
        printQueueServerConfirmed=true;renderPrintQueueData(data,scopeKey);hasData=true;
        printQueueBody.removeAttribute('aria-busy');
        setPrintQueueLoadStatus(cacheError);
        try{
          if(!cache?.complete)throw new Error('Не определён пользователь или компания для кэша');
          const saved=await cache.getEntry(cacheKey,{allowStale:true});
          if(JSON.stringify(saved?.data)!==JSON.stringify(data)){
            if(!await cache.set(cacheKey,data,{ttlMs:7*24*60*60*1000}))throw new Error('Не удалось сохранить очередь');
            await cache.prune(100);
          }
        }catch(error){console.error('Ошибка сохранения очереди в IndexedDB:',error);if(current())setPrintQueueLoadStatus('Данные получены. Не удалось сохранить очередь в IndexedDB.');}
      }catch(error){if(current()){
        printQueueServerConfirmed=false;printQueueBody.removeAttribute('aria-busy');syncPrintQueueSelection();
        printQueueBody.querySelectorAll('[data-print-mutation]').forEach(button=>button.disabled=true);
        const pause=printQueueBody.querySelector('#settingsPrintApiPauseBtn');if(pause)pause.disabled=true;
        setPrintQueueLoadStatus((hasData?'Нет связи — показаны последние полученные данные. ':'Не удалось загрузить очередь. ')+error.message);
      }}
    }

async function mutatePrintQueue(action,ids) {
      if(printQueueBusy||(action!=='clear'&&!ids.length))return;
      if(action==='clear'&&!window.confirm('Очистить всю очередь текущего подключения? Будут удалены все ожидающие, выполняющиеся, выполненные задания и ошибки, независимо от фильтра и выбранных строк.'))return;
      if(action==='delete'&&!window.confirm(`Удалить выбранные задания печати (${ids.length})?`))return;
      const scope=printQueueScope(),key=printQueueScopeKey(),selection=JSON.stringify([key,action,[...ids].sort((a,b)=>a-b)]);
      if(!printQueuePendingAction||printQueuePendingAction.selection!==selection)printQueuePendingAction={selection,request_id:crypto.randomUUID()};
      printQueueBusy=true;syncPrintQueueSelection();printQueueBody.querySelectorAll('button,select').forEach(control=>control.disabled=true);
      try{
        const requestId=printQueuePendingAction.request_id;
        for(let offset=0;offset<(action==='clear'?1:ids.length);offset+=200){
          const batch=ids.slice(offset,offset+200);
          await printQueueRequest('/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,ids:batch,request_id:requestId})});
          for(const id of batch)printQueueSelected.delete(Number(id));
        }
        printQueuePendingAction=null;printQueueSelected.clear();
        if(action==='clear')printQueueBefore=null;
        try{await printQueueCacheScope()?.clear();}catch(error){console.error('Не удалось обновить кэш очереди:',error);}
      }catch(error){alert('Не удалось выполнить действие: '+error.message);}
      finally{printQueueBusy=false;if(key===printQueueScopeKey()){await loadPrintQueue();await loadPrintApiCards();}}
    }

async function retryPrintQueueJob(id) {await mutatePrintQueue('repeat',[id]);}

async function openPrintQueueJob(id) {
      const version=++printQueueVersion,key=printQueueScopeKey();
      try{
        const job=await printQueueRequest('/'+id+'?'+new URLSearchParams(printQueueScope()));
        if(version!==printQueueVersion||key!==printQueueScopeKey())return;
        const pauseControl=printQueueBody.querySelector('.settings-print-api-control-bar');
        if(pauseControl)printApiPanel.insertBefore(pauseControl,printApiPanel.querySelector('.settings-panel-scroll'));
        printQueueBody.replaceChildren(queueButton('Назад к списку',loadPrintQueue));
        const title=document.createElement('h3');title.textContent=`Задание #${job.id} · ${job.job_name}`;printQueueBody.append(title);
        const details=document.createElement('p');details.textContent=`${job.status} · ${job.agent_name||'Без компьютера'} → ${job.printer_name||'Без принтера'} · Попыток: ${job.attempts}`;printQueueBody.append(details);
        if(job.last_error){const error=document.createElement('p');error.textContent=job.last_error;printQueueBody.append(error);}
        for(const attempt of job.history||[]){
          const line=document.createElement('p');
          const status=({pending:'Ожидает',processing:'Выполняется',failed:'Ошибка',done:'Выполнено'})[attempt.status]||attempt.status;
          line.textContent=`#${attempt.id} · ${status}${attempt.deleted_at?' · Удалено':''} · Попыток: ${attempt.attempts}${attempt.last_error?' · '+attempt.last_error:''}`;
          printQueueBody.append(line);
        }
        for(const retry of job.retries){const history=document.createElement('p');history.textContent=`Ручной повтор ${retry.created_at}: попыток ${retry.attempts}, ошибка: ${retry.last_error||'—'}`;printQueueBody.append(history);}
        if(['failed','done'].includes(job.status))printQueueBody.append(queueButton('Повторить',()=>retryPrintQueueJob(job.id)));
        printQueueBody.append(queueButton('Удалить',()=>mutatePrintQueue('delete',[job.id])));
        if(job.document.html){
          const preview=document.createElement('iframe');preview.title='Сохранённый документ';preview.setAttribute('sandbox','allow-same-origin');preview.style.width='100%';
          const error=document.createElement('p'),print=document.createElement('button');print.type='button';print.className='hidden';
          printQueueBody.append(error,preview);
          renderPrintTemplatePreview('job',false,{html:{value:job.document.html},preview,error,print});
        }else if(job.document.pdf_base64){
          releasePrintQueuePdf();
          const binary=atob(job.document.pdf_base64.replace(/^data:application\/pdf;base64,/,''));
          printQueuePdfUrl=URL.createObjectURL(new Blob([Uint8Array.from(binary,char=>char.charCodeAt(0))],{type:'application/pdf'}));
          const link=document.createElement('a');link.href=printQueuePdfUrl;link.target='_blank';link.rel='noopener';link.className='btn btn-link btn-sm';link.textContent='Открыть PDF';printQueueBody.append(link);
        }
      }catch(error){if(version===printQueueVersion&&key===printQueueScopeKey()){printQueueBody.textContent='Не удалось открыть задание: '+error.message;printQueueBody.append(queueButton('Назад',loadPrintQueue));}}
    }

async function openPrintApiForStore(storeId, title, connectionId = 0) {
      if (!storeId) return;
      if (!host.storesState.loaded) await host.loadStores();
      const tabId = getPrintApiTabKey(storeId, connectionId);
      const connection=printApiListItems.find(item=>Number(item.token_id)===Number(connectionId));
      const tabTitle=connection?.display_name || title || 'API';
      let tab=getPrintApiTabState(tabId);
      if(!tab){
        tab={key:tabId,storeId:Number(storeId),connectionId:Number(connectionId),title:tabTitle,isDraft:!connectionId,
          snapshot:connectionId?{store_id:Number(storeId),connection_id:Number(connectionId),name:connection?.display_name||'',is_active:connection?.is_active??1,printing_paused:connection?.printing_paused,print_control_version:connection?.print_control_version}:null};
        setPrintApiTabState(tabId,tab);
      }else{tab.title=tabTitle;setPrintApiTabState(tabId,tab);}
      if(host.rightDefault)host.rightDefault.classList.add('hidden');
      host.ensureTab(tabId,tabTitle);
      // setActiveRightTab persists the previous tab before restoring this one.
      host.setActiveRightTab(tabId);
      printApiActiveStoreId=Number(storeId);
      renderPrintApiCards();
      const current=getPrintApiTabState(tabId);
      if(connectionId && !current?.dirty)await loadPrintApiToken(storeId,connectionId);
    }

async function startCreatePrintApi() {
      if(!host.storesState.loaded)await host.loadStores();
      if(!printApiListLoaded)await loadPrintApiCards();
      const tabId=getPrintApiNewTabKey();
      if(!getPrintApiTabState(tabId))setPrintApiTabState(tabId,{key:tabId,title:'Новый API',storeId:0,connectionId:0,isDraft:true,snapshot:null});
      if(host.rightDefault)host.rightDefault.classList.add('hidden');
      host.ensureTab(tabId,'Новый API');
      host.setActiveRightTab(tabId);
      applyPrintApiControlState(null);
      renderPrintApiCards();
    }

function resetPrintApiDeviceState(options = {}) {

      const statusText = options.statusText || "Нажмите \"Проверить подключение\"";

      const printerText = options.printerText || "Статус не проверен";

      setPrintApiDeviceState(statusText, printerText, []);

    }

function applyPrintApiDeviceState(info) {
      applyPrintApiControlState(info);

      if (!info) {

        resetPrintApiDeviceState();

        return;

      }

      const printerOnline = Number(info.printer_online || 0) === 1;

      const agentOnline = Number(

        info.agent_online ?? info.connection_online ?? info.agent_running ?? 0

      ) === 1;

      const printerName = info.printer_name ? String(info.printer_name) : "";

      const agentName = info.agent_name ? String(info.agent_name) : "";

      const agentVersion = info.agent_version ? String(info.agent_version) : "";

      const connectionEstablished = agentOnline;

      const statusText = connectionEstablished ? "Соединение установлено" : "Соединение разорвано";

      const printerText = printerOnline ? (printerName || "Не определен") : "Нет подключенных принтеров";

      const draftDefault=settingsPrintApiPrinterName?.value;
      setPrintApiDeviceState(statusText, printerText, info.printers, info.agents);
      if(printApiSettingsDirty){if(settingsPrintApiPrinterName)settingsPrintApiPrinterName.value=draftDefault;syncPrintApiSelects();return;}
      if (settingsPrintApiName) settingsPrintApiName.value = String(info.display_name || "");
      if (settingsPrintApiCopyToken) settingsPrintApiCopyToken.disabled = !String(info.token || "");
      if (settingsPrintApiRevealToken) settingsPrintApiRevealToken.disabled = !String(info.token || "");
      if (settingsPrintApiPrinterName && Number(info.default_printer_id || 0) > 0) {
        settingsPrintApiPrinterName.value = String(info.default_printer_id);
      }
      syncPrintApiSelects();

    }

function stopPrintApiAutoRefresh() {

      if (printApiRefreshTimer) {

        clearTimeout(printApiRefreshTimer);

        printApiRefreshTimer = null;

      }

    }

function schedulePrintApiAutoRefresh() {
      stopPrintApiAutoRefresh();void startPrintRealtime();
    }

function applyPrintApiNotificationSettings(info) {

      const safe = info && typeof info === "object" ? info : {};

      const applySoundFieldUi = (urlValue,labelEl) => {
        syncPrintApiAudioSlot(labelEl===settingsPrintApiOrderSoundLabel?'Order':'Message');
      };

      if (settingsPrintApiNotifyNewOrder) {

        settingsPrintApiNotifyNewOrder.checked = Number(safe.notify_new_order_enabled ?? 1) === 1;

      }

      if (settingsPrintApiNotifyNewMessage) {

        settingsPrintApiNotifyNewMessage.checked = Number(safe.notify_new_message_enabled ?? 1) === 1;

      }

      if (settingsPrintApiOrderSoundUrl) {

        settingsPrintApiOrderSoundUrl.value = String(safe.sound_new_order_url || "");

      }

      if (settingsPrintApiMessageSoundUrl) {

        settingsPrintApiMessageSoundUrl.value = String(safe.sound_new_message_url || "");

      }

      applySoundFieldUi(

        settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "",

        settingsPrintApiOrderSoundLabel,

        settingsPrintApiOrderSoundPlayBtn

      );

      applySoundFieldUi(

        settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : "",

        settingsPrintApiMessageSoundLabel,

        settingsPrintApiMessageSoundPlayBtn

      );

    }

function refreshPrintApiSoundUiFromInputs() {

      applyPrintApiNotificationSettings({

        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,

        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,

        sound_new_order_url: settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "",

        sound_new_message_url: settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : ""

      });

    }

function markPrintApiSettingsDirty() {
      document.getElementById("settingsPrintApiDirtyNotice")?.classList.remove("hidden");

      const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

      printApiSettingsDirty = true;

      printApiDirtyStoreId = Number.isFinite(storeId) && storeId > 0 ? storeId : 0;

    }

function clearPrintApiSettingsDirty() {
      document.getElementById("settingsPrintApiDirtyNotice")?.classList.add("hidden");

      printApiSettingsDirty = false;

      printApiDirtyStoreId = 0;

    }

function updatePrintApiOriginalFromCurrentForm() {

      printApiOriginal = {
        printers: printApiDeviceSnapshot.printers,
        agents: printApiDeviceSnapshot.agents,

        store_id: Number(settingsPrintApiStore && settingsPrintApiStore.value) || 0,
        connection_id: printApiSelectedConnectionId,
        name: String(settingsPrintApiName && settingsPrintApiName.value || ""),

        token: String((settingsPrintApiToken && settingsPrintApiToken.value) || ""),

        printer_status: String((settingsPrintApiPrinterStatus && settingsPrintApiPrinterStatus.value) || ""),

        printer_name: String((settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || ""),
        default_printer_id: Number(settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || 0,

        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,

        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,

        sound_new_order_url: String((settingsPrintApiOrderSoundUrl && settingsPrintApiOrderSoundUrl.value) || ""),

        sound_new_message_url: String((settingsPrintApiMessageSoundUrl && settingsPrintApiMessageSoundUrl.value) || "")

      };

    }

function applyPrintApiOriginalState() {
      printApiSelectedConnectionId = Number(printApiOriginal.connection_id || 0);
      if (settingsPrintApiName) settingsPrintApiName.value = String(printApiOriginal.name || "");

      if (settingsPrintApiStore && printApiOriginal.store_id) {

        settingsPrintApiStore.value = String(printApiOriginal.store_id);

      }

      if (settingsPrintApiToken) {

        settingsPrintApiToken.value = String(printApiOriginal.token || "");

      }

      printApiDeviceSnapshot.removed_devices=[];
      setPrintApiDeviceState(printApiOriginal.printer_status, printApiOriginal.printer_name, printApiOriginal.printers, printApiOriginal.agents);
      if(settingsPrintApiPrinterName)settingsPrintApiPrinterName.value=String(printApiOriginal.default_printer_id||'');
      syncPrintApiSelects();

      applyPrintApiNotificationSettings(printApiOriginal);

      if (settingsPrintApiGenerateBtn) {

        syncPrintApiTokenIcons();

      }

    }

function syncPrintApiSelects() {
      for(const [select,context] of productionZoneSelectContexts){
        if(!select.isConnected){closeStoreTimezoneDropdown(context);productionZoneSelectContexts.delete(select);}
      }
      printApiPanel?.querySelectorAll('select').forEach(select=>{
        enhanceProductionZoneSelect(select);
        const context=productionZoneSelectContexts.get(select);
        if(context){select.classList.add('hidden');renderStoreTimezoneSelector(context);}
      });
    }

function setPrintApiDraftMode(enabled) {
      document.getElementById("settingsPrintApiDirtyNotice")?.classList.toggle("hidden",!printApiSettingsDirty);

      printApiDraftMode = Boolean(enabled);

      if (settingsPrintApiStore) settingsPrintApiStore.classList.toggle("hidden", !printApiDraftMode);
      if (settingsPrintApiStoreValue) {
        const selectedStore = host.storesState.items.find((store) => Number(store.id) === Number(settingsPrintApiStore && settingsPrintApiStore.value || 0));
        settingsPrintApiStoreValue.textContent = selectedStore ? String(selectedStore.name || `Филиал #${selectedStore.id}`) : "Филиал не выбран";
        settingsPrintApiStoreValue.classList.toggle("hidden", printApiDraftMode);
      }

      const deleteButton=document.getElementById('settingsPrintApiDeleteBtn');
      if(deleteButton){deleteButton.disabled=!(printApiSelectedConnectionId>0);deleteButton.classList.toggle('hidden',!(printApiSelectedConnectionId>0));}
      if (settingsPrintApiStore) settingsPrintApiStore.disabled = !printApiDraftMode;
      if (settingsPrintApiName) settingsPrintApiName.disabled = !printApiDraftMode;

      if (settingsPrintApiToken) {

        settingsPrintApiToken.disabled = !printApiDraftMode;

        settingsPrintApiToken.readOnly = true;

      }

      if (settingsPrintApiPrinterStatus) {

        settingsPrintApiPrinterStatus.disabled = !printApiDraftMode;

        settingsPrintApiPrinterStatus.readOnly = true;

      }

      if (settingsPrintApiPrinterName) {

        settingsPrintApiPrinterName.disabled = !printApiDraftMode;

        settingsPrintApiPrinterName.readOnly = true;

      }

      if (settingsPrintApiNotifyNewOrder) settingsPrintApiNotifyNewOrder.disabled = !printApiDraftMode;

      if (settingsPrintApiNotifyNewMessage) settingsPrintApiNotifyNewMessage.disabled = !printApiDraftMode;

      if (settingsPrintApiCopyToken) settingsPrintApiCopyToken.disabled = !String(settingsPrintApiToken && settingsPrintApiToken.value || "");
      if (settingsPrintApiRevealToken) settingsPrintApiRevealToken.disabled = !String(settingsPrintApiToken && settingsPrintApiToken.value || "");

      if (settingsPrintApiGenerateBtn) settingsPrintApiGenerateBtn.disabled = !printApiDraftMode;

      if (settingsPrintApiCheckBtn) settingsPrintApiCheckBtn.disabled = !printApiDraftMode;

      if (settingsPrintApiOrderSoundUploadBtn) settingsPrintApiOrderSoundUploadBtn.disabled = !printApiDraftMode;

      paintPrintApiAudio("Order");

      if (settingsPrintApiOrderSoundClearBtn) settingsPrintApiOrderSoundClearBtn.disabled = !printApiDraftMode||!String(settingsPrintApiOrderSoundUrl?.value||"");

      if (settingsPrintApiMessageSoundUploadBtn) settingsPrintApiMessageSoundUploadBtn.disabled = !printApiDraftMode;

      paintPrintApiAudio("Message");

      if (settingsPrintApiMessageSoundClearBtn) settingsPrintApiMessageSoundClearBtn.disabled = !printApiDraftMode||!String(settingsPrintApiMessageSoundUrl?.value||"");

      if (settingsPrintApiFooterView) settingsPrintApiFooterView.classList.toggle("hidden", printApiDraftMode);

      if (settingsPrintApiFooterEdit) settingsPrintApiFooterEdit.classList.toggle("hidden", !printApiDraftMode);

      syncPrintApiSelects();

    }

async function cancelPrintApiDraft() {
      if(!printApiSelectedConnectionId&&isPrintApiTabId(host.activeRightTabId)){
        const key=host.activeRightTabId;
        clearPrintApiSettingsDirty();
        host.rightTabs?.querySelector(`[data-right-tab="${key}"] .product-tab-close`)?.click();
        clearPrintApiTabState(key);
        if(host.activeRightTabId===key){host.rightTabs?.querySelector(`[data-right-tab="${key}"]`)?.remove();host.setActiveRightTab('');}
        return;
      }

      const originalStoreId = Number(printApiOriginal.store_id || 0);

      clearPrintApiSettingsDirty();

      setPrintApiDraftMode(true);

      if (settingsPrintApiStore && originalStoreId > 0) {

        settingsPrintApiStore.value = String(originalStoreId);

      }

      applyPrintApiOriginalState();

      if (isPrintApiTabId(host.activeRightTabId) && originalStoreId > 0) {

        await loadPrintApiToken(originalStoreId, printApiSelectedConnectionId);

        printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;

        schedulePrintApiAutoRefresh();

      }

    }

async function uploadPrintApiSound(file, field) {

      if (!file) return null;

      const json = await host.uploadTenantSound(field, file);

      if (!json || json.ok !== true || !json.url) {

        throw new Error(json?.error || "SOUND_UPLOAD_FAILED");

      }

      return String(json.url);

    }

async function savePrintApiNotificationSettings(storeId) {

      if (!storeId) return null;

      let currentInfo = printApiSelectedConnectionId ? await fetchPrintApiInfo(storeId, printApiSelectedConnectionId) : null;

      if (!currentInfo) {

        const createRes = await authFetch("/api/admin/tenant/print-api", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ store_id: storeId, name: String(settingsPrintApiName && settingsPrintApiName.value || "").trim() })

        });

        const createData = await createRes.json().catch(() => null);

        if (!createData || createData.ok !== true) throw new Error(createData?.error || "PRINT_API_CREATE_FAILED");

        currentInfo = createData.data || null;
        printApiSelectedConnectionId = Number(currentInfo && (currentInfo.connection_id || currentInfo.id) || 0);

      }

      const payload = {

        store_id: storeId,
        connection_id: printApiSelectedConnectionId,
        removed_devices: printApiDeviceSnapshot.removed_devices || [],
        name: String(settingsPrintApiName && settingsPrintApiName.value || "").trim(),

        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,

        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,

        sound_new_order_url: settingsPrintApiOrderSoundUrl ? String(settingsPrintApiOrderSoundUrl.value || "").trim() || null : null,

        sound_new_message_url: settingsPrintApiMessageSoundUrl ? String(settingsPrintApiMessageSoundUrl.value || "").trim() || null : null,

        default_printer_id: Number(settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || 0

      };

      const res = await authFetch("/api/admin/tenant/print-api", {

        method: "PUT",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(payload)

      });

      const data = await res.json().catch(() => null);

      if (!data || data.ok !== true) throw new Error(data?.message || data?.error || "PRINT_API_SETTINGS_SAVE_FAILED");

      printApiDeviceSnapshot.removed_devices=[];
      if (data.data) currentInfo = data.data;

      return currentInfo || data.data || null;

    }

function printApiAudioTime(seconds){
      const value=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
    }

function destroyPrintApiAudio(state){
      state?.controller?.abort();state?.audio?.pause();
      if(state?.audio){state.audio.removeAttribute('src');state.audio.load();}
      if(state?.blobUrl)URL.revokeObjectURL(state.blobUrl);
    }

function paintPrintApiAudio(slot){
      const state=printApiAudioStates.get(slot),root=printApiPanel?.querySelector(`[data-print-audio="${slot}"]`);if(!root)return;
      const label=root.querySelector('.settings-sound-label'),wave=root.querySelector('.print-notification-wave'),time=root.querySelector('.print-notification-time');
      const play=document.getElementById(`settingsPrintApi${slot}SoundPlayBtn`),download=document.getElementById(`settingsPrintApi${slot}SoundDownloadBtn`),clear=document.getElementById(`settingsPrintApi${slot}SoundClearBtn`),seek=root.querySelector('input[type="range"]');
      const ready=state?.status==='ready',playing=ready&&!state.audio.paused;
      label.textContent=ready?state.name:state?.status==='error'?state.error:state?.url?'Проверка аудиофайла…':'Звук не загружен';label.title=label.textContent;
      root.classList.toggle('is-error',state?.status==='error');
      play.disabled=!ready;play.innerHTML=`<i class="fas ${playing?'fa-pause':'fa-play'}" aria-hidden="true"></i>`;play.title=playing?'Пауза':'Воспроизвести';play.setAttribute('aria-label',play.title);
      download.disabled=!ready;clear.disabled=!state?.url;wave.classList.toggle('hidden',!ready);time.classList.toggle('hidden',!ready);seek.disabled=!ready;
      if(!ready)return;
      const current=state.audio.currentTime||0,duration=state.audio.duration;
      time.textContent=printApiAudioTime(current)+' / '+printApiAudioTime(duration);seek.max=String(duration);seek.value=String(current);seek.setAttribute('aria-valuetext',time.textContent);
      const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
      const primary=getComputedStyle(root).getPropertyValue('--color-primary').trim()||'#ff7a00';
      state.peaks.forEach((peak,index)=>{const height=Math.max(2,peak*48);ctx.fillStyle=index/state.peaks.length<=current/duration?primary:'#a8afb9';ctx.fillRect(index*canvas.width/state.peaks.length,(canvas.height-height)/2,4,height);});
    }

function syncPrintApiAudioSlot(slot,{revalidate=false} = {}){
      const input=document.getElementById(`settingsPrintApi${slot}SoundUrl`),url=String(input?.value||'').trim();
      const key=host.activeRightTabId+':'+url;let state=printApiAudioStates.get(slot);
      if(state?.key!==key||revalidate){destroyPrintApiAudio(state);state={key,url,status:url?'pending':'empty'};printApiAudioStates.set(slot,state);}
      paintPrintApiAudio(slot);
      if(document.getElementById('settingsPrintApiNotificationsBody')?.classList.contains('hidden')||state.status!=='pending')return;
      state.status='loading';state.controller=new AbortController();
      const current=()=>printApiAudioStates.get(slot)===state;
      (async()=>{
        let context;
        try{
          const response=await fetch(url,{signal:state.controller.signal,cache:'no-cache'});
          if(!response.ok)throw new Error(`Файл недоступен (HTTP ${response.status})`);
          const blob=await response.blob();if(!blob.size)throw new Error('Аудиофайл пуст');
          const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('Браузер не поддерживает анализ аудио');
          context=new AudioContext();
          const buffer=await context.decodeAudioData(await blob.arrayBuffer());
          if(!current())return;
          state.peaks=Array.from({length:80},(_,index)=>{
            const start=Math.floor(index*buffer.length/80),end=Math.floor((index+1)*buffer.length/80);let peak=0;
            for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let sample=start;sample<end;sample++)peak=Math.max(peak,Math.abs(data[sample]));}return peak;
          });
          const maximum=Math.max(...state.peaks);if(maximum>0)state.peaks=state.peaks.map(value=>value/maximum);
          state.name=printApiAudioNames.get(url)||decodeURIComponent(new URL(url,location.href).pathname.split('/').pop())||'Аудиофайл';
          state.blobUrl=URL.createObjectURL(blob);state.audio=new Audio();
          state.audio.addEventListener('loadedmetadata',()=>{if(!current())return;if(!Number.isFinite(state.audio.duration)||state.audio.duration<=0){state.status='error';state.error='Не удалось определить длительность';}else state.status='ready';paintPrintApiAudio(slot);});
          state.audio.addEventListener('error',()=>{if(current()){state.status='error';state.error='Файл не воспроизводится';paintPrintApiAudio(slot);}});
          for(const event of ['play','pause','timeupdate','ended'])state.audio.addEventListener(event,()=>{if(current())paintPrintApiAudio(slot);});
          state.audio.src=state.blobUrl;state.audio.load();
        }catch(error){if(current()&&error.name!=='AbortError'){state.status='error';state.error='Не удалось прочитать аудиофайл'+(error.message?': '+error.message:'');paintPrintApiAudio(slot);}}
        finally{if(context)await context.close();}
      })();
    }

async function playSoundPreview(url,slot){
      const state=printApiAudioStates.get(slot);if(state?.url!==url||state.status!=='ready')return;
      if(!state.audio.paused){state.audio.pause();return;}
      for(const other of printApiAudioStates.values())if(other!==state)other.audio?.pause();
      try{await state.audio.play();}catch(error){state.status='error';state.error='Не удалось воспроизвести: '+error.message;paintPrintApiAudio(slot);}
    }

async function fetchPrintApiInfo(storeId, connectionId = printApiSelectedConnectionId) {

      if (!(Number(connectionId) > 0)) return null;
      const res = await authFetch(`/api/admin/tenant/print-api?store_id=${encodeURIComponent(storeId)}&connection_id=${encodeURIComponent(connectionId)}&_ts=${Date.now()}`);

      const data = await res.json();

      if (!data || !data.ok) return null;

      return data.data || null;

    }

async function loadPrintApiToken(storeId, connectionId = printApiSelectedConnectionId) {

      if (!isPrintApiTabId(host.activeRightTabId)) return;

      if (!settingsPrintApiToken || !storeId) return;

      try {

        const requestedTab=host.activeRightTabId;
        const info = await fetchPrintApiInfo(storeId, connectionId);
        if(host.activeRightTabId!==requestedTab || printApiSelectedConnectionId!==Number(connectionId))return;

        if (!info) {

          settingsPrintApiToken.value = "";

          resetPrintApiDeviceState({

            statusText: "Сначала сгенерируйте токен",

            printerText: "Нет токена подключения"

          });

          if (settingsPrintApiGenerateBtn) {

            syncPrintApiTokenIcons();

          }

          if (!printApiDraftMode) {

            updatePrintApiOriginalFromCurrentForm();

          }

          return;

        }

        const token = info.token ? info.token : "";

        settingsPrintApiToken.value = token;
        settingsPrintApiToken.type = "password";
        if (settingsPrintApiRevealToken) syncPrintApiTokenIcons();

        clearPrintApiSettingsDirty();

        applyPrintApiNotificationSettings(info);

        resetPrintApiDeviceState({

          statusText: token ? "Нажмите \"Проверить подключение\"" : "Сначала сгенерируйте токен",

          printerText: token ? "Статус не проверен" : "Нет токена подключения"

        });

        if (settingsPrintApiGenerateBtn) {

          syncPrintApiTokenIcons();

        }

        if (token) applyPrintApiDeviceState(info);

        if (!printApiDraftMode || !printApiSettingsDirty) {

          updatePrintApiOriginalFromCurrentForm();

        }

      } catch (err) {

        console.error("Не удалось загрузить print API:", err);

        settingsPrintApiToken.value = "";

        resetPrintApiDeviceState({

          statusText: "Не удалось загрузить токен",

          printerText: "Ошибка запроса"

        });

        if (!printApiDraftMode) {

          updatePrintApiOriginalFromCurrentForm();

        }

      }

    }

async function generatePrintApiToken(storeId) {

      if (!storeId) return;

      try {

        const isRegenerate = printApiSelectedConnectionId > 0;
        if (isRegenerate && !confirm("Перевыпустить ключ? Для Bot этого подключения потребуется новый token.")) return;
        const res = await authFetch(isRegenerate ? "/api/admin/tenant/print-api/regenerate" : "/api/admin/tenant/print-api", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            store_id: storeId,
            connection_id: printApiSelectedConnectionId || undefined,
            name: String(settingsPrintApiName && settingsPrintApiName.value || "").trim()
          })

        });

        const data = await res.json();

        if (!data || !data.ok) {

          resetPrintApiDeviceState({

            statusText: "Не удалось создать токен",

            printerText: "Ошибка запроса"

          });

          return;

        }

        const token = data.data && data.data.token ? data.data.token : "";
        printApiSelectedConnectionId = Number(data.data && (data.data.connection_id || data.data.id) || printApiSelectedConnectionId);

        if (settingsPrintApiToken) settingsPrintApiToken.value = token;

        printApiOriginal.token=token;
        if(settingsPrintApiToken)settingsPrintApiToken.type='password';
        syncPrintApiTokenIcons();
        persistActivePrintApiTabState();
        await loadPrintApiCards();

      } catch (err) {

        console.error("Не удалось создать print API:", err);

      }

    }

async function checkPrintApiConnection(storeId, options = {}) {

      const silent = options && options.silent === true;

      if (!storeId) return;

      if (!settingsPrintApiToken || !String(settingsPrintApiToken.value || "").trim()) {

        resetPrintApiDeviceState({

          statusText: "Сначала сгенерируйте токен",

          printerText: "Нет токена подключения"

        });

        return;

      }

      const connectionLabel=document.getElementById("settingsPrintApiConnectionLabel");

      if (!silent && settingsPrintApiCheckBtn) {

        settingsPrintApiCheckBtn.disabled = true;

        settingsPrintApiCheckBtn.setAttribute("aria-busy","true");
        if(connectionLabel)connectionLabel.textContent="Проверка…";

      }

      try {

        const connectionId = printApiSelectedConnectionId;
        const requestedTab=host.activeRightTabId;
        const info = await fetchPrintApiInfo(storeId, connectionId);
        if(host.activeRightTabId!==requestedTab || printApiSelectedConnectionId!==connectionId)return;

        if (!info) {

          resetPrintApiDeviceState({

            statusText: "Проверка не пройдена",

            printerText: "Токен не найден"

          });

          return;

        }

        if (connectionId !== printApiSelectedConnectionId) return;
        if (settingsPrintApiToken) settingsPrintApiToken.value = String(info.token || "");

        applyPrintApiDeviceState(info);

        const currentStoreId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

        const shouldPreserveDraft = printApiDraftMode || (printApiSettingsDirty

          && Number.isFinite(currentStoreId)

          && currentStoreId > 0

          && currentStoreId === printApiDirtyStoreId);

        if (!shouldPreserveDraft) {

          applyPrintApiNotificationSettings(info);

          updatePrintApiOriginalFromCurrentForm();

        }

        printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;

      } catch (err) {

        console.error("Не удалось проверить подключение print API:", err);
        if(settingsPrintApiCheckBtn)settingsPrintApiCheckBtn.classList.remove('is-connected');
        if(settingsPrintApiPrinterStatusValue)settingsPrintApiPrinterStatusValue.textContent='Не удалось проверить соединение';

        printApiAutoRefreshDelayMs = Math.min(PRINT_API_AUTO_REFRESH_MAX_MS, Math.max(PRINT_API_AUTO_REFRESH_MIN_MS, printApiAutoRefreshDelayMs * 2));

        resetPrintApiDeviceState({

          statusText: "Не удалось проверить",

          printerText: "Ошибка запроса"

        });

      } finally {

        if (!silent && settingsPrintApiCheckBtn) {

          settingsPrintApiCheckBtn.disabled = false;

          settingsPrintApiCheckBtn.removeAttribute("aria-busy");
          if(connectionLabel)connectionLabel.textContent="Соединение";

        }

      }

    }

function ensurePrintApiReady() {

      if (!isPrintApiTabId(host.activeRightTabId)) {

        return;

      }

      const loadAndSelect = async () => {

        if (!host.storesState.loaded) {

          await host.loadStores();

        }

        populatePrintApiStores(host.storesState.items);

        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);

        if (storeId) {

          if (printApiSelectedConnectionId) await loadPrintApiToken(storeId, printApiSelectedConnectionId);

          printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;

          schedulePrintApiAutoRefresh();

        } else {

          if (settingsPrintApiToken) settingsPrintApiToken.value = "";

          resetPrintApiDeviceState({

            statusText: "Сначала выберите филиал",

            printerText: "Нет данных для проверки"

          });

        }

      };

      loadAndSelect();

    }

async function testPrintApiPrinter(printerId) {
      const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value || 0);
      if (!(storeId > 0) || !(printerId > 0)) return;
      try {
        const res = await authFetch("/api/admin/tenant/print-api/test-print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: storeId, printer_id: printerId })
        });
        const data = await res.json().catch(() => null);
        if (!data || data.ok !== true) throw new Error(data?.error || "PRINT_TEST_FAILED");
        alert("\u0422\u0435\u0441\u0442\u043e\u0432\u043e\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0440\u0438\u043d\u0442\u0435\u0440\u0430.");
      } catch (err) {
        console.error("Не удалось отправить тестовую печать:", err);
        alert("Не удалось отправить тестовую печать.");
      }

    }
if (settingsPrintApiOrderSoundUploadBtn && settingsPrintApiOrderSoundFile) {



      settingsPrintApiOrderSoundUploadBtn.addEventListener("click", () => settingsPrintApiOrderSoundFile.click());



      settingsPrintApiOrderSoundFile.addEventListener("change", async () => {



        const file = settingsPrintApiOrderSoundFile.files && settingsPrintApiOrderSoundFile.files[0];



        if (!file) return;



        try {



          const uploadTab=host.activeRightTabId;
          const url = await uploadPrintApiSound(file, "print_sound_new_order_url");
          if(uploadTab!==host.activeRightTabId)return;
          if(url)printApiAudioNames.set(url,file.name);



          if (settingsPrintApiOrderSoundUrl) settingsPrintApiOrderSoundUrl.value = String(url || "");



          markPrintApiSettingsDirty();



          refreshPrintApiSoundUiFromInputs();



        } catch (err) {



          console.error("Не удалось загрузить звук нового заказа:", err);



          alert("Не удалось загрузить звук нового заказа.");



        } finally {



          settingsPrintApiOrderSoundFile.value = "";



        }



      });



    }

if (settingsPrintApiMessageSoundUploadBtn && settingsPrintApiMessageSoundFile) {



      settingsPrintApiMessageSoundUploadBtn.addEventListener("click", () => settingsPrintApiMessageSoundFile.click());



      settingsPrintApiMessageSoundFile.addEventListener("change", async () => {



        const file = settingsPrintApiMessageSoundFile.files && settingsPrintApiMessageSoundFile.files[0];



        if (!file) return;



        try {



          const uploadTab=host.activeRightTabId;
          const url = await uploadPrintApiSound(file, "print_sound_new_message_url");
          if(uploadTab!==host.activeRightTabId)return;
          if(url)printApiAudioNames.set(url,file.name);



          if (settingsPrintApiMessageSoundUrl) settingsPrintApiMessageSoundUrl.value = String(url || "");



          markPrintApiSettingsDirty();



          refreshPrintApiSoundUiFromInputs();



        } catch (err) {



          console.error("Не удалось загрузить звук нового сообщения:", err);



          alert("Не удалось загрузить звук нового сообщения.");



        } finally {



          settingsPrintApiMessageSoundFile.value = "";



        }



      });



    }

if (settingsPrintApiRevealToken && settingsPrintApiToken) {
      settingsPrintApiRevealToken.addEventListener("click", () => {
        const shouldReveal = settingsPrintApiToken.type === "password";
        settingsPrintApiToken.type = shouldReveal ? "text" : "password";
        syncPrintApiTokenIcons();
      });
    }

for(const slot of ['Order','Message']){
      const root=printApiPanel?.querySelector(`[data-print-audio="${slot}"]`);
      root?.querySelector('input[type="range"]')?.addEventListener('input',event=>{const state=printApiAudioStates.get(slot);if(state?.status==='ready'){state.audio.currentTime=Number(event.target.value);paintPrintApiAudio(slot);}});
      document.getElementById(`settingsPrintApi${slot}SoundDownloadBtn`)?.addEventListener('click',()=>{const state=printApiAudioStates.get(slot);if(state?.status!=='ready')return;const link=document.createElement('a');link.href=state.blobUrl;link.download=state.name;document.body.append(link);link.click();link.remove();});
    }
return {get printApiCard(){return printApiCard;},
get printApiPanel(){return printApiPanel;},
get settingsPrintApiStore(){return settingsPrintApiStore;},
get settingsPrintApiStoreValue(){return settingsPrintApiStoreValue;},
get settingsPrintApiToken(){return settingsPrintApiToken;},
get settingsPrintApiGenerateBtn(){return settingsPrintApiGenerateBtn;},
get settingsPrintApiCopyToken(){return settingsPrintApiCopyToken;},
get settingsPrintApiRevealToken(){return settingsPrintApiRevealToken;},
get settingsPrintApiCheckBtn(){return settingsPrintApiCheckBtn;},
get settingsPrintApiPrinterStatus(){return settingsPrintApiPrinterStatus;},
get settingsPrintApiPrinterStatusValue(){return settingsPrintApiPrinterStatusValue;},
get settingsPrintApiPrinterName(){return settingsPrintApiPrinterName;},
get settingsPrintApiName(){return settingsPrintApiName;},
get settingsPrintApiHierarchy(){return settingsPrintApiHierarchy;},
get settingsPrintApiNotifyNewOrder(){return settingsPrintApiNotifyNewOrder;},
get settingsPrintApiNotifyNewMessage(){return settingsPrintApiNotifyNewMessage;},
get settingsPrintApiOrderSoundUploadBtn(){return settingsPrintApiOrderSoundUploadBtn;},
get settingsPrintApiOrderSoundPlayBtn(){return settingsPrintApiOrderSoundPlayBtn;},
get settingsPrintApiOrderSoundClearBtn(){return settingsPrintApiOrderSoundClearBtn;},
get settingsPrintApiOrderSoundFile(){return settingsPrintApiOrderSoundFile;},
get settingsPrintApiOrderSoundUrl(){return settingsPrintApiOrderSoundUrl;},
get settingsPrintApiOrderSoundLabel(){return settingsPrintApiOrderSoundLabel;},
get settingsPrintApiMessageSoundUploadBtn(){return settingsPrintApiMessageSoundUploadBtn;},
get settingsPrintApiMessageSoundPlayBtn(){return settingsPrintApiMessageSoundPlayBtn;},
get settingsPrintApiMessageSoundClearBtn(){return settingsPrintApiMessageSoundClearBtn;},
get settingsPrintApiMessageSoundFile(){return settingsPrintApiMessageSoundFile;},
get settingsPrintApiMessageSoundUrl(){return settingsPrintApiMessageSoundUrl;},
get settingsPrintApiMessageSoundLabel(){return settingsPrintApiMessageSoundLabel;},
get settingsPrintApiEditBtn(){return settingsPrintApiEditBtn;},
get settingsPrintApiCancelBtn(){return settingsPrintApiCancelBtn;},
get settingsPrintApiFooterView(){return settingsPrintApiFooterView;},
get settingsPrintApiFooterEdit(){return settingsPrintApiFooterEdit;},
get settingsPrintApiSaveSettingsBtn(){return settingsPrintApiSaveSettingsBtn;},
get printApiTabs(){return printApiTabs;},
get printApiRefreshTimer(){return printApiRefreshTimer;},
set printApiRefreshTimer(value){printApiRefreshTimer=value;},
get printApiConnectionCheckInFlight(){return printApiConnectionCheckInFlight;},
set printApiConnectionCheckInFlight(value){printApiConnectionCheckInFlight=value;},
get printApiAutoRefreshDelayMs(){return printApiAutoRefreshDelayMs;},
set printApiAutoRefreshDelayMs(value){printApiAutoRefreshDelayMs=value;},
get PRINT_API_AUTO_REFRESH_MIN_MS(){return PRINT_API_AUTO_REFRESH_MIN_MS;},
get PRINT_API_AUTO_REFRESH_MAX_MS(){return PRINT_API_AUTO_REFRESH_MAX_MS;},
get printApiDraftMode(){return printApiDraftMode;},
set printApiDraftMode(value){printApiDraftMode=value;},
get printApiListLoaded(){return printApiListLoaded;},
set printApiListLoaded(value){printApiListLoaded=value;},
get printApiListItems(){return printApiListItems;},
set printApiListItems(value){printApiListItems=value;},
get printApiDeviceSnapshot(){return printApiDeviceSnapshot;},
set printApiDeviceSnapshot(value){printApiDeviceSnapshot=value;},
get printApiExpandedDevices(){return printApiExpandedDevices;},
get printApiAudioStates(){return printApiAudioStates;},
get printApiAudioNames(){return printApiAudioNames;},
get printApiControlState(){return printApiControlState;},
set printApiControlState(value){printApiControlState=value;},
get printApiActiveStoreId(){return printApiActiveStoreId;},
set printApiActiveStoreId(value){printApiActiveStoreId=value;},
get printApiSelectedConnectionId(){return printApiSelectedConnectionId;},
set printApiSelectedConnectionId(value){printApiSelectedConnectionId=value;},
get printApiSettingsDirty(){return printApiSettingsDirty;},
set printApiSettingsDirty(value){printApiSettingsDirty=value;},
get printApiDirtyStoreId(){return printApiDirtyStoreId;},
set printApiDirtyStoreId(value){printApiDirtyStoreId=value;},
get printApiOriginal(){return printApiOriginal;},
set printApiOriginal(value){printApiOriginal=value;},
get isPrintApiTabId(){return isPrintApiTabId;},
get populatePrintApiStores(){return populatePrintApiStores;},
get resetPrintApiFormForCreate(){return resetPrintApiFormForCreate;},
get setPrintApiDeviceState(){return setPrintApiDeviceState;},
get renderPrintTemplatePreview(){return renderPrintTemplatePreview;},
get renderPrintApiCards(){return renderPrintApiCards;},
get getPrintApiTabKey(){return getPrintApiTabKey;},
get getPrintApiNewTabKey(){return getPrintApiNewTabKey;},
get getPrintApiTabState(){return getPrintApiTabState;},
get setPrintApiTabState(){return setPrintApiTabState;},
get clearPrintApiTabState(){return clearPrintApiTabState;},
get syncPrintApiTabsHeader(){return syncPrintApiTabsHeader;},
get removePrintApiDevice(){return removePrintApiDevice;},
get syncPrintApiTokenIcons(){return syncPrintApiTokenIcons;},
get applyPrintApiControlState(){return applyPrintApiControlState;},
get setPrintApiPause(){return setPrintApiPause;},
get collectPrintApiFormSnapshot(){return collectPrintApiFormSnapshot;},
get applyPrintApiSnapshot(){return applyPrintApiSnapshot;},
get persistActivePrintApiTabState(){return persistActivePrintApiTabState;},
get renderActivePrintApiTab(){return renderActivePrintApiTab;},
get printRealtimeSocket(){return printRealtimeSocket;},
set printRealtimeSocket(value){printRealtimeSocket=value;},
get printRealtimeReconnect(){return printRealtimeReconnect;},
set printRealtimeReconnect(value){printRealtimeReconnect=value;},
get printRealtimeTimer(){return printRealtimeTimer;},
set printRealtimeTimer(value){printRealtimeTimer=value;},
get printRealtimeRefreshing(){return printRealtimeRefreshing;},
set printRealtimeRefreshing(value){printRealtimeRefreshing=value;},
get printRealtimeConnected(){return printRealtimeConnected;},
set printRealtimeConnected(value){printRealtimeConnected=value;},
get printRealtimeChanges(){return printRealtimeChanges;},
get schedulePrintRealtimeRefresh(){return schedulePrintRealtimeRefresh;},
get startPrintRealtime(){return startPrintRealtime;},
get loadPrintApiCards(){return loadPrintApiCards;},
get printQueueView(){return printQueueView;},
set printQueueView(value){printQueueView=value;},
get printQueuePdfUrl(){return printQueuePdfUrl;},
set printQueuePdfUrl(value){printQueuePdfUrl=value;},
get releasePrintQueuePdf(){return releasePrintQueuePdf;},
get printQueueVersion(){return printQueueVersion;},
set printQueueVersion(value){printQueueVersion=value;},
get printQueueBefore(){return printQueueBefore;},
set printQueueBefore(value){printQueueBefore=value;},
get printQueueFilters(){return printQueueFilters;},
set printQueueFilters(value){printQueueFilters=value;},
get printQueueSelected(){return printQueueSelected;},
get printQueueVisibleJobs(){return printQueueVisibleJobs;},
set printQueueVisibleJobs(value){printQueueVisibleJobs=value;},
get printQueueBusy(){return printQueueBusy;},
set printQueueBusy(value){printQueueBusy=value;},
get printQueuePendingAction(){return printQueuePendingAction;},
set printQueuePendingAction(value){printQueuePendingAction=value;},
get printQueueChecks(){return printQueueChecks;},
get printQueueBody(){return printQueueBody;},
get printQueueSettings(){return printQueueSettings;},
get printQueueNav(){return printQueueNav;},
get queueLabels(){return queueLabels;},
get printQueueScope(){return printQueueScope;},
get printQueueScopeKey(){return printQueueScopeKey;},
get queueButton(){return queueButton;},
get printQueueRequest(){return printQueueRequest;},
get applyPrintApiSection(){return applyPrintApiSection;},
get showPrintQueueView(){return showPrintQueueView;},
get printQueueCheckbox(){return printQueueCheckbox;},
get syncPrintQueueSelection(){return syncPrintQueueSelection;},
get printQueueRow(){return printQueueRow;},
get printQueueExpanded(){return printQueueExpanded;},
get printQueueAccordion(){return printQueueAccordion;},
get loadPrintQueueJobContent(){return loadPrintQueueJobContent;},
get previewPrintQueueJobs(){return previewPrintQueueJobs;},
get printQueueFilterValues(){return printQueueFilterValues;},
get renderPrintQueueToolbar(){return renderPrintQueueToolbar;},
get printQueueServerConfirmed(){return printQueueServerConfirmed;},
set printQueueServerConfirmed(value){printQueueServerConfirmed=value;},
get printQueueCacheScope(){return printQueueCacheScope;},
get setPrintQueueLoadStatus(){return setPrintQueueLoadStatus;},
get renderPrintQueueData(){return renderPrintQueueData;},
get loadPrintQueue(){return loadPrintQueue;},
get mutatePrintQueue(){return mutatePrintQueue;},
get retryPrintQueueJob(){return retryPrintQueueJob;},
get openPrintQueueJob(){return openPrintQueueJob;},
get openPrintApiForStore(){return openPrintApiForStore;},
get startCreatePrintApi(){return startCreatePrintApi;},
get resetPrintApiDeviceState(){return resetPrintApiDeviceState;},
get applyPrintApiDeviceState(){return applyPrintApiDeviceState;},
get stopPrintApiAutoRefresh(){return stopPrintApiAutoRefresh;},
get schedulePrintApiAutoRefresh(){return schedulePrintApiAutoRefresh;},
get applyPrintApiNotificationSettings(){return applyPrintApiNotificationSettings;},
get refreshPrintApiSoundUiFromInputs(){return refreshPrintApiSoundUiFromInputs;},
get markPrintApiSettingsDirty(){return markPrintApiSettingsDirty;},
get clearPrintApiSettingsDirty(){return clearPrintApiSettingsDirty;},
get updatePrintApiOriginalFromCurrentForm(){return updatePrintApiOriginalFromCurrentForm;},
get applyPrintApiOriginalState(){return applyPrintApiOriginalState;},
get syncPrintApiSelects(){return syncPrintApiSelects;},
get setPrintApiDraftMode(){return setPrintApiDraftMode;},
get cancelPrintApiDraft(){return cancelPrintApiDraft;},
get uploadPrintApiSound(){return uploadPrintApiSound;},
get savePrintApiNotificationSettings(){return savePrintApiNotificationSettings;},
get printApiAudioTime(){return printApiAudioTime;},
get destroyPrintApiAudio(){return destroyPrintApiAudio;},
get paintPrintApiAudio(){return paintPrintApiAudio;},
get syncPrintApiAudioSlot(){return syncPrintApiAudioSlot;},
get playSoundPreview(){return playSoundPreview;},
get fetchPrintApiInfo(){return fetchPrintApiInfo;},
get loadPrintApiToken(){return loadPrintApiToken;},
get generatePrintApiToken(){return generatePrintApiToken;},
get checkPrintApiConnection(){return checkPrintApiConnection;},
get ensurePrintApiReady(){return ensurePrintApiReady;},
get testPrintApiPrinter(){return testPrintApiPrinter;}};
}
window.SharedPrintApiPanel={create,selectors};
})(window);
