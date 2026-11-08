(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const backdrop = $("#appModalBackdrop");
  const modal = $("#appModal");
  const titleEl = $("#appModalTitle");
  const headerNotice = $("#appModalHeaderNotice");
  const bodyEl = $("#appModalBody");
  const btnClose = $("#appModalCloseBtn");
  const btnCancel = $("#appModalCancelBtn");
  const btnSecondarySave = $("#appModalSecondarySaveBtn");
  const btnSave = $("#appModalSaveBtn");
  const footerNotice = $("#appModalFooterNotice");

  if (!backdrop || !modal || !titleEl || !headerNotice || !bodyEl || !btnClose || !btnCancel || !btnSecondarySave || !btnSave || !footerNotice) {
    return;
  }

  let currentOnSave = null;
  let currentOnSecondarySave = null;
  let currentOnClose = null;
  let closeSeq = 0;
  let dismissConfirmation = null;

  let lastActiveEl = null;

  let currentOptions = {
    closeOnBackdrop: true,
    closeOnEsc: true,
    saveOnCtrlEnter: true,
    enterAction: "",
  };

  const defaultBtnText = {
    cancel: btnCancel.textContent || "Отменить",
    secondarySave: btnSecondarySave.textContent || "Принять +",
    save: btnSave.textContent || "Сохранить",
  };

  function isOpen() {
    return modal.classList.contains("is-open");
  }

  function setTitle(text) {
    titleEl.textContent = text || "";
  }

  function clearBody() {
    bodyEl.innerHTML = "";
  }

  function setFooterNotice(text) {
    footerNotice.textContent = text || "";
    footerNotice.classList.toggle("hidden", !text);
  }

  function setHeaderNotice(text) {
    headerNotice.textContent = text || "";
    headerNotice.classList.toggle("hidden", !text);
    modal.classList.toggle("has-header-notice", !!text);
  }

  function setContent(content) {
    clearBody();

    // 1) selector на <template>
    if (typeof content === "string" && content.trim().startsWith("#")) {
      const tpl = document.querySelector(content.trim());
      if (tpl && tpl.tagName === "TEMPLATE") {
        bodyEl.appendChild(tpl.content.cloneNode(true));
        return;
      }
    }

    // 2) HTML строка
    if (typeof content === "string") {
      bodyEl.innerHTML = content;
      return;
    }

    // 3) Node / DocumentFragment
    if (content && typeof content === "object" && "nodeType" in content) {
      bodyEl.appendChild(content);
      return;
    }

    bodyEl.textContent = "";
  }

  function focusFirstControl() {
    const el = bodyEl.querySelector(
      "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])"
    );
    if (el) el.focus();
  }

  function setButtons(opts) {
    const o = opts || {};

    if (typeof o.cancelText === "string") btnCancel.textContent = o.cancelText;
    else btnCancel.textContent = defaultBtnText.cancel;

    if (typeof o.saveText === "string") btnSave.textContent = o.saveText;
    else btnSave.textContent = defaultBtnText.save;

    if (typeof o.secondarySaveText === "string") btnSecondarySave.textContent = o.secondarySaveText;
    else btnSecondarySave.textContent = defaultBtnText.secondarySave;

    // show/hide
    if (o.showCancel === false) btnCancel.classList.add("hidden");
    else btnCancel.classList.remove("hidden");

    if (o.showSave === false) btnSave.classList.add("hidden");
    else btnSave.classList.remove("hidden");

    if (typeof o.onSecondarySave === "function") btnSecondarySave.classList.remove("hidden");
    else btnSecondarySave.classList.add("hidden");
  }

  function setBusy(isBusy) {
    const busy = Boolean(isBusy);
    modal.classList.toggle("is-busy", busy);
    btnClose.disabled = busy;
    btnCancel.disabled = busy;
    btnSecondarySave.disabled = busy;
    btnSave.disabled = busy;
  }

  function open(opts) {
    const options = opts || {};

    // запомним, откуда открыли
    lastActiveEl = document.activeElement;

    setTitle(options.title || "");
    setContent(options.content || "");
    setHeaderNotice(options.headerNotice || "");
    setFooterNotice("");
    modal.classList.toggle("app-modal-footer-hidden", options.hideFooter === true);

    currentOnSave = typeof options.onSave === "function" ? options.onSave : null;
    currentOnSecondarySave = typeof options.onSecondarySave === "function" ? options.onSecondarySave : null;
    currentOnClose = typeof options.onClose === "function" ? options.onClose : null;

    currentOptions = {
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEsc: options.closeOnEsc !== false,
      saveOnCtrlEnter: options.saveOnCtrlEnter !== false,
      enterAction: options.enterAction === "secondary" ? "secondary" : "",
    };

    setButtons(options);
    setBusy(false);

    backdrop.classList.add("is-active");
    modal.classList.add("is-open");
    backdrop.setAttribute("aria-hidden", "false");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");
    setTimeout(focusFirstControl, 0);
  }

  function close(reason) {
    if(dismissConfirmation){dismissConfirmation(false);return;}
    if (!isOpen()) return;

    const closeToken = ++closeSeq;
    setBusy(false);

    backdrop.classList.remove("is-active");
    modal.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("modal-open");

    // очистка
    setTimeout(() => {
      if (isOpen()) return;
      if (closeSeq !== closeToken) return;
      clearBody();
      setTitle("");
      setButtons({});
    }, 120);

    const cb = currentOnClose;
    currentOnSave = null;
    currentOnSecondarySave = null;
    setHeaderNotice("");
    setFooterNotice("");
    modal.classList.remove("app-modal-footer-hidden");
    currentOnClose = null;

    // вернуть фокус туда, откуда открыли
    try {
      if (lastActiveEl && typeof lastActiveEl.focus === "function") lastActiveEl.focus();
    } catch (_) {}
    lastActiveEl = null;

    if (cb) {
      try {
        cb({ reason: reason || "close" });
      } catch (e) {
        console.error(e);
      }
    }
  }

  async function handleSave() {
    if (!currentOnSave) {
      close("save");
      return;
    }

    try {
      setBusy(true);
      const res = currentOnSave({ modal, body: bodyEl, setBusy });
      const ok = res && typeof res.then === "function" ? await res : res;
      if (ok === false) {
        setBusy(false);
        return;
      }
      close("save");
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  }

  async function handleSecondarySave() {
    if (!currentOnSecondarySave) return;
    try {
      setBusy(true);
      const res = currentOnSecondarySave({ modal, body: bodyEl, setBusy });
      const ok = res && typeof res.then === "function" ? await res : res;
      if (ok === false) {
        setBusy(false);
        return;
      }
      close("secondary-save");
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  }

  btnClose.addEventListener("click", () => close("close"));
  btnCancel.addEventListener("click", () => close("cancel"));
  btnSecondarySave.addEventListener("click", handleSecondarySave);

  backdrop.addEventListener("click", () => {
    if (!currentOptions.closeOnBackdrop) return;
    close("backdrop");
  });

  btnSave.addEventListener("click", handleSave);

  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;

    if (e.key === "Escape") {
      if (!currentOptions.closeOnEsc) return;
      e.preventDefault();
      close("esc");
    }

    if (currentOptions.saveOnCtrlEnter && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }

    if (currentOptions.enterAction === "secondary" && !e.ctrlKey && !e.metaKey && e.key === "Enter") {
      e.preventDefault();
      handleSecondarySave();
    }
  });

  let pendingConfirmation = null;
  function confirm(options = {}) {
    if (pendingConfirmation) return pendingConfirmation;
    const profileSettings=Array.from(document.querySelectorAll('.shop-profile-settings-redesign')).find(element=>element.getClientRects().length);
    const activeEl=document.activeElement;
    const profileHost=profileSettings?.closest('#shopProfileSettingsPage')||profileSettings||modal;
    const underlying=(profileSettings
      ?(isOpen()&&modal.contains(profileSettings)?Array.from(modal.children):[profileHost])
      :Array.from(document.body.children)).map(element=>({element,inert:element.inert}));
    const overlay=document.createElement('div');overlay.className='app-modal-confirmation';
    const panel=document.createElement('section');panel.className='app-modal-confirmation-panel';
    panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','appModalConfirmationTitle');
    panel.setAttribute('aria-describedby','appModalConfirmationMessage');
    const heading=document.createElement('h2');heading.id='appModalConfirmationTitle';heading.textContent=options.title||'Подтверждение';
    const message=document.createElement('p');message.id='appModalConfirmationMessage';message.textContent=options.message||'';
    const actions=document.createElement('div');actions.className='app-modal-confirmation-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent=options.cancelText||'Отмена';
    const accept=document.createElement('button');accept.type='button';accept.textContent=options.saveText||'Подтвердить';
    if(options.showCancel!==false)actions.append(cancel);
    actions.append(accept);panel.append(heading,message,actions);overlay.append(panel);
    const choices=Array.isArray(options.choices)?options.choices:[];
    let choiceBusy=false;
    const choiceButtons=choices.map(choice=>{
      const button=document.createElement('button');button.type='button';button.textContent=choice.label;button.disabled=Boolean(choice.disabled);
      if(choice.icon){const icon=document.createElement('img');icon.src=choice.icon;icon.alt='';button.prepend(icon);}
      button.onclick=async()=>{
        if(choiceBusy)return;
        if(typeof options.onChoice!=='function'){dismissConfirmation(choice.value);return;}
        const previousRect=button.getBoundingClientRect();
        const providers=button.parentElement;
        if(options.keepChoiceOpen){
          choiceButtons.forEach(item=>{item.hidden=item!==button;});
          providers.classList.add('has-selected-provider');
          if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
            const nextRect=button.getBoundingClientRect();
            button.animate([{transform:`translateX(${previousRect.left-nextRect.left}px)`},{transform:'translateX(0)'}],{duration:250,easing:'cubic-bezier(.2,.8,.2,1)'});
          }
        }
        choiceBusy=true;
        choiceButtons.forEach(item=>{item.disabled=true;});cancel.disabled=true;
        const originalContent=Array.from(button.childNodes);
        button.classList.add('is-opening');button.setAttribute('aria-busy','true');
        button.textContent=`Открываем ${choice.label}…`;
        let providerReady=false;
        try{
          const result=await options.onChoice(choice.value);
          providerReady=Boolean(result?.ready);
          if(options.keepChoiceOpen){
            button.replaceChildren(...originalContent);
            if(result?.ready){
              const icon=button.querySelector('img');
              button.textContent=`Открыть ${choice.label}`;
              if(icon)button.prepend(icon);
            }
            if(result?.message)message.textContent=result.message;
          }
        }finally{
          choiceBusy=false;
          if(options.keepChoiceOpen){
            if(!providerReady){
              providers.classList.remove('has-selected-provider');
              choiceButtons.forEach(item=>{item.hidden=false;});
            }
            button.classList.remove('is-opening');button.removeAttribute('aria-busy');
            if(!button.querySelector('img'))button.replaceChildren(...originalContent);
            choiceButtons.forEach((item,index)=>{item.disabled=Boolean(choices[index].disabled);});cancel.disabled=false;
          }else dismissConfirmation(choice.value);
        }
      };return button;
    });
    if(choiceButtons.length){
      const providers=document.createElement('div');providers.className='app-modal-confirmation-choices';providers.append(...choiceButtons);
      panel.insertBefore(providers,actions);accept.remove();
    }
    underlying.forEach(({element})=>{element.inert=true;});
    overlay.style.zIndex=String(Math.max(Number(getComputedStyle(modal).zIndex)||0,Number(getComputedStyle(backdrop).zIndex)||0,Number(getComputedStyle(profileHost).zIndex)||0)+1);
    document.body.append(overlay);
    const onKey=event=>{
      if(choiceBusy){if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();}return;}
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dismissConfirmation(false);}
      else if(event.key==='Tab'){
        event.preventDefault();event.stopImmediatePropagation();
        const buttons=Array.from(panel.querySelectorAll('button:not(:disabled):not([hidden])'));
        const index=buttons.indexOf(document.activeElement);
        buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
      }else if(!choiceButtons.length&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();dismissConfirmation(true);}
    };
    pendingConfirmation=new Promise(resolve=>{
      dismissConfirmation=accepted=>{
        if(choiceBusy)return;
        document.removeEventListener('keydown',onKey,true);
        overlay.remove();
        underlying.forEach(({element,inert})=>{element.inert=inert;});
        dismissConfirmation=null;pendingConfirmation=null;
        activeEl?.focus?.({preventScroll:true});
        resolve(accepted);
      };
      cancel.onclick=event=>{event.stopPropagation();dismissConfirmation(false);};
      accept.onclick=event=>{event.stopPropagation();dismissConfirmation(true);};
      overlay.onclick=event=>{event.stopPropagation();if(event.target===overlay)dismissConfirmation(false);};
    });
    document.addEventListener('keydown',onKey,true);
    (choiceButtons.find(button=>!button.disabled)||(options.showCancel===false?accept:cancel)).focus();
    return pendingConfirmation;
  }

  let alertQueue = Promise.resolve();
  function showAlert(messageOrOptions) {
    const options = messageOrOptions && typeof messageOrOptions === "object"
      ? messageOrOptions
      : { message: String(messageOrOptions == null ? "" : messageOrOptions) };
    const show = () => pendingConfirmation
      ? pendingConfirmation.then(show)
      : confirm({
        title: options.title || "Внимание",
        message: options.message || "",
        showCancel: false,
        saveText: options.saveText || "Понятно",
      });
    alertQueue = alertQueue.then(show, show);
    return alertQueue;
  }

  window.AppModal = {
    alert: showAlert,
    confirm,
    open,
    close,
    setTitle,
    setContent,
    setHeaderNotice,
    setFooterNotice,
    setButtons,
    setBusy,
    isOpen,
    get body() {
      return bodyEl;
    },
  };
  window.alert = (message) => { void showAlert(message); };
})();
