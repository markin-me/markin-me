(function (window) {
  'use strict';
  const FLAG = 'courier:offline-vault:v1';
  const NS = 'courier:vault:v1';
  const CONTROL = 'admin:local-access:v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const KDF_ITERATIONS = 600000;
  let dataKey = null, bundle = null, state = null, revoked = false;
  let migrationControl = null;
  let expiryTimer = null;
  let releaseReady;
  let readyResolved = false;
  let readyPromise = new Promise(resolve => { releaseReady = resolve; });
  function unlockedReady() { readyResolved = true; releaseReady(); }
  const localValues = new Map();
  const enabled = () => Boolean(localStorage.getItem(FLAG));
  const cache = () => window.AdminPersistentCache.createScope({ storageNamespace: NS, domain: NS, version: 1, retainStale: true });
  const exclusive = run => {
    if (!navigator.locks?.request) throw new Error('Для безопасной разблокировки нужен Web Locks.');
    return navigator.locks.request(NS, run);
  };
  function b64(bytes) {
    let text = '';
    for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytes(text) {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }
  const random = n => crypto.getRandomValues(new Uint8Array(n));
  async function seal(key, value, aad) {
    const iv = random(12);
    return { courierEncrypted: 1, iv: b64(iv), cipher: b64(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(JSON.stringify(value)))) };
  }
  async function unseal(key, value, aad) {
    if (value?.courierEncrypted !== 1) throw new Error('PRIVATE_CACHE_FORMAT_INVALID');
    return JSON.parse(decoder.decode(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(value.iv), additionalData: encoder.encode(aad) }, key, bytes(value.cipher))));
  }
  async function pinKey(pin, salt) {
    if (!/^[0-9]{8,32}$/.test(pin)) throw new Error('PIN должен содержать от 8 до 32 цифр.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: KDF_ITERATIONS },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function privateEntry(key, namespace) {
    if (namespace === NS) return false;
    let name;
    try { name = decodeURIComponent(String(namespace || '') + ':' + key); } catch (_) { throw new Error('PRIVATE_NAMESPACE_INVALID'); }
    // Orders can also appear in a mixed-role cash workspace, client card or saved draft.
    return /orders|courier|cash|clients|new-order|draft|checkout/.test(name);
  }
  const privateLocal = key => /^(user$|courier_offline_|local:v2:.*:workspace-bootstrap:)/.test(key);
  const deadline = () => bundle.onlineOnly ? Math.min(bundle.proof.context.local_context.expiresAt, bundle.onlineCheckedAt + 86400000) : bundle.grant.expiresAt;
  function assertUnlocked() {
    if (!dataKey || !bundle || revoked) throw new Error('OFFLINE_UNLOCK_REQUIRED');
    if (bundle.onlineOnly && !navigator.onLine) { lock(); throw new Error('OFFLINE_GRANT_REVOKED'); }
    if (deadline() <= Date.now() || Date.now() + 60000 < state.lastSeen) {
      lock(); throw new Error('OFFLINE_GRANT_EXPIRED_OR_CLOCK_CHANGED');
    }
    if (String(localStorage.getItem('activeStoreId')) !== (bundle.onlineOnly ? bundle.onlineStoreId : bundle.grant.storeId)
        || (localStorage.getItem(CONTROL) !== bundle.proof.control && localStorage.getItem(CONTROL) !== migrationControl)) throw new Error('OFFLINE_SCOPE_CHANGED');
  }
  async function encode(key, namespace, value) {
    if (!enabled() || !privateEntry(key, namespace)) return value;
    assertUnlocked();
    const result = await seal(dataKey, value, key);
    assertUnlocked(); return result;
  }
  async function decode(key, namespace, value) {
    if (!enabled() || !privateEntry(key, namespace)) return value;
    assertUnlocked();
    if (value?.courierEncrypted !== 1) throw new Error('PRIVATE_CACHE_MIGRATION_REQUIRED');
    const result = await unseal(dataKey, value, key);
    assertUnlocked(); return result;
  }
  function lock() {
    clearTimeout(expiryTimer); expiryTimer = null;
    dataKey = null; bundle = null; localValues.clear();
    if (readyResolved) { readyResolved = false; readyPromise = new Promise(resolve => { releaseReady = resolve; }); }
    window.setAuthToken(null, { memoryOnly: true });
    window.AdminLocalRepository?.reset({ forget: true, broadcast: false, reason: 'offline-unlock-required' });
    queueMicrotask(() => { if (enabled()) showForm(false); });
  }
  function armExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => {
      if (bundle && deadline() > Date.now()) armExpiry();
      else lock();
    }, Math.min(2147483647, Math.max(0, deadline() - Date.now())));
  }
  async function verify(signed, deviceId, allowExpired = false) {
    if (!window.__COURIER_OFFLINE_PUBLIC_KEY__) throw new Error('OFFLINE_SIGNING_KEY_UNAVAILABLE');
    const publicKey = await crypto.subtle.importKey('jwk', window.__COURIER_OFFLINE_PUBLIC_KEY__, 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', publicKey, bytes(signed.signature), bytes(signed.payload))) throw new Error('OFFLINE_GRANT_SIGNATURE_INVALID');
    const grant = JSON.parse(decoder.decode(bytes(signed.payload)));
    if (grant.version !== 1 || grant.audience !== 'courier-offline' || grant.origin !== location.origin || grant.deviceId !== deviceId
        || !Number.isSafeInteger(grant.issuedAt) || !Number.isSafeInteger(grant.expiresAt)
        || grant.expiresAt > grant.issuedAt + 86400000 || (!allowExpired && grant.expiresAt <= Date.now())
        || grant.issuedAt > Date.now() + 60000 || grant.localContext?.courierOfflineV2 !== true
        || grant.localContext?.principal?.type !== 'user'
        || JSON.stringify(grant.operations) !== JSON.stringify(['status', 'non_delivery', 'damage'])) throw new Error('OFFLINE_GRANT_EXPIRED_OR_INVALID');
    return grant;
  }
  async function requestGrant(deviceId, token) {
    const response = await fetch('/api/auth/courier-offline-grant', { method: 'POST', cache: 'no-store',
      signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, storeId: String(localStorage.getItem('activeStoreId')) }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'OFFLINE_GRANT_FAILED'), { status: response.status });
    return { signed: result.grant, grant: await verify(result.grant, deviceId) };
  }
  async function restoreBundle(candidate, deviceId, onlineValidated = false) {
    if (candidate.onlineOnly) throw new Error('OFFLINE_GRANT_REVOKED');
    const grant = await verify(candidate.signed, deviceId);
    const binding = b64(await crypto.subtle.digest('SHA-256', encoder.encode(candidate.token)));
    const expected = b64(Uint8Array.from(grant.tokenBinding.match(/../g), x => parseInt(x, 16)));
    if (binding !== expected || candidate.proof.binding !== grant.tokenBinding
        || candidate.proof.context.local_context.accessViewId !== grant.localContext.accessViewId
        || candidate.proof.control !== localStorage.getItem(CONTROL)
        || String(localStorage.getItem('activeStoreId')) !== grant.storeId
        || (!onlineValidated && window.AdminServerAccessContext && window.AdminServerAccessContext.token_binding !== grant.tokenBinding)) throw new Error('OFFLINE_SCOPE_CHANGED');
    return { ...candidate, grant, proof: { ...candidate.proof, context: {
      ok: true, local_context: { ...grant.localContext, offlineExpiresAt: grant.expiresAt }, metadata: grant.metadata } } };
  }
  async function unlock(pin) {
    return exclusive(async () => {
      const storage = cache();
      state = await storage.get('state');
      const pendingLogout = Boolean(localStorage.getItem('admin:logout-pending:v1'));
      const onlineContext = navigator.onLine && window.AdminServerAccessContext;
      if (!state || !['ready', 'migrating'].includes(state.phase) || state.revoked && !pendingLogout && !onlineContext) throw new Error('Требуется онлайн-вход и повторная настройка offline unlock.');
      if (state.attempts >= 8 && onlineContext?.token_binding && onlineContext.token_binding !== state.lastBinding) {
        state = { ...state, attempts: 0, nextAttemptAt: 0, lastBinding: onlineContext.token_binding };
        await storage.set('state', state, { noQuotaCleanup: true });
      }
      if (state.attempts >= 8 || state.nextAttemptAt > Date.now()) throw new Error('PIN временно заблокирован. После 8 ошибок требуется новый онлайн-вход.');
      // Reserve the attempt durably before trying the PIN, including across tabs/crashes.
      state = { ...state, attempts: state.attempts + 1, nextAttemptAt: Date.now() + Math.min(60000, 1000 * 2 ** state.attempts) };
      await storage.set('state', state, { noQuotaCleanup: true });
      let candidateKey;
      try {
        const device = await storage.get('device');
        if (!device?.key || device.id !== state.deviceId) throw new Error('DEVICE_KEY_UNAVAILABLE');
        const wrapped = await unseal(device.key, state.wrappedKey, NS + ':device');
        const raw = bytes(await unseal(await pinKey(pin, state.salt), wrapped, NS + ':pin'));
        candidateKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
        raw.fill(0);
        state = { ...state, attempts: 0, nextAttemptAt: 0 };
        await storage.set('state', state, { noQuotaCleanup: true });
        if (pendingLogout) {
          const pending = await storage.get('logout');
          const oldToken = await unseal(candidateKey, pending, NS + ':logout');
          const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
            headers: { Authorization: 'Bearer ' + oldToken, 'Content-Type': 'application/json' }, body: '{}' });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error('BROWSER_LOGOUT_PENDING');
          localStorage.removeItem('admin:logout-pending:v1');
          window.location.assign('/login');
          return null; // Never unlock private data to finish a logout.
        }
        let source = await unseal(candidateKey, state.bundle, NS + ':bundle');
        // An expired/changed grant can only be replaced after a NEW server check.
        // Merely unlocking offline never changes issuedAt/expiresAt or permissions.
        if (onlineContext) {
          const currentToken = window.getAuthToken();
          let fresh;
          try { fresh = await requestGrant(device.id, currentToken); }
          catch (error) {
            if (error.status !== 403 || error.message !== 'OFFLINE_GRANT_FORBIDDEN') throw error;
            // Losing courier rights must revoke cold/offline access, NOT lock the
            // same employee out of their still-authorized online CRM role.
            const response = await fetch('/api/auth/browser-session', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
              headers: { Authorization: 'Bearer ' + currentToken, 'Content-Type': 'application/json' }, body: '{}' });
            const context = await response.json();
            if (!response.ok || !context.ok || !context.local_context || context.local_context.courierOfflineV2
                || !context.stores?.some(s => String(s.id) === String(localStorage.getItem('activeStoreId')))
                || currentToken !== window.getAuthToken()) throw error;
            const ticket = window.AdminLocalRepository.beginConfirmation();
            await window.AdminLocalRepository.confirm({ ...context, metadata: { roles: context.roles, active_role: context.active_role,
              permissions: context.permissions, stores: context.stores } }, currentToken, ticket);
            window.AdminServerAccessContext = context;
            source = { ...source, onlineOnly: true, onlineCheckedAt: Date.now(), onlineStoreId: String(localStorage.getItem('activeStoreId')), token: currentToken,
              proof: JSON.parse(sessionStorage.getItem('admin:local-confirmation:v1')),
              local: [...new Map([...(source.local || []), ['user', JSON.stringify(context.user)]])] };
          }
          if (currentToken !== window.getAuthToken()) throw new Error('LOCAL_SCOPE_CHANGED');
          if (fresh) {
            const ticket = window.AdminLocalRepository.beginConfirmation();
            await window.AdminLocalRepository.confirm({ ok: true, local_context: fresh.grant.localContext, metadata: fresh.grant.metadata }, currentToken, ticket);
            window.AdminServerAccessContext = { ...onlineContext, ...fresh.grant.metadata, local_context: fresh.grant.localContext, token_binding: fresh.grant.tokenBinding };
            source = { ...source, onlineOnly: false, token: currentToken, signed: fresh.signed,
              proof: JSON.parse(sessionStorage.getItem('admin:local-confirmation:v1')),
              local: [...new Map([...(source.local || []), ['user', JSON.stringify(onlineContext.user)]])] };
          }
        }
        const candidate = source.onlineOnly && onlineContext ? source : await restoreBundle(source, device.id, Boolean(onlineContext));
        if (Date.now() + 60000 < state.lastSeen) throw new Error('OFFLINE_CLOCK_CHANGED');
        dataKey = candidateKey; bundle = candidate; revoked = false;
        if (state.phase === 'migrating') {
          await window.AdminPersistentCache.encryptCourierEntries();
          for (const [key] of bundle.local || []) localStorage.setItem(key, '@courier-vault');
          state = { ...state, phase: 'ready' };
          localStorage.setItem(FLAG, 'ready');
        }
        state = { ...state, revoked: Boolean(candidate.onlineOnly), attempts: 0, nextAttemptAt: 0, lastSeen: Math.max(state.lastSeen, Date.now()), lastBinding: window.AdminServerAccessContext?.token_binding || candidate.grant.tokenBinding,
          bundle: await seal(dataKey, bundle, NS + ':bundle') };
        await storage.set('state', state, { noQuotaCleanup: true });
        for (const [key, value] of bundle.local || []) localValues.set(key, value);
        for (const [key] of bundle.local || []) if (privateLocal(key)) localStorage.setItem(key, '@courier-vault');
        localStorage.setItem(FLAG, 'ready');
        window.setAuthToken(bundle.token, { memoryOnly: true });
        armExpiry();
        unlockedReady();
        return bundle.proof;
      } catch (error) {
        if ([401, 403].includes(error.status)) {
          state = { ...state, revoked: true };
          await storage.set('state', state, { noQuotaCleanup: true });
          window.AdminLocalRepository?.reset({ forget: true, reason: 'server-permission-refusal' });
        }
        dataKey = null; bundle = null;
        console.warn('COURIER_UNLOCK_FAILED:', error.name === 'OperationError' ? 'PIN_OR_KEY_INVALID' : error.message);
        throw new Error(error.name === 'OperationError' ? 'Неверный PIN.' : error.message);
      }
    });
  }
  async function enroll(pin) {
    if (!navigator.onLine || !window.AdminLocalRepository?.isActive() || window.AdminAccessContext?.offline) throw new Error('Сначала подтвердите доступ онлайн.');
    return exclusive(async () => {
      const storage = cache();
      const token = window.getAuthToken();
      const proof = JSON.parse(sessionStorage.getItem('admin:local-confirmation:v1') || 'null');
      if (!proof || !token) throw new Error('ONLINE_CONFIRMATION_REQUIRED');
      const old = await storage.get('state');
      if (old && !dataKey) throw new Error('Сначала разблокируйте существующий кеш. Не удаляйте очередь.');
      let device = await storage.get('device');
      if (!device) {
        device = { id: Array.from(random(32), n => n.toString(16).padStart(2, '0')).join(''),
          key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) };
        await storage.set('device', device, { noQuotaCleanup: true });
      }
      const fresh = await requestGrant(device.id, token);
      const grant = fresh.grant;
      if (!window.AdminLocalRepository.isActive() || token !== window.getAuthToken()
          || proof.control !== localStorage.getItem(CONTROL) || proof.binding !== grant.tokenBinding) throw new Error('LOCAL_SCOPE_CHANGED');
      const salt = old?.salt || b64(random(32));
      const derived = await pinKey(pin, salt);
      let wrappedKey = old?.wrappedKey;
      if (!old) {
        const raw = random(32);
        dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
        wrappedKey = await seal(device.key, await seal(derived, b64(raw), NS + ':pin'), NS + ':device');
        raw.fill(0);
      } else {
        // Verify the existing PIN; never replace the wrapping key and orphan old actions.
        const wrapped = await unseal(device.key, wrappedKey, NS + ':device');
        const raw = bytes(await unseal(derived, wrapped, NS + ':pin')); raw.fill(0);
      }
      const local = [...localValues];
      for (const key of Object.keys(localStorage)) if (privateLocal(key)) {
        const value = localStorage.getItem(key);
        if (value !== '@courier-vault') { localValues.set(key, value); local.push([key, value]); }
      }
      for (const key of ['user']) {
        const value = window.getAuthLocalValue(key);
        if (value) { localValues.set(key, value); local.push([key, value]); }
      }
      bundle = { token, proof, signed: fresh.signed, grant, local };
      state = { phase: 'migrating', deviceId: device.id, salt, wrappedKey,
        bundle: await seal(dataKey, bundle, NS + ':bundle'), attempts: 0, nextAttemptAt: 0, lastSeen: Date.now(), lastBinding: grant.tokenBinding };
      await storage.set('state', state, { noQuotaCleanup: true });
      localStorage.setItem(FLAG, 'migrating');
      // Invalidate old-code tabs as well; their existing repository guards observe CONTROL.
      migrationControl = JSON.stringify({ ...JSON.parse(proof.control), status: 'vault-migration' });
      localStorage.setItem(CONTROL, migrationControl);
      try {
        await window.AdminPersistentCache.encryptCourierEntries();
        // The encrypted copy is committed before replacing any plaintext local entry.
        for (const [key] of local) localStorage.setItem(key, '@courier-vault');
        window.setAuthToken(token, { memoryOnly: true });
        localStorage.removeItem('authToken');
        state = { ...state, phase: 'ready' };
        await storage.set('state', state, { noQuotaCleanup: true });
        localStorage.setItem(CONTROL, proof.control);
        migrationControl = null;
        localStorage.setItem(FLAG, 'ready');
        armExpiry();
        unlockedReady();
        return { expiresAt: grant.expiresAt };
      } catch (error) {
        // Keep encrypted/unencrypted records and the migration journal. No destructive rollback.
        lock(); throw error;
      }
    });
  }
  async function persistLocal(key, value) {
    assertUnlocked();
    return exclusive(async () => {
      assertUnlocked();
      const storage = cache(), latestState = await storage.get('state');
      if ((latestState.revoked && !bundle.onlineOnly) || latestState.phase !== 'ready' || latestState.deviceId !== state.deviceId) throw new Error('OFFLINE_SCOPE_CHANGED');
      const latest = await unseal(dataKey, latestState.bundle, NS + ':bundle');
      if (latest.proof.control !== bundle.proof.control || latest.token !== bundle.token) throw new Error('OFFLINE_SCOPE_CHANGED');
      const merged = new Map(latest.local || []); merged.set(key, value);
      const next = { ...latestState, lastSeen: Math.max(latestState.lastSeen, Date.now()),
        bundle: await seal(dataKey, { ...latest, local: [...merged] }, NS + ':bundle') };
      assertUnlocked();
      await storage.set('state', next, { noQuotaCleanup: true });
      state = next;
      for (const [name, item] of merged) localValues.set(name, item);
      bundle.local = [...merged];
      localStorage.setItem(key, '@courier-vault');
    });
  }
  async function logout(token) {
    assertUnlocked();
    await exclusive(async () => {
      assertUnlocked();
      await cache().set('logout', await seal(dataKey, token, NS + ':logout'), { noQuotaCleanup: true });
      state = { ...await cache().get('state'), revoked: true };
      await cache().set('state', state, { noQuotaCleanup: true });
      localStorage.setItem('admin:logout-pending:v1', JSON.stringify({ encrypted: true, id: b64(random(16)) }));
    });
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store', keepalive: true,
        signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (response.ok && result.ok) localStorage.removeItem('admin:logout-pending:v1');
    } catch (_) { /* Encrypted revocation stays pending; PIN + network can finish it. */ }
    finally {
      window.AdminLocalRepository.reset({ forget: true, reason: 'logout' });
      lock(); localStorage.removeItem('user'); localStorage.removeItem('tenant');
      window.location.assign('/login');
    }
  }
  function showForm(enrollment) {
    const root = document.getElementById(enrollment ? 'courierOfflineUnlock' : 'adminLocalAccessState')
      || (!enrollment && localStorage.getItem('admin:logout-pending:v1') && document.querySelector('.auth-container'));
    if (!root || root.querySelector('[data-offline-pin]')) return;
    const form = document.createElement('form');
    form.innerHTML = '<p>' + (enrollment ? 'Безопасный запуск без сети: настройте PIN (минимум 8 цифр).' : 'Разблокируйте сохранённые курьерские данные. PIN не заменяет вход на сервер.')
      + '</p><label>PIN <input data-offline-pin type="password" inputmode="numeric" minlength="8" maxlength="32" autocomplete="off" required></label>'
      + (enrollment ? '<label>Повторите PIN <input data-offline-pin-confirm type="password" inputmode="numeric" minlength="8" maxlength="32" autocomplete="off" required></label>' : '')
      + '<button type="submit">' + (enrollment ? 'Настроить offline unlock' : 'Разблокировать') + '</button><p data-unlock-error role="alert"></p>';
    root.appendChild(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const input = form.querySelector('input'), button = form.querySelector('button'), error = form.querySelector('[data-unlock-error]');
      const pin = input.value; input.value = ''; button.disabled = true; error.textContent = '';
      try {
        const confirmation = form.querySelector('[data-offline-pin-confirm]');
        if (confirmation) {
          const matching = confirmation.value === pin; confirmation.value = '';
          if (!matching) throw new Error('PIN не совпадают.');
        }
        if (enrollment) { const result = await enroll(pin); form.remove(); root.textContent = 'Offline unlock действует до ' + new Date(result.expiresAt).toLocaleString(); }
        else {
          const proof = await unlock(pin);
          if (proof) { form.remove(); window.AdminAccessContextPromise = window.reloadAdminAccessContext(true); }
        }
      } catch (failure) {
        error.textContent = /EXPIRED|CLOCK_CHANGED/.test(failure.message)
          ? 'Срок офлайн-доступа истёк или изменились часы. Подключитесь к сети, обновите страницу и подтвердите доступ заново.'
          : failure.message;
      }
      finally { button.disabled = false; }
    });
  }
  window.CourierOfflineVault = Object.freeze({ enabled, privateEntry, encode, decode, enroll, unlock, lock, logout,
    ready: () => readyPromise,
    proof: () => { assertUnlocked(); if (bundle.onlineOnly) throw new Error('OFFLINE_GRANT_REVOKED'); return JSON.parse(JSON.stringify(bundle.proof)); },
    isUnlocked: () => { try { assertUnlocked(); return true; } catch (_) { return false; } },
    localGet: key => { assertUnlocked(); return localValues.get(key) ?? null; }, localSet: persistLocal,
    showUnlock: () => showForm(false) });
  window.addEventListener('storage', event => {
    if (event.key === FLAG || event.key === CONTROL || event.key === 'activeStoreId' || event.key === 'authToken') {
      if (event.key === FLAG || bundle && (event.key === 'authToken' || event.key === 'activeStoreId'
          || event.newValue !== bundle.proof.control)) { revoked = true; lock(); }
    }
  });
  window.addEventListener('admin:access-context', () => {
    if (!enabled() && window.__COURIER_OFFLINE_PUBLIC_KEY__ && window.AdminAccessContext?.local_context?.courierOfflineV2 && navigator.onLine) showForm(true);
    if (enabled() && !window.CourierOfflineVault.isUnlocked()) showForm(false);
  });
  document.addEventListener('DOMContentLoaded', () => { if (enabled() && !dataKey) showForm(false); });
  function checkExpiry() { if (bundle) { try { assertUnlocked(); } catch (_) { lock(); } } }
  window.addEventListener('focus', checkExpiry);
  document.addEventListener('visibilitychange', checkExpiry); // Lifecycle check, not CRM activity.
})(window);
