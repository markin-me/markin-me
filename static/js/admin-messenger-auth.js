(function () {
  const trigger = document.getElementById('userMenuMessengerSecurity');
  if (!trigger) return;

  const labels = { max: 'MAX', tg: 'Telegram' };
  let pollTimer = null;
  let bindingsCache = null;
  let bindingsRequest = null;
  const pendingLinks = new Map();
  const profileMenu = document.getElementById('userMenuDropdown');
  const rootProfileNodes = Array.from(profileMenu.childNodes);
  let profileOpenVersion = 0;
  const photo = profileMenu.querySelector('.user-menu-avatar');
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/jpeg,image/png,image/webp';
  photoInput.className = 'hidden';
  const camera = document.createElement('span');
  camera.className = 'admin-profile-photo-camera';
  camera.setAttribute('aria-hidden', 'true');
  camera.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 16h6l3-5h10l3 5h6a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H19M5 29v-8a5 5 0 0 1 5-5"/><circle cx="25" cy="27" r="8"/><path d="M8 34v12M2 40h12"/></svg>';
  const removePhoto = document.createElement('button');
  removePhoto.type = 'button';
  removePhoto.className = 'btn admin-profile-photo-remove';
  removePhoto.setAttribute('aria-label', 'Удалить фото');
  removePhoto.innerHTML = '<i class="fas fa-trash-can" aria-hidden="true"></i>';
  photo.append(camera, photoInput, removePhoto);
  const editProfile = document.createElement('button');
  editProfile.type = 'button';
  editProfile.className = 'btn btn-icon admin-profile-edit-trigger';
  editProfile.textContent = 'Изм.';
  document.querySelector('body > header .header-content').append(editProfile);
  let photoBusy = false;
  document.querySelector('#userMenuLogout > span').textContent = '\u0412\u044b\u0439\u0442\u0438';
  const phoneLabel = profileMenu.querySelector('#userMenuPhone');
  const phoneStatus = document.createElement('div');
  phoneStatus.className = 'admin-profile-phone-status';
  phoneStatus.setAttribute('role', 'status');
  const phoneMark = document.createElement('span');
  phoneMark.className = 'admin-profile-phone-mark hidden';
  phoneMark.setAttribute('role', 'img');
  phoneMark.setAttribute('aria-label', 'Телефон подтверждён');
  phoneMark.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
  const phoneHint = document.createElement('span');
  phoneStatus.append(phoneMark, phoneHint);
  phoneLabel.after(phoneStatus);
  for (const id of ['userMenuChangePassword', 'userMenuMessengerSecurity']) {
    const button = document.getElementById(id);
    const arrow = document.createElement('i');
    arrow.className = 'fas fa-chevron-right admin-profile-nav-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(arrow);
  }
  let phoneStatusRequest = null;
  let phoneStatusCache = null;
  async function loadProfilePhone(force = false) {
    const version = profileOpenVersion;
    if (force || !window.AdminAccessContext?.user) {
      phoneHint.textContent = 'Проверяем номер…';
      phoneMark.classList.add('hidden');
    }
    try {
      const token = localStorage.getItem('authToken');
      if (force) phoneStatusCache = null;
      let result = phoneStatusCache?.token === token ? phoneStatusCache.result : null;
      if (!result) {
        if (!phoneStatusRequest || phoneStatusRequest.token !== token) {
          const request = { token, promise: null };
          request.promise = api('/api/auth/me').finally(() => {
            if (phoneStatusRequest === request) phoneStatusRequest = null;
          });
          phoneStatusRequest = request;
        }
        result = await phoneStatusRequest.promise;
      }
      if (token !== localStorage.getItem('authToken')) return;
      if (typeof result?.user?.phone_verified !== 'boolean') throw new Error('INVALID_PHONE_VERIFICATION_STATUS');
      phoneStatusCache = { token, result };
      if (force && window.AdminAccessContext?.user) {
        Object.assign(window.AdminAccessContext.user, { phone: result.user.phone, phone_verified: result.user.phone_verified });
        localStorage.setItem('user', JSON.stringify(window.AdminAccessContext.user));
      }
      if (version !== profileOpenVersion) return;
      const number = String(result.user.phone || '').replace(/\D/g, '');
      phoneLabel.textContent = /^7\d{10}$/.test(number)
        ? number.replace(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4') : number ? '+' + number : '';
      phoneHint.textContent = result.user.phone_verified ? 'Номер подтверждён' : 'Номер не подтверждён';
      phoneMark.classList.toggle('hidden', !result.user.phone_verified);
    } catch (error) {
      if (version !== profileOpenVersion) return;
      phoneHint.textContent = 'Не удалось проверить номер.';
      console.error('ADMIN_PROFILE_PHONE_LOAD_FAILED', error);
    }
  }

  function resetPhotoEditor() {
    profileMenu.classList.remove('is-profile-editing');
    photo.closest('.user-menu-header').classList.remove('is-photo-expanded');
    photo.setAttribute('role', 'button');
    photo.tabIndex = 0;
    photo.setAttribute('aria-label', 'Развернуть фотографию профиля');
    photo.setAttribute('aria-expanded', 'false');
  }
  editProfile.addEventListener('click', event => {
    event.stopPropagation();
    openProfileSection('Изменить профиль', resetPhotoEditor);
    profileMenu.classList.add('is-profile-editing');
    photo.setAttribute('role', 'button');
    photo.tabIndex = 0;
    photo.setAttribute('aria-label', 'Изменить фотографию профиля');
    photo.focus();
  });
  function activatePhoto() {
    if (!mobileProfile() || photoBusy) return;
    if (profileMenu.classList.contains('is-profile-editing')) { photoInput.click(); return; }
    if (photo.querySelector('img').classList.contains('hidden')) { editProfile.click(); return; }
    const header = photo.closest('.user-menu-header');
    const from = photo.getBoundingClientRect();
    const textFrames = [...header.querySelectorAll('.user-menu-name,.user-menu-phone')].map(element => {
      element.getAnimations().forEach(animation => animation.cancel());
      return { element, rect: element.getBoundingClientRect() };
    });
    photo.getAnimations().forEach(animation => animation.cancel());
    if (!header.classList.contains('is-photo-expanded')) header.style.setProperty('--profile-cover-height', header.offsetHeight + 'px');
    const expanded = header.classList.toggle('is-photo-expanded');
    photo.setAttribute('aria-expanded', String(expanded));
    photo.setAttribute('aria-label', expanded ? 'Свернуть фотографию профиля' : 'Развернуть фотографию профиля');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = photo.getBoundingClientRect();
    const timing = { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' };
    photo.animate([
      { transformOrigin: 'top left', transform: `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`, borderRadius: expanded ? '50%' : '22px' },
      { transformOrigin: 'top left', transform: 'none', borderRadius: expanded ? '22px' : '50%' },
    ], timing);
    textFrames.forEach(({ element, rect }) => {
      const target = element.getBoundingClientRect();
      element.animate([{ transform: `translate(${rect.left-target.left}px,${rect.top-target.top}px)` }, { transform: 'none' }], timing);
    });
  }
  photo.addEventListener('click', event => {
    if (event.target.closest('button,input')) return;
    activatePhoto();
  });
  photo.addEventListener('keydown', event => {
    if (event.target !== photo) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activatePhoto(); }
  });
  async function savePhoto(options) {
    if (photoBusy) return;
    const version = profileOpenVersion;
    photoBusy = true;
    photo.setAttribute('aria-busy', 'true');
    removePhoto.disabled = true;
    try {
      const result = await api('/api/auth/me/photo', options);
      await window.updateAdminProfilePhoto(result.photo_revision);
      if (version === profileOpenVersion && mobileProfile() && profileMenu.classList.contains('is-profile-editing')) window.__adminMobilePages.back();
    } catch (error) {
      await window.AppModal.alert(error.code === 'INVALID_EMPLOYEE_PHOTO'
        ? 'Выберите JPEG, PNG или WebP размером до 5 МБ.' : 'Не удалось сохранить фото. Попробуйте ещё раз.');
    } finally {
      photoBusy = false;
      photo.removeAttribute('aria-busy');
      removePhoto.disabled = false;
    }
  }
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    if (!file || photoBusy) return;
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      await window.AppModal.alert('Выберите JPEG, PNG или WebP размером до 5 МБ.');
      return;
    }
    const version = profileOpenVersion;
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (version !== profileOpenVersion || !profileMenu.classList.contains('is-profile-editing')) return;
      await savePhoto({ method: 'PUT', body: JSON.stringify({ photo_base64: data }) });
    } catch (error) { await window.AppModal.alert('Не удалось прочитать фотографию.'); }
  });
  removePhoto.addEventListener('click', async event => {
    event.stopPropagation();
    if (photoBusy) return;
    const version = profileOpenVersion;
    if (!await window.AppModal.confirm({ title: 'Удалить фото профиля?', message: 'Фотографию можно будет загрузить снова.', saveText: 'Удалить' })) return;
    if (version !== profileOpenVersion || !profileMenu.classList.contains('is-profile-editing')) return;
    await savePhoto({ method: 'DELETE' });
  });

  const mobileProfile = () => profileMenu.classList.contains('admin-profile-page');
  function resetProfile() {
    profileOpenVersion++;
    resetPhotoEditor();
    profileMenu.dataset.profileView = 'root';
    clearInterval(pollTimer);pollTimer = null;
    profileMenu.replaceChildren(...rootProfileNodes);
    profileMenu.classList.remove('is-messengers-screen');
  }
  function openProfileSection(title, restore) {
    if (!mobileProfile()) return;
    photo.closest('.user-menu-header').classList.remove('is-photo-expanded');
    profileMenu.dataset.profileView = 'section';
    window.__adminMobilePages.openSubview(title, () => {
      profileMenu.dataset.profileView = 'root';
      restore();
      void loadProfilePhone();
    }, {
      key: 'admin-profile-section', element: profileMenu, global: true,
    });
  }
  document.getElementById('shopProfileBtn')?.addEventListener('click', event => {
    if (!matchMedia('(max-width: 768px)').matches) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (typeof isAuthenticated === 'function' && !isAuthenticated()) { location.href = '/login'; return; }
    if (mobileProfile()) return;
    resetProfile();
    if (document.getElementById('app-sidebar')?.classList.contains('is-open')) document.getElementById('adminMobileMenuBtn')?.click();
    const opened = window.__adminMobilePages.openSubview('\u041f\u0440\u043e\u0444\u0438\u043b\u044c', () => {
      profileMenu.classList.remove('admin-profile-page');
      document.body.classList.remove('admin-profile-page-open');
      document.getElementById('shopProfileBtn')?.closest('.user-menu-wrapper')?.classList.remove('active');
      resetProfile();
    }, { key: 'admin-profile', element: profileMenu, global: true });
    if (!opened) return;
    profileMenu.classList.add('admin-profile-page');
    void loadProfilePhone();
    document.body.classList.add('admin-profile-page-open');
    document.getElementById('shopProfileBtn')?.closest('.user-menu-wrapper')?.classList.add('active');
  }, true);

  document.getElementById('shopProfileBtn')?.addEventListener('click', () => {
    profileOpenVersion++;
    if (profileMenu.firstChild === rootProfileNodes[0]) return;
    clearInterval(pollTimer);pollTimer = null;
    profileMenu.replaceChildren(...rootProfileNodes);
    profileMenu.classList.remove('is-messengers-screen');
  }, true);

  document.getElementById('userMenuChangePassword')?.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const profile = document.getElementById('userMenuDropdown');
    const profileNodes = Array.from(profile.childNodes);
    const link = event.currentTarget;
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    const openedVersion = profileOpenVersion;
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
      const restoreContent = () => { profile.replaceChildren(...profileNodes); link.focus(); };
      const restore = () => { if (mobileProfile()) window.__adminMobilePages.back(); else restoreContent(); };
      content.querySelector('.auth-password-cancel').remove();
      const toolbar = document.createElement('div');
      toolbar.className = 'messenger-security-toolbar';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'messenger-security-back';
      cancel.setAttribute('aria-label', 'Назад');
      cancel.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i>';
      toolbar.append(cancel, heading);
      content.prepend(toolbar);
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
          if (profile.contains(content)) restore();
        } catch (error) {
          notice.textContent = ({ CURRENT_PASSWORD_INVALID: 'Текущий пароль указан неверно.', PASSWORD_TOO_WEAK: 'Добавьте латинские буквы обоих регистров и цифры.', PASSWORD_TOO_SHORT: 'Минимум 12 символов.', PASSWORD_TOO_LONG: 'Пароль не должен превышать 72 байта.' })[error.code] || errorText(error.code);
        } finally { submit.disabled = false; }
      });
      if (openedVersion !== profileOpenVersion || !document.getElementById('shopProfileBtn')?.closest('.user-menu-wrapper')?.classList.contains('active')) return;
      profile.replaceChildren(content);
      openProfileSection(heading.textContent, restoreContent);
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
    if (!channel && pendingLinks.has(provider)) actions.append(window.AuthCard.createProviderWebLink(pendingLinks.get(provider).url));
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
      const webLink = window.AuthCard.createProviderWebLink(url.href);
      button.closest('.messenger-security-actions').querySelector('a')?.remove();
      button.closest('.messenger-security-actions').append(webLink);
      if (!popup) setNotice(`Разрешите всплывающие окна и снова нажмите «Привязать ${labels[provider]}».`, true);
      if (popup) setNotice(`Завершите привязку в ${labels[provider]}. Статус обновится автоматически.`, false);
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!document.getElementById('messengerSecurityContent')?.getClientRects().length) return clearInterval(pollTimer);
        try {
          const status = await api('/api/auth/messenger-links');
          bindingsCache = status;
          if (status.channels?.[provider]) {
            clearInterval(pollTimer);pollTimer = null;
            await loadProfilePhone(true);
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
      await loadProfilePhone(true);
      bindingsCache = null;
      await render(true);
      setNotice(`${labels[provider]} отвязан.`, false);
    } catch (error) {
      setNotice(errorText(error.code), true);
    }
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    profileOpenVersion++;
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
      if (mobileProfile()) window.__adminMobilePages.back();
      else restoreContent();
    });
    const restoreContent = () => {
      clearInterval(pollTimer);pollTimer = null;
      profile.replaceChildren(...profileNodes);
      profile.classList.remove('is-messengers-screen');
      trigger.focus();
    };
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
    openProfileSection(heading.textContent, restoreContent);
    render();
  });
})();
