const { connectStoreChat } = require('./telegramBot');
const { requestTelegramApi } = require('./telegramApi');
const { markCurrentOperation, recordCurrentServiceMessage } = require('./messengerCleanup');

const TELEGRAM_API = 'https://api.telegram.org/bot';

function normalizePayloadFromStartText(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!m) return '';
  return String(m[1] || '').trim().split(/\s+/)[0] || '';
}

function isLoginPayload(payload) {
  const p = String(payload || '').trim().toLowerCase();
  return p === 'login' || p === 'auth' || p === 'link' || p === 'shop';
}

function isPlainStart(text) {
  return /^\/start(?:@\w+)?\s*$/i.test(String(text || '').trim());
}

async function sendTelegramMessage(token, chatId, text, extra = null, onTelegramApiTiming = null) {
  const body = { chat_id: chatId, text: String(text || '') };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  const data = await requestTelegramApi(`${TELEGRAM_API}${token}`, 'sendMessage', body, { onTiming: onTelegramApiTiming });
  await recordCurrentServiceMessage({
    provider: 'tg', chatId: data.result?.chat?.id || chatId, messageId: data.result?.message_id,
    hasReplyKeyboard: Boolean(body.reply_markup?.keyboard), hasInlineKeyboard: Boolean(body.reply_markup?.inline_keyboard),
  });
  return data.result;
}

