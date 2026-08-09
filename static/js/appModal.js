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

  window.AppModal = {
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
})();
