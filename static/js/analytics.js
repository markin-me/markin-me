(function () {
  const addDocumentButton = document.getElementById('analyticsAddDocumentBtn');
  let activeStream = null;
  let scanFrame = 0;

  function clearDocumentPickerVariant() {
    const modal = document.getElementById('appModal');
    if (modal) modal.classList.remove('analytics-document-picker', 'analytics-receipt-scanner-modal');
  }

  function stopCamera() {
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }

  function openDocumentMenu() {
    if (!window.AppModal) return;
    window.AppModal.open({
      title: 'Добавить документ',
      content: '<div class="analytics-document-options">' +
        '<button class="analytics-document-option" type="button" data-analytics-modal-action="receipt">' +
          '<i class="fas fa-qrcode"></i><span><strong>Сканировать чек</strong><small>Открыть камеру для QR-кода</small></span>' +
        '</button>' +
        '<button class="analytics-document-option" type="button" data-analytics-modal-action="invoice">' +
          '<i class="fas fa-file-invoice"></i><span><strong>Добавить накладную</strong><small>Сфотографировать или выбрать файл</small></span>' +
        '</button>' +
        '<button class="analytics-document-option" type="button" data-analytics-modal-action="manual">' +
          '<i class="fas fa-pen-to-square"></i><span><strong>Ввести вручную</strong><small>Добавить расход без сканирования</small></span>' +
        '</button>' +
      '</div>',
      showSave: false,
      cancelText: 'Закрыть',
      onClose: clearDocumentPickerVariant
    });
    const modal = document.getElementById('appModal');
    if (modal) modal.classList.add('analytics-document-picker');
  }

  function getEnglishQrCharacter(event) {
    if (/^Key[A-Z]$/.test(event.code)) {
      const letter = event.code.slice(3).toLowerCase();
      return event.shiftKey ? letter.toUpperCase() : letter;
    }
    if (/^Digit[0-9]$/.test(event.code)) {
      const digit = event.code.slice(5);
      const shifted = { '0': ')', '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(' };
      return event.shiftKey ? shifted[digit] : digit;
    }
    const punctuation = {
      Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
      Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Backquote: ['`', '~'],
      Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], Space: [' ', ' ']
    };
    const value = punctuation[event.code];
    return value ? value[event.shiftKey ? 1 : 0] : '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function getReceiptData(receipt) {
    const raw = receipt?.data?.json;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) {}
    }
    return null;
  }

  function getReceiptErrorMessage(error, diagnostics = null) {
    const messages = {
      PROVERKACHECKA_TOKEN_NOT_CONFIGURED: 'Не задан токен Проверки чека на сервере.',
      PROVERKACHECKA_TIMEOUT: 'Сервис проверки чека не ответил вовремя. Повторите попытку.',
      PROVERKACHECKA_UNAVAILABLE: 'Сервис проверки чека временно недоступен.',
      PROVERKACHECKA_REQUEST_FAILED: 'Не удалось обратиться к сервису проверки чека.',
      INVALID_QR_RAW: 'Не удалось прочитать QR-код чека.'
    };
    if (error === 'INVALID_QR_RAW' && diagnostics) {
      return 'Не удалось прочитать QR-код чека. Получено символов: ' + diagnostics.length
        + '; фискальная строка: ' + (diagnostics.hasFiscalPattern ? 'найдена' : 'не найдена') + '.';
    }
    return messages[error] || 'Не удалось получить данные чека.';
  }

  function formatKopecks(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? (amount / 100).toFixed(2) + ' ₽' : '—';
  }

  function operationTypeLabel(value) {
    return ({ 1: 'Приход', 2: 'Возврат прихода', 3: 'Расход', 4: 'Возврат расхода' })[Number(value)] || '—';
  }

  function taxationTypeLabel(value) {
    return ({ 1: 'ОСН', 2: 'УСН', 4: 'УСН доходы − расходы', 8: 'ЕНВД', 16: 'ЕСХН', 32: 'ПСН' })[Number(value)] || '—';
  }

  async function acceptReceipt(receipt, qrraw) {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    const response = await fetch('/api/admin/analytics/expense-documents/receipts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify({ receipt, qrraw })
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 409) throw new Error('Этот чек уже принят.');
    if (!response.ok || !payload?.ok) throw new Error('Не удалось сохранить чек.');
    await loadExpenseDocuments();
    document.dispatchEvent(new Event('expense-documents-changed'));
  }

  async function acceptReceiptFromModal(receipt, qrraw) {
    try {
      await acceptReceipt(receipt, qrraw);
      return { saved: true, message: '' };
    } catch (error) {
      if (typeof window.AppModal?.setFooterNotice === 'function') window.AppModal.setFooterNotice(error instanceof Error ? error.message : 'Не удалось сохранить чек.');
      return { saved: false, message: error instanceof Error ? error.message : 'Не удалось сохранить чек.' };
    }
  }

  async function loadExpenseDocuments() {
    try {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
      const response = await fetch('/api/admin/analytics/expense-documents', {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return;
      const documents = Array.isArray(payload.documents) ? payload.documents : [];
      const summary = payload.summary || {};
      const total = document.getElementById('analyticsExpensesTotal');
      const count = document.getElementById('analyticsDocumentsCount');
      const empty = document.getElementById('analyticsEmptyState');
      const list = document.getElementById('analyticsDocumentsList');
      if (total) total.textContent = formatKopecks(summary.total_sum_kopecks);
      if (count) count.textContent = String(summary.count || 0);
      if (empty) empty.classList.toggle('hidden', documents.length > 0);
      if (!list) return;
      list.classList.toggle('hidden', documents.length === 0);
      list.innerHTML = documents.map((document) => '<div class="analytics-document-row"><div><strong>' + escapeHtml(document.supplier_name || 'Фискальный чек') + '</strong><small>' + escapeHtml(document.receipt_datetime || document.accepted_at || '') + '</small></div><strong>' + formatKopecks(document.total_sum_kopecks) + '</strong></div>').join('');
    } catch (_) {}
  }

  function showReceipt(receipt, qrraw) {
    clearDocumentPickerVariant();
    const data = getReceiptData(receipt);
    if (Number(receipt?.code) !== 1 || !data) {
      const message = Number(receipt?.code) === 2
        ? 'Данные чека ещё не получены. Повторите проверку позже.'
        : Number(receipt?.code) === 3
          ? 'Превышен лимит запросов к сервису проверки чеков.'
          : 'Сервис не подтвердил данные этого чека.';
      window.AppModal.open({ title: 'Проверка чека', content: '<p class="analytics-camera-status">' + message + '</p>', showSave: false, cancelText: 'Закрыть' });
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const receiptHtml = '<div class="cash-expense-receipt analytics-fiscal-receipt-modal"><article class="cash-fiscal-receipt"><header><strong>' + escapeHtml(data.user || '—') + '</strong><span>ИНН ' + escapeHtml(data.userInn || '—') + '</span><b>КАССОВЫЙ ЧЕК</b><span>' + escapeHtml(data.retailPlaceAddress || data.retailPlace || '—') + '</span><span>' + escapeHtml(data.dateTime || '—') + '</span></header><div class="cash-fiscal-receipt__meta"><span>Чек № ' + escapeHtml(data.requestNumber || '—') + ' · смена ' + escapeHtml(data.shiftNumber || '—') + '</span><span>Кассир: ' + escapeHtml(data.operator || '—') + '</span></div><div class="cash-fiscal-receipt__items">' + items.map((item) => '<div><strong>' + escapeHtml(item?.name || 'Без названия') + '</strong><span>' + escapeHtml(String(item?.quantity || '—')) + ' × ' + formatKopecks(item?.price) + '<b>' + formatKopecks(item?.sum) + '</b></span></div>').join('') + '</div><div class="cash-fiscal-receipt__total"><span>ИТОГ</span><strong>' + formatKopecks(data.totalSum) + '</strong></div><div class="cash-fiscal-receipt__meta"><span>Наличные: ' + formatKopecks(data.cashTotalSum) + '</span><span>Безналичные: ' + formatKopecks(data.ecashTotalSum) + '</span><span>' + escapeHtml(operationTypeLabel(data.operationType)) + ' · ' + escapeHtml(taxationTypeLabel(data.appliedTaxationType)) + '</span><span>ККТ: ' + escapeHtml(data.kktRegId || '—') + '</span><span>ФН ' + escapeHtml(data.fiscalDriveNumber || '—') + ' · ФД ' + escapeHtml(data.fiscalDocumentNumber || '—') + '</span><span>ФП ' + escapeHtml(data.fiscalSign || '—') + '</span></div></article><div class="cash-expense-receipt-qr" data-analytics-receipt-qr></div></div>';
    window.AppModal.open({
      title: 'Чек распознан',
      content: receiptHtml,
      saveText: 'Принять',
      secondarySaveText: 'Принять +',
      cancelText: 'Закрыть',
      enterAction: 'secondary',
      onSave: async () => (await acceptReceiptFromModal(receipt, qrraw)).saved,
      onSecondarySave: async () => {
        const result = await acceptReceiptFromModal(receipt, qrraw);
        setTimeout(() => openReceiptScanner(result.saved ? '' : result.message), 0);
        return true;
      }
    });
    const qrMount = window.AppModal.body?.querySelector('[data-analytics-receipt-qr]');
    if (qrMount && window.QRCode && qrraw) {
      new window.QRCode(qrMount, { text: String(qrraw), width: 132, height: 132, correctLevel: window.QRCode.CorrectLevel && window.QRCode.CorrectLevel.M });
    }
  }

  async function recognizeReceipt(qrraw, status) {
    status.textContent = 'Получаем данные фискального чека…';
    status.classList.remove('hidden');
    status.classList.remove('is-success');
    try {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
      const response = await fetch('/api/admin/analytics/receipts/recognize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ qrraw })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        status.textContent = response.status === 404
          ? 'Сервер не перезапущен и ещё не содержит маршрут распознавания.'
          : getReceiptErrorMessage(payload?.error, payload?.diagnostics);
        return;
      }
      showReceipt(payload.receipt, qrraw);
    } catch (error) {
      status.textContent = 'Не удалось отправить QR-код на проверку.';
    }
  }

  async function openReceiptScanner(initialStatus) {
    if (!window.AppModal) return;
    clearDocumentPickerVariant();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) {
      window.AppModal.open({
        title: 'Сканирование чека',
        headerNotice: initialStatus || '',
        content: '<div class="analytics-camera"><label class="analytics-qr-label" for="analyticsReceiptCode">Отсканируйте QR-код ручным сканером</label><input class="control" id="analyticsReceiptCode" type="text" autocomplete="off" placeholder="Код появится здесь" /><p class="analytics-camera-status hidden" id="analyticsReceiptStatus"></p></div>',
        showSave: false,
        cancelText: 'Закрыть',
        onClose: clearDocumentPickerVariant
      });
      document.getElementById('appModal')?.classList.add('analytics-receipt-scanner-modal');
      const input = document.getElementById('analyticsReceiptCode');
      const status = document.getElementById('analyticsReceiptStatus');
      if (!input || !status) return;
      input.focus();
      input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
          const value = input.value.trim();
          if (!value) return;
          event.preventDefault();
          await recognizeReceipt(value, status);
          return;
        }
        if (event.key === 'Backspace') {
          event.preventDefault();
          input.value = input.value.slice(0, -1);
          return;
        }
        const character = getEnglishQrCharacter(event);
        if (!character) return;
        event.preventDefault();
        input.value += character;
      });
      return;
    }
    window.AppModal.open({
      title: 'Сканирование чека',
      headerNotice: initialStatus || '',
      content: '<div class="analytics-camera"><video id="analyticsReceiptVideo" playsinline muted></video><p class="analytics-camera-status" id="analyticsReceiptStatus">Разместите QR-код чека в кадре.</p></div>',
      showSave: false,
      cancelText: 'Закрыть',
      onClose: () => {
        stopCamera();
        clearDocumentPickerVariant();
      }
    });
    document.getElementById('appModal')?.classList.add('analytics-receipt-scanner-modal');

    const video = document.getElementById('analyticsReceiptVideo');
    const status = document.getElementById('analyticsReceiptStatus');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'Камера недоступна в этом браузере.';
      return;
    }
    const hasBarcodeDetector = 'BarcodeDetector' in window;
    if (!hasBarcodeDetector && typeof window.jsQR !== 'function') {
      status.textContent = 'Сканирование QR не поддерживается этим браузером. Откройте админку в актуальном Chrome или Safari.';
      return;
    }
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = activeStream;
      await video.play();
      const detector = hasBarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
      const fallbackCanvas = detector ? null : document.createElement('canvas');
      const fallbackContext = fallbackCanvas ? fallbackCanvas.getContext('2d', { willReadFrequently: true }) : null;
      const detect = async () => {
        if (!activeStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scanFrame = requestAnimationFrame(detect);
          return;
        }
        try {
          let qrraw = '';
          if (detector) {
            const codes = await detector.detect(video);
            qrraw = codes.length && codes[0].rawValue ? codes[0].rawValue : '';
          } else if (fallbackCanvas && fallbackContext && video.videoWidth && video.videoHeight) {
            fallbackCanvas.width = video.videoWidth;
            fallbackCanvas.height = video.videoHeight;
            fallbackContext.drawImage(video, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
            const image = fallbackContext.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height);
            const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
            qrraw = code?.data || '';
          }
          if (qrraw) {
            stopCamera();
            await recognizeReceipt(qrraw, status);
            return;
          }
        } catch (error) {
          console.error('Ошибка сканирования QR-кода:', error);
        }
        scanFrame = requestAnimationFrame(detect);
      };
      detect();
    } catch (error) {
      status.textContent = 'Не удалось открыть камеру. Разрешите доступ к ней в настройках браузера.';
    }
  }

  function openInvoicePicker() {
    clearDocumentPickerVariant();
    const input = document.createElement('input');
    input.type = 'file';
    if (window.matchMedia('(max-width: 768px)').matches) {
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
    } else {
      input.accept = 'image/*,application/pdf';
    }
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file || !window.AppModal) return;
      window.AppModal.open({
        title: 'Накладная выбрана',
        content: '<p class="analytics-camera-status">' + file.name.replace(/[&<>"']/g, '') + '</p><p class="analytics-camera-status">Распознавание и сохранение документа будут добавлены следующим этапом.</p>',
        showSave: false,
        cancelText: 'Закрыть'
      });
    }, { once: true });
    input.click();
  }

  async function saveManualExpenseDocument(payload) {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    const response = await fetch('/api/admin/analytics/expense-documents/manual', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      const messages = {
        MANUAL_EXPENSE_SUPPLIER_REQUIRED: 'Укажите поставщика.',
        MANUAL_EXPENSE_ITEMS_REQUIRED: 'Добавьте хотя бы одну позицию.',
        INVALID_MANUAL_EXPENSE_ITEM: 'Заполните наименование, количество и цену каждой позиции.',
        INVALID_SUPPLIER_INN: 'ИНН должен состоять из 10 или 12 цифр.'
      };
      throw new Error(messages[result?.error] || 'Не удалось сохранить документ.');
    }
    await loadExpenseDocuments();
    document.dispatchEvent(new Event('expense-documents-changed'));
  }

  function manualExpenseItemRow() {
    return '<div class="analytics-manual-expense-item" data-manual-expense-row>' +
      '<input class="control" data-manual-expense-item="name" placeholder="Наименование">' +
      '<input class="control" data-manual-expense-item="quantity" inputmode="decimal" value="1" placeholder="Кол-во">' +
      '<input class="control" data-manual-expense-item="price" inputmode="decimal" placeholder="Цена, ₽">' +
      '<button class="btn btn-icon analytics-manual-expense-remove" type="button" data-manual-expense-remove aria-label="Удалить позицию"><i class="fas fa-trash"></i></button>' +
    '</div>';
  }

  function manualExpenseNumber(value) {
    const raw = String(value || '').trim().replace(/\s/g, '').replace(',', '.');
    return /^\d+(?:\.\d{1,3})?$/.test(raw) ? Number(raw) : 0;
  }

  function updateManualExpenseTotal(body) {
    const totalKopecks = Array.from(body.querySelectorAll('[data-manual-expense-row]')).reduce((total, row) => {
      const quantity = manualExpenseNumber(row.querySelector('[data-manual-expense-item="quantity"]')?.value);
      const price = manualExpenseNumber(row.querySelector('[data-manual-expense-item="price"]')?.value);
      return total + Math.round(quantity * price * 100);
    }, 0);
    const total = body.querySelector('[data-manual-expense-total]');
    if (total) total.value = (totalKopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  }

  function openManualExpenseDocument() {
    if (!window.AppModal) return;
    clearDocumentPickerVariant();
    window.AppModal.open({
      title: 'Ручной документ расхода',
      content: '<div class="analytics-manual-expense-form">' +
        '<label class="analytics-manual-expense-field analytics-manual-expense-field--required"><span>Поставщик</span><input class="control" data-manual-expense="supplier" placeholder="Название организации или ИП"></label>' +
        '<label class="analytics-manual-expense-field"><span>ИНН</span><input class="control" data-manual-expense="inn" inputmode="numeric" maxlength="12" placeholder="10 или 12 цифр"></label>' +
        '<div class="analytics-manual-expense-grid"><label class="analytics-manual-expense-field"><span>Дата документа</span><input class="control" data-manual-expense="date" type="date"></label>' +
        '<label class="analytics-manual-expense-field"><span>Номер документа</span><input class="control" data-manual-expense="documentNumber" placeholder="Необязательно"></label></div>' +
        '<label class="analytics-manual-expense-field"><span>Тип документа</span><input class="control" data-manual-expense="documentType" placeholder="Чек, накладная и т. п."></label>' +
        '<section class="analytics-manual-expense-items"><div class="analytics-manual-expense-items-head"><span>Позиции *</span><button class="btn btn-small" type="button" data-manual-expense-add><i class="fas fa-plus"></i> Добавить</button></div><div class="analytics-manual-expense-item-labels"><span>Наименование</span><span>Кол-во</span><span>Цена, ₽</span></div><div data-manual-expense-items>' + manualExpenseItemRow() + '</div></section>' +
        '<label class="analytics-manual-expense-field"><span>Итоговая сумма, ₽</span><input class="control" data-manual-expense-total readonly value="0,00 ₽"></label>' +
      '</div>',
      saveText: 'Сохранить',
      cancelText: 'Отмена',
      onSave: async ({ body }) => {
        const value = (field) => String(body.querySelector('[data-manual-expense="' + field + '"]')?.value || '').trim();
        const items = Array.from(body.querySelectorAll('[data-manual-expense-row]')).map((row) => ({
          name: String(row.querySelector('[data-manual-expense-item="name"]')?.value || '').trim(),
          quantity: String(row.querySelector('[data-manual-expense-item="quantity"]')?.value || '').trim(),
          price: String(row.querySelector('[data-manual-expense-item="price"]')?.value || '').trim()
        }));
        if (!value('supplier')) {
          window.AppModal.setFooterNotice('Укажите поставщика.');
          return false;
        }
        if (!items.length) {
          window.AppModal.setFooterNotice('Добавьте хотя бы одну позицию.');
          return false;
        }
        try {
          await saveManualExpenseDocument({
            supplier: value('supplier'),
            inn: value('inn'),
            date: value('date'),
            documentNumber: value('documentNumber'),
            documentType: value('documentType'),
            items
          });
          return true;
        } catch (error) {
          window.AppModal.setFooterNotice(error instanceof Error ? error.message : 'Не удалось сохранить документ.');
          return false;
        }
      }
    });
    const body = window.AppModal.body;
    const itemsMount = body?.querySelector('[data-manual-expense-items]');
    body?.addEventListener('input', () => updateManualExpenseTotal(body));
    body?.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-manual-expense-add]');
      if (addButton && itemsMount) {
        itemsMount.insertAdjacentHTML('beforeend', manualExpenseItemRow());
        updateManualExpenseTotal(body);
        return;
      }
      const removeButton = event.target.closest('[data-manual-expense-remove]');
      if (removeButton) {
        removeButton.closest('[data-manual-expense-row]')?.remove();
        updateManualExpenseTotal(body);
      }
    });
    updateManualExpenseTotal(body);
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-analytics-action], [data-analytics-modal-action]');
    if (!action) return;
    const type = action.dataset.analyticsAction || action.dataset.analyticsModalAction;
    if (type === 'add-document') openDocumentMenu();
    if (type === 'receipt') openReceiptScanner();
    if (type === 'invoice') openInvoicePicker();
    if (type === 'manual') openManualExpenseDocument();
  });
  if (addDocumentButton) addDocumentButton.addEventListener('click', openDocumentMenu);
  loadExpenseDocuments();
})();
