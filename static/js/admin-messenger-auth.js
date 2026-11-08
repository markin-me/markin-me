(function () {
  const trigger = document.getElementById('userMenuMessengerSecurity');
  if (!trigger) return;

  const labels = { max: 'MAX', tg: 'Telegram' };
  let pollTimer = null;
  let bindingsCache = null;
  let bindingsRequest = null;
  const pendingLinks = new Map();

  document.getElementById('userMenuChangePassword')?.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const profile = document.getElementById('userMenuDropdown');
    const profileNodes = Array.from(profile.childNodes);
    const link = event.currentTarget;
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(link.href);
      if (!response.ok) throw new Error('PASSWORD_FORM_LOAD_FAILED');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const stage = page.getElementById('passwordChangeStage');
      if (!stage) throw new Error('PASSWORD_FORM_LOAD_FAILED');
      const content = document.importNode(stage, true);
      content.removeAttribute('id');
      content.className = 'admin-profile-password-content';
      const heading = document.createElement('h2');
      heading.textContent = 'Сменить пароль';
      content.prepend(heading);
      const notice = document.createElement('p');
      notice.setAttribute('role', 'status');
      content.append(notice);
      const restore = () => { profile.replaceChildren(...profileNodes); link.focus(); };
      const cancel = content.querySelector('.auth-password-cancel');
      cancel.textContent = 'ОТМЕНИТЬ';
      cancel.removeAttribute('href');
      cancel.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); restore(); });
      content.querySelectorAll('.password-toggle').forEach(button => button.addEventListener('click', () => {
        const input = content.querySelector('#' + button.dataset.target);
        input.type = input.type === 'password' ? 'text' : 'password';
      }));
      const form = content.querySelector('form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        if (data.new_password !== data.new_password_confirm) { notice.textContent = 'Пароли не совпадают'; return; }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          const result = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }) });
          if (result.token) localStorage.setItem('authToken', result.token);
          if (result.user) localStorage.setItem('user', JSON.stringify(result.user));
          if (result.tenant) localStorage.setItem('tenant', JSON.stringify(result.tenant));
          restore();
        } catch (error) {
          notice.textContent = ({ CURRENT_PASSWORD_INVALID: 'Текущий пароль указан неверно.', PASSWORD_TOO_WEAK: 'Добавьте латинские буквы обоих регистров и цифры.', PASSWORD_TOO_SHORT: 'Минимум 12 символов.', PASSWORD_TOO_LONG: 'Пароль не должен превышать 72 байта.' })[error.code] || errorText(error.code);
        } finally { submit.disabled = false; }
      });
      profile.replaceChildren(content);
      form.querySelector('input').focus();
    } catch (error) {
      await window.AppModal.alert('Не удалось загрузить форму смены пароля. Попробуйте ещё раз.');
    } finally { link.removeAttribute('aria-busy'); }
  });

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
    notice.textContent = isError ? text || '' : '';
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function card(provider, channel, availability) {
    const wrapper = document.createElement('article');
    wrapper.className = 'messenger-security-card';
    wrapper.dataset.provider = provider;
    const copy = document.createElement('div');
    copy.className = 'messenger-security-copy';
    const icon = document.createElement('img');
    icon.className = 'messenger-security-icon';
    icon.src = `/static/uploads/auth/${provider === 'tg' ? 'telegram' : 'max'}-auth.png`;
    icon.alt = '';
    const title = document.createElement('h3');
    title.className = 'messenger-security-title';
    title.textContent = labels[provider];
    const state = document.createElement('p');
    state.className = 'messenger-security-state';
    state.textContent = channel ? `Привязан профиль ${channel.masked}` : 'Не привязан';
    copy.append(icon, title, state);

    const actions = document.createElement('div');
    actions.className = 'messenger-security-actions';
    const pending = pendingLinks.get(provider);
    const ready = !channel && pending && pending.expiresAt > Date.now();
    const button = document.createElement(ready ? 'a' : 'button');
    if (ready) { button.href = pending.url; button.target = '_blank'; button.rel = 'noopener'; }
    else button.type = 'button';
    button.className = 'btn btn-sm';
    button.textContent = channel ? 'Отвязать' : pendingLinks.has(provider) ? `Открыть ${labels[provider]}` : 'Привязать';
    button.disabled = !channel && availability?.available === false;
    if (!ready) button.addEventListener('click', () => channel ? showUnlink(provider) : startLink(provider, button));
    actions.append(button);
    wrapper.append(copy, actions);
    return wrapper;
  }

  async function render(force = false) {
    const list = document.getElementById('messengerSecurityList');
    if (!list) return;
    list.setAttribute('aria-busy', 'true');
    try {
      let result = !force && bindingsCache;
      if (!result) {
        if (!bindingsRequest) bindingsRequest = api('/api/auth/messenger-links').finally(() => { bindingsRequest = null; });
        result = await bindingsRequest;
        bindingsCache = result;
      }
      if (!list.isConnected) return;
      list.replaceChildren(card('max', result.channels.max, result.availability?.max), card('tg', result.channels.tg, result.availability?.tg));
      list.removeAttribute('aria-busy');
    } catch (error) {
      list.removeAttribute('aria-busy');
      setNotice(errorText(error.code), true);
    }
  }

  async function startLink(provider, button) {
    const pending = pendingLinks.get(provider);
    if (pending && pending.expiresAt > Date.now()) {
      window.AuthCard.openProviderWindow(pending.url);
      return;
    }
    pendingLinks.delete(provider);
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = `Открываем ${labels[provider]}…`;
    button.classList.add('is-opening');
    button.setAttribute('aria-busy', 'true');
    setNotice('Создаём безопасную ссылку…', false);
    try {
      const result = await api(`/api/auth/messenger-links/${provider}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
      const url = new URL(result.link);
      if (url.protocol !== 'https:' || !['t.me', 'max.ru'].includes(url.hostname)) throw new Error('BOT_LINK_INVALID');
      pendingLinks.set(provider, { url: url.href, expiresAt: Date.parse(result.expires_at) });
      const popup = window.AuthCard.openProviderWindow(url.href);
      if (!popup) setNotice(`Разрешите всплывающие окна и снова нажмите «Привязать ${labels[provider]}».`, true);
      if (popup) setNotice(`Завершите привязку в ${labels[provider]}. Статус обновится автоматически.`, false);
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!document.getElementById('messengerSecurityContent')?.getClientRects().length) return clearInterval(pollTimer);
        try {
          const status = await api('/api/auth/messenger-links');
          bindingsCache = status;
          if (status.channels?.[provider]) {
            pendingLinks.delete(provider);
            clearInterval(pollTimer);
            await render();
            setNotice(`${labels[provider]} успешно привязан.`, false);
          }
        } catch (_) {}
      }, 2000);
    } catch (error) {
      setNotice(errorText(error.code), true);
    } finally {
      button.disabled = false;
      button.textContent = pendingLinks.has(provider) ? `Открыть ${labels[provider]}` : originalText;
      button.classList.remove('is-opening');
      button.removeAttribute('aria-busy');
      if (pendingLinks.has(provider)) await render();
    }
  }

  async function showUnlink(provider) {
    const confirmed = await window.AppModal.confirm({
      title: `Отвязать ${labels[provider]}?`,
      message: `Вход и получение кодов через этот аккаунт ${labels[provider]} станут недоступны до повторной привязки.`,
      saveText: 'Отвязать',
    });
    if (!confirmed) return;
    try {
      await api(`/api/auth/messenger-links/${provider}`, { method: 'DELETE' });
      bindingsCache = null;
      await render(true);
      setNotice(`${labels[provider]} отвязан.`, false);
    } catch (error) {
      setNotice(errorText(error.code), true);
    }
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const profile = document.getElementById('userMenuDropdown');
    const profileNodes = Array.from(profile.childNodes);
    const content = document.createElement('div');
    content.id = 'messengerSecurityContent';
    content.className = 'messenger-security-content';
    const toolbar = document.createElement('div');
    toolbar.className = 'messenger-security-toolbar';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'messenger-security-back';
    back.setAttribute('aria-label', 'Назад');
    back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i>';
    back.addEventListener('click', (event) => {
      event.stopPropagation();
      clearInterval(pollTimer);pollTimer = null;
      profile.replaceChildren(...profileNodes);
      profile.classList.remove('is-messengers-screen');
      trigger.focus();
    });
    const heading = document.createElement('h2');
    heading.textContent = 'Мессенджеры';
    toolbar.append(back, heading);
    const panel = document.createElement('div');
    panel.className = 'messenger-security-panel';
    const list = document.createElement('div');
    list.id = 'messengerSecurityList';
    list.className = 'messenger-security-list';
    list.innerHTML = '<div class="messenger-security-card"><span class="messenger-security-state"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Загружаем привязки…</span></div>';
    const notice = document.createElement('p');
    notice.id = 'messengerSecurityNotice';
    notice.className = 'messenger-security-notice';
    notice.setAttribute('aria-live', 'polite');
    panel.append(list);
    content.append(toolbar, panel, notice);
    profile.classList.add('is-messengers-screen');
    profile.replaceChildren(content);
    render();
  });
})();
