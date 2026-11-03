(function () {
  const trigger = document.getElementById('userMenuMessengerSecurity');
  if (!trigger) return;

  const labels = { max: 'MAX', tg: 'Telegram' };
  const icons = { max: 'fa-comment', tg: 'fa-paper-plane' };
  let pollTimer = null;

  function api(url, options) {
    return authFetch(url, options || {}).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const error = new Error(data.error || 'REQUEST_FAILED');
        error.code = data.error || 'REQUEST_FAILED';
        throw error;
      }
      return data;
    });
  }

  function errorText(code) {
    return ({
      CURRENT_PASSWORD_REQUIRED: 'Введите текущий пароль.',
      CURRENT_PASSWORD_INVALID: 'Текущий пароль указан неверно.',
      BOT_NOT_CONFIGURED: 'Бот магазина пока не настроен.',
      TENANT_BOT_UNAVAILABLE: 'Бот магазина отключён или не настроен.',
      BOT_TENANT_CONFLICT: 'Конфигурация бота магазина требует проверки владельцем.',
      ACCOUNT_PERSON_CONFLICT: 'Этот профиль мессенджера уже связан с другой учётной записью.',
      LINK_INVALID_OR_EXPIRED: 'Ссылка устарела. Создайте новую.',
      SESSION_REVOKED: 'Сессия завершена. Войдите снова.',
    })[code] || 'Не удалось выполнить действие. Попробуйте ещё раз.';
  }

  function setNotice(text, isError) {
    const notice = document.getElementById('messengerSecurityNotice');
    if (!notice) return;
    notice.textContent = text || '';
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function card(provider, channel, availability) {
    const wrapper = document.createElement('article');
    wrapper.className = 'messenger-security-card';
    wrapper.dataset.provider = provider;
    const copy = document.createElement('div');
    copy.className = 'messenger-security-copy';
    const title = document.createElement('h3');
    title.className = 'messenger-security-title';
    title.innerHTML = `<i class="fas ${icons[provider]}" aria-hidden="true"></i>`;
    title.append(document.createTextNode(labels[provider]));
    const state = document.createElement('p');
    state.className = 'messenger-security-state';
    state.textContent = channel ? `Привязан профиль ${channel.masked}` : 'Не привязан';
    if (availability?.available === true) state.textContent += '. Бот магазина настроен.';
    if (availability?.available === false) {
      state.textContent += availability.reason === 'BOT_TENANT_CONFLICT'
        ? '. Конфигурация бота требует проверки владельцем.'
        : '. Бот магазина отключён или не настроен.';
    }
    copy.append(title, state);

    const actions = document.createElement('div');
    actions.className = 'messenger-security-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = channel ? 'btn btn-danger' : 'btn btn-primary';
    button.textContent = channel ? 'Отвязать' : `Привязать ${labels[provider]}`;
    button.disabled = !channel && availability?.available === false;
    button.addEventListener('click', () => channel ? showUnlink(provider) : startLink(provider, button));
    actions.append(button);
    if (channel && provider === 'tg') {
      const reconnect = document.createElement('button');
      reconnect.type = 'button';
      reconnect.className = 'btn btn-primary';
      reconnect.textContent = 'Подключить бота магазина';
      reconnect.disabled = availability?.available === false;
      reconnect.addEventListener('click', () => startLink(provider, reconnect));
      actions.prepend(reconnect);
    }
    wrapper.append(copy, actions);
    return wrapper;
  }

  async function render() {
    const list = document.getElementById('messengerSecurityList');
    if (!list) return;
    list.setAttribute('aria-busy', 'true');
    try {
      const result = await api('/api/auth/messenger-links');
      list.replaceChildren(card('max', result.channels.max, result.availability?.max), card('tg', result.channels.tg, result.availability?.tg));
      list.removeAttribute('aria-busy');
    } catch (error) {
      list.removeAttribute('aria-busy');
      setNotice(errorText(error.code), true);
    }
  }

  async function startLink(provider, button) {
    const popup = window.AuthCard.openProviderWindow();
    button.disabled = true;
    setNotice('Создаём безопасную ссылку…', false);
    try {
      const result = await api(`/api/auth/messenger-links/${provider}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (popup) popup.location.replace(result.link);
      else setNotice(`Разрешите всплывающие окна и снова нажмите «Привязать ${labels[provider]}».`, true);
      if (popup) setNotice(`Завершите привязку в ${labels[provider]}. Статус обновится автоматически.`, false);
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!window.AppModal?.isOpen()) return clearInterval(pollTimer);
        try {
          const status = await api('/api/auth/messenger-links');
          if (status.channels?.[provider]) {
            clearInterval(pollTimer);
            await render();
            setNotice(`${labels[provider]} успешно привязан.`, false);
          }
        } catch (_) {}
      }, 2000);
    } catch (error) {
      if (popup) popup.close();
      setNotice(errorText(error.code), true);
    } finally {
      button.disabled = false;
    }
  }

  function showUnlink(provider) {
    document.getElementById('messengerSecurityConfirm')?.remove();
    const panel = document.createElement('div');
    panel.id = 'messengerSecurityConfirm';
    panel.className = 'messenger-security-confirm';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = 'messengerSecurityPassword';
    label.textContent = `Чтобы отвязать ${labels[provider]}, введите текущий пароль`;
    const input = document.createElement('input');
    input.id = 'messengerSecurityPassword';
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.className = 'control';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn-danger';
    submit.textContent = 'Подтвердить отвязку';
    submit.addEventListener('click', async () => {
      if (!input.value) { setNotice('Введите текущий пароль.', true); input.focus(); return; }
      submit.disabled = true;
      try {
        await api(`/api/auth/messenger-links/${provider}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: input.value }),
        });
        panel.remove();
        await render();
        setNotice(`${labels[provider]} отвязан.`, false);
      } catch (error) {
        setNotice(errorText(error.code), true);
        input.select();
      } finally {
        submit.disabled = false;
      }
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit.click(); } });
    panel.append(label, input, submit);
    document.getElementById('messengerSecurityContent').append(panel);
    input.focus();
  }

  trigger.addEventListener('click', () => {
    trigger.closest('.user-menu-wrapper')?.classList.remove('active');
    const content = document.createElement('div');
    content.id = 'messengerSecurityContent';
    const intro = document.createElement('p');
    intro.className = 'auth-stage-copy';
    intro.textContent = 'Привяжите личный профиль через бота вашего магазина для входа и восстановления пароля. MAX используется первым.';
    const list = document.createElement('div');
    list.id = 'messengerSecurityList';
    list.className = 'messenger-security-list';
    list.innerHTML = '<div class="messenger-security-card"><span class="messenger-security-state"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Загружаем привязки…</span></div>';
    const notice = document.createElement('p');
    notice.id = 'messengerSecurityNotice';
    notice.className = 'messenger-security-notice';
    notice.setAttribute('aria-live', 'polite');
    content.append(intro, list, notice);
    window.AppModal.open({
      title: 'Безопасность входа',
      content,
      hideFooter: true,
      onClose: () => { if (pollTimer) clearInterval(pollTimer); pollTimer = null; },
    });
    render();
  });
})();