async function handleTenantTelegramUpdate(db, helpers, tenantBot, upd, options = {}) {
  const send = (chatId, text, extra = null) => sendTelegramMessage(
    tenantBot.token, chatId, text, extra, options.onTelegramApiTiming
  );
  const callback=upd?.callback_query;
  if(callback && /^auth:(?:b_[A-Za-z0-9_-]{40}|r_[A-Za-z0-9_-]{43})$/.test(String(callback.data)) && options.onBrowserAuth){
    if(callback.message?.chat?.type!=='private' || String(callback.message.chat.id)!==String(callback.from?.id) || callback.from?.is_bot)return;
    const result=await options.onBrowserAuth({providerUserId:String(callback.from.id),token:callback.data.slice(5),confirm:true});
    await requestTelegramApi(`${TELEGRAM_API}${tenantBot.token}`, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: result.ok ? 'Вход подтверждён' : 'Запрос истёк или доступ не разрешён',
    }, { onTiming: options.onTelegramApiTiming });
    await send(callback.from.id,result.ok
      ? result.purpose==='password_reset'?'✅ Подтверждение смены пароля принято. Вернитесь в исходную вкладку CRM.':'Подтверждение принято. Вернитесь в исходную вкладку — CRM завершит вход там.'
      :result.error==='EMPLOYEE_MESSENGER_NOT_LINKED'?'Привязка не подтверждена. Начните вход заново в исходной карточке.'
      :result.error==='CUSTOMER_OWNERSHIP_PROOF_REQUIRED'?'По этому номеру уже есть карточка. Контакт не даёт доступа к её данным. Нужно подтверждение через ранее привязанный мессенджер или помощь администратора; дата рождения для новой привязки не подходит.'
      :'Вход не подтверждён. Запрос истёк, привязка конфликтует или требуется обновление CRM. Вернитесь в исходную карточку входа.');
    return;
  }
  const msg = upd?.message;
  if (!msg) return;
  const text = String(msg.text || '').trim();
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id;
  const payload = normalizePayloadFromStartText(text);
  const contactPhone = String(msg?.contact?.phone_number || msg?.contact?.phone || '').trim();

  if (!chatId || !fromId) return;
  if (isPlainStart(text) || isLoginPayload(payload)) return;
  // Store connection tokens are tenant-scoped and may be used in group chats.
  if (payload && !/^[alb]_/.test(payload)) {
    const storeConnected = await connectStoreChat(
      db, `${TELEGRAM_API}${tenantBot.token}`, chatId, payload, tenantBot.tenantId, options.onTelegramApiTiming
    );
    if (storeConnected) {
      if (typeof options.onStartKind === 'function') {
        try { options.onStartKind('store'); } catch (_) {}
      }
      return;
    }
  }
  if (msg.chat?.type !== 'private' || String(chatId) !== String(fromId)) return;
  if (options.loginEnabled === false) {
    if (payload) {
      await markCurrentOperation('error');
      await send(chatId, 'Вход через бота отключён в настройках магазина.');
    }
    if (payload) return;
  }

  if(payload.startsWith('b_') && options.onBrowserAuth){
    const result=await options.onBrowserAuth({providerUserId:String(fromId),token:payload,confirm:false});
    if(result.ok&&result.contactRequired){
      await send(chatId,'Чтобы авторизоваться в системе, нажмите «Авторизоваться».',
        {reply_markup:{keyboard:[[{text:'Авторизоваться',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
      return;
    }
    await send(chatId,result.ok?'Подтвердите вход в исходном браузере. Если вы не начинали вход, не нажимайте кнопку.':'Запрос истёк. Начните вход заново в магазине.',
      result.ok&&!result.confirmed?{reply_markup:{inline_keyboard:[[{text:result.purpose==='password_reset'?'✅ Подтвердить смену пароля':'✅ Авторизоваться',callback_data:`auth:${payload}`}]]}}:{reply_markup:{remove_keyboard:true}});
    return;
  }

  if (payload.startsWith('l_') && typeof options.onAuthLogin === 'function') {
    const result = await options.onAuthLogin({ providerUserId: String(fromId), token: payload });
    if (!result.ok || result.alreadySent) await send(chatId,
      result.alreadySent ? 'Код уже отправлен. Он действует 3 минуты. Для нового кода вернитесь на карточку входа.'
        : result.error === 'CODE_DELIVERY_FAILED' ? 'Не удалось доставить код. Создайте новый запрос на карточке входа.'
        : 'Запрос входа истёк или привязка не подтверждена. Вернитесь на карточку входа. Сотруднику нужно сначала войти с паролем и привязать мессенджер в профиле.');
    return;
  }
  if (payload.startsWith('a_') && typeof options.onAuthLink === 'function') {
    const result = await options.onAuthLink({ provider: 'tg', providerUserId: String(fromId), token: payload });
    if (result?.contactRequired) {
      await send(chatId, 'Чтобы привязать мессенджер к учётной записи, нажмите кнопку «Привязать».', {
        reply_markup: { keyboard: [[{ text: 'Привязать', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      });
      return;
    }
    await send(chatId, result?.ok
      ? result.context==='PROFILE_LINK'
        ? 'Telegram успешно привязан к вашему профилю! Теперь вы можете получать коды для входа в магазин через этот бот'
        : 'Telegram успешно привязан. Вернитесь в CRM. Теперь вы можете получать коды для входа через этот бот.'
      : 'Ссылка недействительна, истекла или привязка конфликтует. Получите новую в профиле.',
      { reply_markup: { remove_keyboard: true } });
    return;
  }

  if (contactPhone) {
    if(options.onBrowserContact){
      if(msg.from?.is_bot || msg.forward_origin || msg.forward_date || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name
        || String(msg.contact?.user_id)!==String(fromId)){
        await markCurrentOperation('error');
        await send(chatId,'Отправьте только собственный контакт системной кнопкой Telegram. Пересланные контакты не принимаются.');return;
      }
      const browser=await options.onBrowserContact({providerUserId:String(fromId),phone:contactPhone,name:[msg.from.first_name,msg.from.last_name].filter(Boolean).join(' ')});
      if(browser.context==='PROFILE_LINK'){
        await send(chatId,browser.ok
          ?browser.guestConfirmed?'Номер телефона подтверждён! Telegram подключён к вашему профилю. Теперь вам доступны бонусы и вход по коду.':'Telegram успешно привязан к вашему профилю! Теперь вы можете получать коды для входа в магазин через этот бот'
          :browser.error==='CONTACT_PHONE_MISMATCH'?'Не удалось привязать мессенджер, так как номер телефона не совпадает с учётной записью':'Не удалось привязать Telegram. Начните привязку заново в профиле.',{reply_markup:{remove_keyboard:true}});
        return;
      }
      if(browser.autoConfirmed){
        await send(chatId,'Номер телефона подтверждён. Вход будет завершён автоматически',{reply_markup:{remove_keyboard:true}});
        await send(chatId,'При последующих авторизациях вы будете получать код в этом боте');
        return;
      }
      if(browser.ok){
        await send(chatId,'Контакт подтверждён. Нажмите «Авторизоваться».',
          {reply_markup:{remove_keyboard:true}});
        await send(chatId,'Подтвердите именно начатый вами вход.',{reply_markup:{inline_keyboard:[[{text:'Авторизоваться',callback_data:`auth:${browser.reference}`}]]}});return;
      }
      if(browser.matched!==false){
        if(browser.error==='CUSTOMER_RELINK_PROOF_REQUIRED'){
          await send(chatId,'Для повторного подключения используйте тот Telegram-аккаунт, который был привязан раньше. Если он недоступен, восстановите доступ через магазин.');return;
        }
        console.warn('TELEGRAM_BROWSER_CONTACT_REJECTED',{tenantId:tenantBot.tenantId,reason:browser.error||'BROWSER_CONTACT_REJECTED'});
        const reason={CONTACT_PHONE_MISMATCH:'Номер собственного контакта отличается от введённого в магазине. Отмените вход и начните заново со своим номером.',ACCOUNT_PERSON_CONFLICT:'Обнаружена другая подтверждённая привязка. Доступ не выдан; требуется безопасное разрешение конфликта администратором.',CUSTOMER_PHONE_CONFLICT:'Номер и мессенджер относятся к разным карточкам. Автоматическое объединение запрещено; обратитесь к администратору.',REQUEST_EXPIRED:'Запрос истёк. Отмените вход в исходной вкладке, начните заново и передайте контакт в течение трёх минут.'}[browser.error];
        if(reason){await send(chatId,reason);return;}
        await send(chatId,browser.error==='CONTACT_REQUEST_AMBIGUOUS'?'Одновременно открыто несколько запросов входа. Отмените лишние запросы в исходных вкладках, затем отправьте свой контакт снова.':'Контакт не принят для входа. Создайте новый запрос в исходной карточке.');return;
      }
    }
    const result = typeof options.onAuthContact === 'function'
      ? await options.onAuthContact({ providerUserId: String(fromId), message: msg }) : { ok: false };
    await send(chatId, result?.ok
      ? result.phoneConflict
        ? 'Telegram привязан, но номер конфликтует с клиентскими данными. Обратитесь к администратору; вход по этому номеру пока недоступен.'
        : 'Номер подтверждён, Telegram привязан. Начните вход в исходной карточке и подтвердите новый запрос в боте.'
      : result?.error==='CONTACT_PHONE_MISMATCH'
        ? 'Не удалось привязать мессенджер, так как номер телефона не совпадает с учётной записью'
        : 'Контакт не подтверждён, запрос истёк или обнаружен конфликт. Отправьте только свой контакт по кнопке либо создайте новую ссылку в профиле.',
      result?.ok ? { reply_markup: { remove_keyboard: true } } : null);
    return;
  }

}

module.exports = { handleTenantTelegramUpdate };
