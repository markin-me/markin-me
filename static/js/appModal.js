(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const backdrop = $("#appModalBackdrop");
  const modal = $("#appModal");
  const titleEl = $("#appModalTitle");
  const bodyEl = $("#appModalBody");
  const btnClose = $("#appModalCloseBtn");
  const btnCancel = $("#appModalCancelBtn");
  const btnSave = $("#appModalSaveBtn");

  if (!backdrop || !modal || !titleEl || !bodyEl || !btnClose || !btnCancel || !btnSave) {
    return;
  }

  let currentOnSave = null;
  let currentOnClose = null;

  let lastActiveEl = null;

  let currentOptions = {
    closeOnBackdrop: true,
    closeOnEsc: true,
    saveOnCtrlEnter: true,
  };

  const defaultBtnText = {
    cancel: btnCancel.textContent || "Отменить",
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

    // show/hide
    if (o.showCancel === false) btnCancel.classList.add("hidden");
    else btnCancel.classList.remove("hidden");

    if (o.showSave === false) btnSave.classList.add("hidden");
    else btnSave.classList.remove("hidden");
  }

  function setBusy(isBusy) {
    const busy = Boolean(isBusy);
    modal.classList.toggle("is-busy", busy);
    btnClose.disabled = busy;
    btnCancel.disabled = busy;
    btnSave.disabled = busy;
  }

  function open(opts) {
    const options = opts || {};

    // запомним, откуда открыли
    lastActiveEl = document.activeElement;

    setTitle(options.title || "");
    setContent(options.content || "");

    currentOnSave = typeof options.onSave === "function" ? options.onSave : null;
    currentOnClose = typeof options.onClose === "function" ? options.onClose : null;

    currentOptions = {
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEsc: options.closeOnEsc !== false,
      saveOnCtrlEnter: options.saveOnCtrlEnter !== false,
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

    setBusy(false);

    backdrop.classList.remove("is-active");
    modal.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("modal-open");

    // очистка
    setTimeout(() => {
      clearBody();
      setTitle("");
      setButtons({});
    }, 120);

    const cb = currentOnClose;
    currentOnSave = null;
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

  btnClose.addEventListener("click", () => close("close"));
  btnCancel.addEventListener("click", () => close("cancel"));

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
  });

  window.AppModal = {
    open,
    close,
    setTitle,
    setContent,
    setButtons,
    setBusy,
    isOpen,
    get body() {
      return bodyEl;
    },
  };
})();
