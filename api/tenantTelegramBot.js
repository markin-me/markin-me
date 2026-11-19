const { createServiceTextRenderer, employeeAuthResponse } = require('./botContentTemplates');
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

async function sendTelegramMessage(token, chatId, text, extra = null, onTelegramApiTiming = null, employeeOperation = false) {
  const body = { chat_id: chatId, text: String(text || '') };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  const data = await requestTelegramApi(`${TELEGRAM_API}${token}`, 'sendMessage', body, { onTiming: onTelegramApiTiming });
  await recordCurrentServiceMessage({
    provider: 'tg', chatId: data.result?.chat?.id || chatId, messageId: data.result?.message_id,
    hasReplyKeyboard: Boolean(body.reply_markup?.keyboard), hasInlineKeyboard: Boolean(body.reply_markup?.inline_keyboard),
    removesEmployeeReplyKeyboard: employeeOperation && Boolean(body.reply_markup?.remove_keyboard),
  });
  return data.result;
}

async function handleTenantTelegramUpdate(db, helpers, tenantBot, upd, options = {}) {
  const serviceText = createServiceTextRenderer(db, tenantBot.tenantId, Number(tenantBot.storeId || 1), 'tg');
  const send = (chatId, text, extra = null) => sendTelegramMessage(
    tenantBot.token, chatId, text, extra, options.onTelegramApiTiming, options.employeeOperation
  );
  const customerResult = async (chatId, result) => {
    const employee=employeeAuthResponse({...result,accountType:result.accountType || (options.employeeOperation?'employee':undefined)},'tg');
    if(employee){
      if(employee.text){
        const reply_markup=employee.button ? employee.contact
          ? {keyboard:[[{text:employee.button,request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}
          : {inline_keyboard:[[{text:employee.button,callback_data:'auth:'+employee.reference}]]}
          : {remove_keyboard:true};
        await send(chatId,employee.text,{reply_markup});
        if(employee.phase)await options.onCustomerPrompt?.(result,employee.phase);
      }
      return true;
    }
    if(result.silent || result.guestConfirmed)return true;
    if (!result.ok || result.accountType !== 'customer' && result.context!=='PROFILE_LINK') return false;
    const sendPrompt = async (phase,text,extra) => {
      await send(chatId,text,extra);
      await options.onCustomerPrompt?.(result,phase);
    };
    if(result.linkConfirmation || result.purpose==='profile_link' && result.consentAccepted){
      await sendPrompt('final','Для привязки мессенджера нажмите кнопку „Привязать“.',
        {reply_markup:{inline_keyboard:[[{text:'Привязать',callback_data:`auth:${result.reference}`}]]}});
      return true;
    }
    if((result.purpose==='profile_link' || result.context==='PROFILE_LINK') && result.contactRequired){
      await sendPrompt('contact','Для привязки мессенджера нажмите кнопку „Привязать“.',
        {reply_markup:{keyboard:[[{text:'Привязать',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});return true;
    }
    if(result.purpose==='profile_link' || result.context==='PROFILE_LINK')return false;
    if(result.confirmed || result.autoConfirmed)return true;
    if (result.phoneChoiceRequired) {
      const text='Номер телефона в Telegram отличается от номера, указанного в магазине.\n\nАвторизоваться под другим номером?';
      await sendPrompt('choice',text,{reply_markup:{inline_keyboard:[[{text:'Да',callback_data:`auth:${result.reference}:yes`},{text:'Нет',callback_data:`auth:${result.reference}:no`}]]}});
    } else if (result.cancelled) await send(chatId,'Авторизация отменена.',{reply_markup:{remove_keyboard:true}});
    else if (result.contactRequired) await sendPrompt('contact','Для авторизации нажмите кнопку „Авторизоваться“.',
      {reply_markup:{keyboard:[[{text:'Авторизоваться',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
    else return false;
    return true;
  };
  const callback=upd?.callback_query;
  if(callback && /^auth:(?:b_[A-Za-z0-9_-]{40}|[cr]_[A-Za-z0-9_-]{43})(?::(?:yes|no))?$/.test(String(callback.data)) && options.onBrowserAuth){
    if(callback.message?.chat?.type!=='private' || String(callback.message.chat.id)!==String(callback.from?.id) || callback.from?.is_bot)return;
    const result=await options.onBrowserAuth({providerUserId:String(callback.from.id),token:callback.data.slice(5).split(':')[0],confirm:true,phoneChoice:callback.data.split(':')[2] || null});
    if(result.accountType==='customer' && result.ok || result.context==='PROFILE_LINK'){
      if(result.context==='PROFILE_LINK' && !result.silent && !result.guestConfirmed){
        const text=result.ok?'Telegram успешно привязан. Вернитесь в магазин.':result.error==='CONTACT_PHONE_MISMATCH'?'Номер телефона в Telegram отличается от номера вашего профиля. Привязка невозможна.':'Не удалось привязать Telegram. Начните привязку заново в профиле.';
        await send(callback.from.id,text);
      }else await customerResult(callback.from.id,result);
      if(result.consentAccepted || result.cancelled || result.context==='PROFILE_LINK'){
        await options.onCustomerControlsUsed?.(callback.message.message_id);
      }
      await requestTelegramApi(`${TELEGRAM_API}${tenantBot.token}`,'answerCallbackQuery',{callback_query_id:callback.id},{onTiming:options.onTelegramApiTiming})
        .catch(error=>console.warn('CUSTOMER_CALLBACK_ACK_FAILED',{provider:'tg',reason:error.code || error.name}));
      return;
    }
    if(options.employeeOperation || employeeAuthResponse(result,'tg')){
      await customerResult(callback.from.id,result);
      if(result.confirmed)await options.onCustomerControlsUsed?.(callback.message.message_id);
      await requestTelegramApi(`${TELEGRAM_API}${tenantBot.token}`,'answerCallbackQuery',{callback_query_id:callback.id},{onTiming:options.onTelegramApiTiming});
      return;
    }
    await requestTelegramApi(`${TELEGRAM_API}${tenantBot.token}`, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: result.ok ? 'Вход подтверждён' : 'Запрос истёк или доступ не разрешён',
    }, { onTiming: options.onTelegramApiTiming });
    await send(callback.from.id,result.ok
      ? result.purpose==='password_reset'?'✅ Подтверждение смены пароля принято. Вернитесь в исходную вкладку CRM.':await serviceText('auth_success', 'Подтверждение принято. Вернитесь в исходную вкладку — CRM завершит вход там.')
      :result.error==='EMPLOYEE_MESSENGER_NOT_LINKED'?'Привязка не подтверждена. Начните вход заново в исходной карточке.'
      :await serviceText('request_error', 'Вход не подтверждён. Запрос истёк, привязка конфликтует или требуется обновление CRM. Вернитесь в исходную карточку входа.'));
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
  if(options.employeeOperation && options.loginEnabled===false)return;
  if (options.loginEnabled === false) {
    if (payload) {
      await markCurrentOperation('error');
      await send(chatId, 'Вход через бота отключён в настройках магазина.');
    }
    if (payload) return;
  }

  if(payload.startsWith('b_') && options.onBrowserAuth){
    const result=await options.onBrowserAuth({providerUserId:String(fromId),token:payload,confirm:false});
    if(await customerResult(chatId,{...result,reference:result.reference || payload}))return;
    if(result.ok&&result.contactRequired){
      await send(chatId,await serviceText('contact_request', 'Чтобы авторизоваться в системе, нажмите «Авторизоваться».'),
        {reply_markup:{keyboard:[[{text:'Авторизоваться',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
      return;
    }
    await send(chatId,result.ok?await serviceText('confirmation_pending', 'Подтвердите вход в исходном браузере. Если вы не начинали вход, не нажимайте кнопку.'):await serviceText('request_expired', 'Запрос истёк. Начните вход заново в магазине.'),
      result.ok&&!result.confirmed?{reply_markup:{inline_keyboard:[[{text:result.purpose==='password_reset'?'✅ Подтвердить смену пароля':'✅ Авторизоваться',callback_data:`auth:${payload}`}]]}}:{reply_markup:{remove_keyboard:true}});
    return;
  }

  if (payload.startsWith('l_') && typeof options.onAuthLogin === 'function') {
    const result = await options.onAuthLogin({ providerUserId: String(fromId), token: payload });
    if(options.employeeOperation)return;
    if (!result.ok || result.alreadySent) await send(chatId,
      result.alreadySent ? 'Код уже отправлен. Он действует 3 минуты. Для нового кода вернитесь на карточку входа.'
        : result.error === 'CODE_DELIVERY_FAILED' ? await serviceText('request_error', 'Не удалось доставить код. Создайте новый запрос на карточке входа.')
        : 'Запрос входа истёк или привязка не подтверждена. Вернитесь на карточку входа. Сотруднику нужно сначала войти с паролем и привязать мессенджер в профиле.');
    return;
  }
  if (payload.startsWith('a_') && typeof options.onAuthLink === 'function') {
    const result = await options.onAuthLink({ provider: 'tg', providerUserId: String(fromId), token: payload });
    if(await customerResult(chatId,result))return;
    if (result?.contactRequired) {
      await send(chatId, result.context==='PROFILE_LINK'?'Для привязки мессенджера нажмите кнопку „Привязать“.':await serviceText('contact_request', 'Чтобы привязать мессенджер к учётной записи, нажмите кнопку «Привязать».'), {
        reply_markup: { keyboard: [[{ text: 'Привязать', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      });
      return;
    }
    await send(chatId, result?.ok
      ? result.context==='PROFILE_LINK'
        ? 'Telegram успешно привязан. Вернитесь в магазин.'
        : await serviceText('link_success', 'Telegram успешно привязан. Вернитесь в CRM. Теперь вы можете получать коды для входа через этот бот.')
      : 'Ссылка недействительна, истекла или привязка конфликтует. Получите новую в профиле.',
      { reply_markup: { remove_keyboard: true } });
    return;
  }

  if (contactPhone) {
    if(options.onBrowserContact){
      if(msg.from?.is_bot || msg.forward_origin || msg.forward_date || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name
        || String(msg.contact?.user_id)!==String(fromId)){
        if(options.employeeOperation)return;
        if(!options.customerContactEvent)await markCurrentOperation('error');
        await send(chatId,'Отправьте только собственный контакт системной кнопкой Telegram. Пересланные контакты не принимаются.');return;
      }
      const browser=await options.onBrowserContact({providerUserId:String(fromId),phone:contactPhone,messageDate:msg.date,name:[msg.from.first_name,msg.from.last_name].filter(Boolean).join(' ')});
      if(await customerResult(chatId,browser))return;
      if(browser.context==='PROFILE_LINK'){
        await send(chatId,browser.ok
          ?'Telegram успешно привязан. Вернитесь в магазин.'
          :browser.error==='CONTACT_PHONE_MISMATCH'?'Номер телефона в Telegram отличается от номера вашего профиля. Привязка невозможна.':'Не удалось привязать Telegram. Начните привязку заново в профиле.',{reply_markup:{remove_keyboard:true}});
        return;
      }
      if(browser.accountType==='employee' && browser.confirmed)return;
      if(browser.autoConfirmed){
        await send(chatId,await serviceText('auth_success', 'Номер телефона подтверждён. Вход будет завершён автоматически'),{reply_markup:{remove_keyboard:true}});
        await send(chatId,'При последующих авторизациях вы будете получать код в этом боте');
        return;
      }
      if(browser.ok){
        await send(chatId,await serviceText('confirmation_pending', 'Контакт подтверждён. Нажмите «Авторизоваться».'),
          {reply_markup:{remove_keyboard:true}});
        await send(chatId,await serviceText('confirmation_pending', 'Подтвердите именно начатый вами вход.'),{reply_markup:{inline_keyboard:[[{text:'Авторизоваться',callback_data:`auth:${browser.reference}`}]]}});return;
      }
      if(browser.matched!==false){
        console.warn('TELEGRAM_BROWSER_CONTACT_REJECTED',{tenantId:tenantBot.tenantId,reason:browser.error||'BROWSER_CONTACT_REJECTED'});
        const reason={CONTACT_PHONE_MISMATCH:'Номер собственного контакта отличается от введённого в магазине. Отмените вход и начните заново со своим номером.',ACCOUNT_PERSON_CONFLICT:'Обнаружена другая подтверждённая привязка. Доступ не выдан; требуется безопасное разрешение конфликта администратором.',CUSTOMER_PHONE_CONFLICT:'Номер и мессенджер относятся к разным карточкам. Автоматическое объединение запрещено; обратитесь к администратору.',REQUEST_EXPIRED:await serviceText('request_expired', 'Запрос истёк. Отмените вход в исходной вкладке, начните заново и передайте контакт в течение трёх минут.')}[browser.error];
        if(reason){await send(chatId,reason);return;}
        await send(chatId,browser.error==='CONTACT_REQUEST_AMBIGUOUS'?'Одновременно открыто несколько запросов входа. Отмените лишние запросы в исходных вкладках, затем отправьте свой контакт снова.':'Контакт не принят для входа. Создайте новый запрос в исходной карточке.');return;
      }
    }
    const result = typeof options.onAuthContact === 'function'
      ? await options.onAuthContact({ providerUserId: String(fromId), message: msg }) : { ok: false };
    if (result?.silent) return;
    if(await customerResult(chatId,result))return;
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
