(function () {
  "use strict";
  const pendingKey=context=>`messenger-auth:${context}:${document.querySelector('meta[name="tenant_id"]')?.content||'host'}`;
  function pendingRequest(context){
    try{const r=JSON.parse(sessionStorage.getItem(pendingKey(context))||'null');return r&&/^[A-Za-z0-9_-]{43}$/.test(r.id)&&Date.now()-r.at<(context==='customer'?600000:180000)?r:null;}
    catch(error){console.warn('AUTH_PENDING_STORAGE_UNAVAILABLE');return null;}
  }
  const providerWindows=new Map();
  function openProviderWindow(url){
    const existing=url?providerWindows.get(url):null;
    if(existing&&!existing.closed){existing.location.href=url;existing.focus();return existing;}
    const popup=window.open(url||'about:blank','_blank');
    if(!popup)return null;
    if(url){providerWindows.set(url,popup);popup.opener=null;return popup;}
    try{
      popup.document.documentElement.lang='ru';
      popup.document.title='Переход в мессенджер';
      const text=popup.document.createElement('p');
      text.textContent='Подготавливаем безопасную ссылку. Если переход не произошёл, вернитесь в исходную вкладку: там будет ссылка или причина ошибки.';
      popup.document.body.replaceChildren(text);
      popup.opener=null;
    }catch(error){console.error('AUTH_POPUP_INIT_FAILED',error.name);}
    return popup;
  }
  function create(options = {}) {
    const {context='customer',onSuccess,dependencies:d={}}=options;
    if(context==='customer'&&document.body.classList.contains('page-kso'))return createRecoveryCard(options);
    if(!['customer','employee'].includes(context))throw new Error('INVALID_AUTH_CONTEXT');
    const employee=context==='employee',recovery=employee&&options.purpose==='password_reset',api=d.apiJson;
    if(typeof api!=='function')throw new Error('AUTH_CARD_API_REQUIRED');
    const root=document.createElement('div');root.className='shop-auth shop-auth--browser';root.dataset.authContext=context;
    const title=document.createElement('div');title.className='shop-auth-title';title.textContent=recovery?'Восстановить пароль':employee?'Вход для сотрудников':'Войти';root.append(title);
    const methods=document.createElement('div');methods.className='shop-auth-methods';root.append(methods);
    const form=document.createElement('form');form.className='shop-auth-form hidden';root.append(form);
    if(!employee)root.insertBefore(form,methods);
    const message=document.createElement('div');message.className='shop-auth-text muted';message.setAttribute('role','status');message.setAttribute('aria-live','polite');root.append(message);
    const errorText=code=>({BROWSER_CONTACT_MIGRATION_REQUIRED:'Вход через мессенджер временно недоступен. Попробуйте позже.',EMPLOYEE_CONTACT_CONFLICT:'Не удалось подтвердить номер. Обратитесь к администратору.',PASSWORD_CHANGE_REQUIRED:'Сначала смените пароль обычным способом входа.',ACCOUNT_PERSON_CONFLICT:'Не удалось подтвердить профиль. Обратитесь в магазин.',MAX_TLS_UNTRUSTED:'MAX временно недоступен. Попробуйте позже.',MAX_WEBHOOK_NOT_READY:'MAX временно недоступен. Попробуйте позже.',MAX_API_UNAVAILABLE:'MAX временно недоступен. Попробуйте позже.',REQUEST_EXPIRED:'Запрос истёк. Начните вход заново.',REQUEST_INVALID:'Начните вход заново в этой вкладке.',LOGIN_RATE_LIMITED:'Слишком много попыток. Попробуйте позже.',INVALID_CREDENTIALS:'Не удалось войти. Проверьте введённые данные.',TENANT_BOT_UNAVAILABLE:'Мессенджер временно недоступен. Попробуйте позже.',BOT_TENANT_CONFLICT:'Вход через мессенджер временно недоступен. Попробуйте позже.',EMPLOYEE_MESSENGER_NOT_LINKED:'Подтвердите личность логином и паролем в этой карточке.'})[code]||'Не удалось выполнить вход. Попробуйте снова.';
    const input=(label,type,placeholder)=>{const wrap=document.createElement('label');wrap.className='shop-auth-field';wrap.append(document.createTextNode(label));const el=document.createElement('input');el.className='control';el.type=type;el.placeholder=placeholder;el.required=true;wrap.append(el);form.append(wrap);return el;};
    const identity=input(recovery?'Новый пароль':employee?'Логин':'Номер телефона',recovery?'password':employee?'text':'tel',recovery?'От 12 символов':employee?'Логин сотрудника@компания':'+7 (999) 999-99-99');
    identity.autocomplete=employee?'username':'tel';identity.autocapitalize='off';
    if(!employee)root.insertBefore(identity.parentElement,form);
    if(!employee){identity.value=options.phone||'+7';identity.inputMode='tel';identity.addEventListener('input',()=>d.enforcePhonePrefix?.(identity));}
    const secret=input(recovery?'Повторите пароль':employee?'Пароль':'Дата рождения',employee?'password':'text',recovery?'Повторите новый пароль':employee?'Пароль':'ДД.ММ.ГГГГ');
    if(recovery){identity.autocomplete='new-password';secret.autocomplete='new-password';identity.minLength=12;secret.minLength=12;form.classList.remove('hidden');}
    if(!recovery)secret.autocomplete=employee?'current-password':'bday';if(!employee){secret.inputMode='numeric';secret.addEventListener('input',()=>{if(customerPhase==='birthday')d.handleBirthdayInput?.(secret);else secret.value=secret.value.replace(/\D/g,'').slice(0,4);});}
    const submit=document.createElement('button');submit.type='submit';submit.className='btn btn-primary';submit.textContent=recovery?'Подтвердить в мессенджере':'Войти';form.append(submit);
    const codeWrap=document.createElement('div');codeWrap.className='shop-auth-code-wrap hidden';
    const codeMeta=document.createElement('div');codeMeta.className='shop-auth-code-meta hidden';
    const codeInputs=[];
    if(!employee){
      for(let i=0;i<4;i++){
        const cell=document.createElement('input');cell.type='text';cell.inputMode='numeric';cell.maxLength=4;
        cell.className='shop-auth-code-cell';cell.autocomplete=i===0?'one-time-code':'off';cell.setAttribute('aria-label',`Цифра ${i+1} кода`);
        codeInputs.push(cell);codeWrap.append(cell);
      }
      form.insertBefore(codeWrap,submit);
      form.insertBefore(codeMeta,submit);
    }
    const progress=document.createElement('div');progress.className='shop-auth-text muted';progress.setAttribute('role','status');root.append(progress);
    let disposed=false,requestId='',timer=null,checking=false,busy=false,deadlineAt=0,credentialBinding=false;
    let customerPhase='phone',codeRequest='',codeProvider='',resendAt=0,customerRun=0;
    const otherProviderRequests=new Set();
    let codeExpiryTimer=null;
    const stopCodeCountdown=()=>{clearInterval(codeExpiryTimer);codeExpiryTimer=null;};
    const startCodeCountdown=seconds=>{
      stopCodeCountdown();
      const until=Date.now()+Math.max(0,Number(seconds)||0)*1000;
      const countdown=document.createElement('span');codeMeta.append(countdown);
      const update=()=>{
        const remaining=Math.max(0,Math.ceil((until-Date.now())/1000));
        countdown.textContent=remaining?` Действует ещё ${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`:' Код истёк. Запросите новый.';
        if(!remaining)stopCodeCountdown();
      };
      update();if(until>Date.now())codeExpiryTimer=setInterval(update,1000);
    };
    let phoneTimer=null,phoneController=null,lastPhone='',lastCode='',observedPhone='7',lookupInFlight=false;
    const retryButton=document.createElement('button');retryButton.type='button';retryButton.className=employee?'btn hidden':'btn btn-primary';retryButton.textContent='Продолжить';retryButton.disabled=employee||!/^7\d{10}$/.test(identity.value.replace(/\D/g,''));if(!employee)root.insertBefore(retryButton,form);
    const customerError=error=>{
      methods.classList.remove('hidden');
      guestButton.classList.remove('hidden');
      if(error.payload?.delivery_failed){
        customerStep('methods');root.classList.add('shop-auth--code');retryButton.classList.add('hidden');
        alternative.classList.add('hidden');resendButton.classList.add('hidden');switchButton.classList.add('hidden');
        buttons.forEach(button=>{
          button.classList.toggle('hidden',!error.payload.link_channels?.includes(button.dataset.provider));
          button.disabled=false;button.dataset.codeChannel='false';
        });
        message.textContent='Не удалось отправить код. Подтвердите номер через другой мессенджер или войдите как гость.';
        const unconfirmedButton=buttons.find(button=>error.payload.link_channels?.includes(button.dataset.provider));
        if(unconfirmedButton)setTimeout(()=>{if(!disposed&&!busy)unconfirmedButton.click();},0);
        return;
      }
      if(customerPhase==='phone'){
        buttons.forEach(button=>button.classList.add('hidden'));
        alternative.classList.add('hidden');resendButton.classList.add('hidden');switchButton.classList.add('hidden');
      }
      if(error.message==='CUSTOMER_MESSENGER_NOT_AVAILABLE'){
        message.textContent='Номер уже подтверждён, но нет доступного привязанного мессенджера. Обратитесь в магазин для восстановления доступа.';
        customerStep('methods');methods.classList.remove('hidden');
        buttons.forEach(button=>button.classList.add('hidden'));
        alternative.classList.add('hidden');resendButton.classList.add('hidden');switchButton.classList.add('hidden');
        guestButton.classList.remove('hidden');return;
      }
      message.textContent=({PHONE_REQUIRED:'Введите номер телефона.',CODE_INVALID:'Неверный четырёхзначный код.',CODE_EXPIRED:'Код истёк. Запросите новый.',CODE_ALREADY_USED:'Этот код уже использован.',CODE_ATTEMPTS_EXCEEDED:'Лимит попыток исчерпан. Запросите новый код.',CODE_RATE_LIMITED:'Слишком много запросов кода. Попробуйте позже.',CODE_RESEND_TOO_SOON:'Подождите минуту перед повторной отправкой.',CODE_DELIVERY_FAILED:'Код не доставлен. Повторите отправку или выберите другой доступный канал.',TELEGRAM_BOT_START_REQUIRED:'Откройте Telegram-бота магазина и нажмите Start, затем повторите отправку.',CUSTOMER_CODE_REQUIRED:'Для подтверждённого номера нужен код. Начните вход заново.',CONTACT_PHONE_MISMATCH:'Поделитесь контактом с тем же номером, который указан в карточке входа.'})[error.message]||errorText(error.message);
      if(error.payload?.fallback_available){methods.classList.remove('hidden');buttons.forEach(b=>b.classList.add('hidden'));alternative.classList.add('hidden');switchButton.classList.remove('hidden');switchButton.dataset.provider='tg';switchButton.textContent='Отправить в Telegram';}
    };
    const customerStep=phase=>{
      stopCodeCountdown();
      root.classList.toggle('shop-auth--code',phase==='code');
      customerPhase=phase;form.classList.toggle('hidden',!['code','birthday'].includes(phase));
      if(phase==='phone'||phase==='code')delete root.dataset.existingUnverified;
      secret.parentElement.classList.toggle('hidden',phase!=='birthday');secret.required=phase==='birthday';
      codeWrap.classList.toggle('hidden',phase!=='code');codeInputs.forEach(cell=>{cell.value='';});lastCode='';
      codeWrap.classList.remove('is-verifying');
      codeMeta.classList.toggle('hidden',phase!=='code');
      secret.value='';secret.maxLength=phase==='code'?4:10;secret.autocomplete=phase==='code'?'one-time-code':'bday';
      secret.parentElement.firstChild.textContent=phase==='code'?'Код из бота':'Дата рождения';secret.placeholder=phase==='code'?'0000':'ДД.ММ.ГГГГ';
      submit.textContent=phase==='phone'?'Продолжить':phase==='methods'?'Изменить номер':'Войти';
      submit.classList.toggle('btn-primary',phase!=='methods');
      submit.classList.toggle('hidden',phase!=='birthday');
      identity.readOnly=false;
      root.querySelector('[data-auth-cancel]')?.classList.toggle('hidden',phase==='phone');
    };
    const customerStart=async provider=>{
      const run=++customerRun;
      const phone=identity.value;
      phoneController?.abort();phoneController=new AbortController();const controller=phoneController;
      const timeout=setTimeout(()=>controller.abort(),15000);
      let result;
      try{result=await api('/api/public/auth/phone-flow/start',{method:'POST',signal:controller.signal,body:{phone,provider}});}finally{clearTimeout(timeout);}
      if(disposed||run!==customerRun)return;
      retryButton.classList.add('hidden');
      methods.classList.remove('hidden');
      buttons.forEach(b=>b.classList.toggle('hidden',result.mode==='code'||!result.channels.includes(b.dataset.provider)));
      alternative.classList.toggle('hidden',result.mode==='code'||!result.birthday_allowed);guestButton.classList.remove('hidden');
      if(result.mode==='code'){
        codeRequest=result.request_id;codeProvider=result.provider;resendAt=Date.now()+Number(result.resend_after??60)*1000;customerStep('code');
        resendButton.classList.remove('hidden');switchButton.classList.add('hidden');
        buttons.forEach(button=>{
          button.classList.toggle('hidden',button.dataset.provider===result.provider);
          button.disabled=!(result.link_channels||result.channels).includes(button.dataset.provider);
          button.dataset.codeChannel=String(result.channels.includes(button.dataset.provider));
          button.title=button.disabled?'Этот мессенджер не привязан или недоступен для номера':'';
        });
        codeMeta.textContent=`Код отправлен в ${result.provider==='max'?'MAX':'Telegram'}.`;message.textContent='';codeInputs[0]?.focus();
        startCodeCountdown(result.expires_in);
      }else{customerStep('methods');root.dataset.existingUnverified=String(result.customer_exists===true);resendButton.classList.add('hidden');switchButton.classList.add('hidden');message.textContent=result.relink_required?'':'Подтвердите номер в мессенджере или продолжите как гость.';}
    };
    const remember=()=>{if(recovery)return;try{if(requestId)sessionStorage.setItem(pendingKey(context),JSON.stringify({id:requestId,at:Date.now()}));else sessionStorage.removeItem(pendingKey(context));}catch(error){console.warn('AUTH_PENDING_STORAGE_UNAVAILABLE');}};
    const endpoint=employee?'/api/auth/messenger-browser':'/api/public/auth/messenger-browser';
    const stop=()=>{if(timer)clearTimeout(timer);timer=null;};
    const finish=async result=>{
      if(disposed)return;
      stop();
      for(const id of otherProviderRequests)void api(endpoint+'/status',{method:'POST',body:{request_id:id,cancel:true}}).catch(()=>console.warn('AUTH_CANCEL_NOT_CONFIRMED'));
      otherProviderRequests.clear();requestId='';remember();
      if(employee){onSuccess?.(result);return;}
      if(result.token){d.setCustomerToken(result.token);d.markCustomerTokenVerified(String(result.token));}
      if(result.customer)d.setCustomerCache(result.customer);
      await d.refreshAddressState?.({force:true});
      if(typeof window.refreshShopHomeBonusConfigUi==='function'){
        await window.refreshShopHomeBonusConfigUi({skipPendingModal:true});
      }
      if(disposed)return;
      await onSuccess?.(result.customer || await d.fetchMeSafe?.());
      if(window.AppModal?.body?.contains(root))window.AppModal.close('auth-success');
    };
    const check=async()=>{
      if(disposed||!requestId||checking||document.hidden)return;checking=true;stop();
      if(employee&&Date.now()>=deadlineAt){checking=false;cancel();if(!recovery)form.classList.add('hidden');message.textContent=errorText('REQUEST_EXPIRED');return;}
      const checkedId=requestId;
      try{
        for(const id of otherProviderRequests){
          const previous=await api(endpoint+'/status',{method:'POST',signal:AbortSignal.timeout(15000),body:{request_id:id,chat_guest_client_id:d.getGuestChatClientIdForAuth?.()}});
          if(disposed||requestId!==checkedId)return;
          if(previous.state==='confirmed'){otherProviderRequests.delete(id);otherProviderRequests.add(checkedId);await finish(previous);return;}
          if(['cancelled','expired','consumed'].includes(previous.state))otherProviderRequests.delete(id);
        }
        const result=await api(endpoint+'/status',{method:'POST',signal:AbortSignal.timeout(15000),body:{request_id:checkedId,new_password:recovery?identity.value:undefined,chat_guest_client_id:employee?undefined:d.getGuestChatClientIdForAuth?.()}});
        if(disposed || requestId!==checkedId)return;
        if(result.state==='confirmed')await finish(result);
        else if(result.required_action){
          progress.textContent=employee?({share_contact:'В боте поделитесь собственным контактом системной кнопкой. На компьютере можно открыть ту же ссылку на телефоне, не закрывая эту вкладку.',employee_credentials:'Контакт получен. Один раз подтвердите личность существующим логином и паролем здесь, затем нажмите «Авторизоваться» в боте.',confirm_in_bot:'Подтвердите этот запрос кнопкой «Авторизоваться» в боте.'})[result.required_action] || '':'';
          if(employee&&!recovery&&result.required_action==='employee_credentials'){credentialBinding=true;form.classList.remove('hidden');submit.textContent='Подтвердить личность';}
        }
      }catch(e){
        if(disposed || requestId!==checkedId)return;
        if(['TypeError','TimeoutError','AbortError'].includes(e.name)||e.httpStatus>=500&&['DB_ERROR','MESSENGER_AUTH_ERROR','REQUEST_FAILED'].includes(e.message)){message.textContent='CRM пока не завершила проверку. Повторим запрос; вход ещё не завершён.';}
        else{message.textContent=e.message==='CUSTOMER_PHONE_CONFLICT'?'Найден конфликт карточек с одним номером. Нужна проверка владельца магазина.':errorText(e.message);cancel();if(employee&&!recovery)form.classList.add('hidden');}
      }
      finally{checking=false;if(!disposed&&requestId)timer=setTimeout(check,2000);}
    };
    let activeProviderLink=null;
    const openCustomerProvider=url=>{
      if(activeProviderLink?.url===url&&activeProviderLink.popup&&!activeProviderLink.popup.closed){activeProviderLink.popup.location.href=url;activeProviderLink.popup.focus();return activeProviderLink.popup;}
      return openProviderWindow(url);
    };
    const cancel=()=>{stop();if(!employee)customerRun++;activeProviderLink=null;credentialBinding=false;progress.textContent='';submit.textContent=recovery?'Подтвердить в мессенджере':'Войти';const id=requestId;requestId='';remember();if(id)api(endpoint+'/status',{method:'POST',signal:AbortSignal.timeout(15000),body:{request_id:id,cancel:true}}).catch(()=>{console.warn('AUTH_CANCEL_NOT_CONFIRMED');});};
    const buttons=[];
    for(const provider of (employee?['tg','max']:['max','tg'])){
      const button=document.createElement('button');button.type='button';button.className='shop-auth-social-btn shop-auth-method';button.dataset.provider=provider;
      const icon=document.createElement('img');icon.src='/static/uploads/auth/'+(provider==='tg'?'telegram':'max')+'-auth.png';icon.alt='';button.append(icon);
      if(employee)button.append(document.createTextNode(provider==='tg'?'Войти через Telegram':'Войти через MAX'));
      else{
        const label=document.createElement('span');label.className='shop-auth-method-label';
        const action=document.createElement('span');action.textContent='Войти';
        const channel=document.createElement('span');channel.textContent=provider==='max'?'через MAX':'через Telegram';
        label.append(action,channel);button.append(label);
      }
      methods.append(button);buttons.push(button);
      button.addEventListener('click',async()=>{
        if(disposed)return;
        if(!employee&&customerPhase==='code'&&button.dataset.codeChannel==='true'){
          if(busy)return;busy=true;button.disabled=true;button.classList.add('is-loading');
          try{await customerStart(provider);}catch(error){customerError(error);}
          finally{busy=false;button.disabled=false;button.classList.remove('is-loading');}
          return;
        }
        if(!employee&&requestId&&activeProviderLink?.provider===provider){activeProviderLink.popup=openCustomerProvider(activeProviderLink.url);return;}
        if(recovery&&(identity.value.length<12||identity.value!==secret.value)){message.textContent='Введите одинаковый новый пароль от 12 символов в оба поля.';form.classList.remove('hidden');identity.focus();return;}
        if(busy)return;
        if(!employee&&requestId&&activeProviderLink?.provider!==provider){otherProviderRequests.add(requestId);requestId='';}
        cancel();const run=customerRun;busy=true;buttons.forEach(b=>b.disabled=true);button.classList.add('is-loading');if(employee)form.classList.add('hidden');
        let popup=employee?openProviderWindow():null;
        const label=button.querySelector('.shop-auth-method-label'),labelParts=label?[...label.childNodes]:[];
        if(!employee){button.setAttribute('aria-busy','true');label.textContent=provider==='tg'?'Открываем Telegram…':'Открываем MAX…';}
        message.textContent=employee?'Создаём запрос входа…':'';
        try{const result=await api(endpoint+'/start',{method:'POST',body:{provider,phone:employee?undefined:identity.value,purpose:recovery?'password_reset':'login'},signal:AbortSignal.timeout(15000)});if(disposed||!employee&&run!==customerRun){popup?.close();return;}
          requestId=result.request_id;deadlineAt=Date.now()+180000;remember();const url=new URL(result.bot_link);
          if(url.protocol!=='https:' || !['t.me','max.ru'].includes(url.hostname))throw new Error('BOT_LINK_INVALID');
          if(employee){if(popup)popup.location.replace(url.href);}
          else{popup=openCustomerProvider(url.href);activeProviderLink={provider,url:url.href,popup};}
          message.replaceChildren(document.createTextNode(employee?'Нажмите «Авторизоваться» в боте, затем вернитесь сюда. ':''));
          const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener';link.textContent=employee?'Открыть бота':provider==='tg'?'Открыть Telegram':'Открыть MAX';
          if(!employee){link.className='btn shop-auth-open-provider';link.addEventListener('click',event=>{event.preventDefault();if(activeProviderLink)activeProviderLink.popup=openCustomerProvider(url.href);});}
          if(employee||!popup)message.append(link);timer=setTimeout(check,1500);
        }catch(e){popup?.close();if(disposed||!employee&&run!==customerRun)return;cancel();if(employee)message.textContent=errorText(e.message);else{customerStep('methods');customerError(e);}}finally{busy=false;buttons.forEach(b=>b.disabled=false);button.classList.remove('is-loading');button.removeAttribute('aria-busy');if(label){label.replaceChildren(...labelParts);if(requestId&&activeProviderLink?.provider===provider)label.textContent=provider==='tg'?'Открыть Telegram':'Открыть MAX';}}
      });
    }
    const alternative=document.createElement('button');alternative.type='button';alternative.className='btn btn-primary';alternative.textContent=recovery?'Задать новый пароль':employee?'По логину и паролю':'По телефону';methods.append(alternative);
    alternative.addEventListener('click',()=>{cancel();message.textContent='';if(!employee){customerStep('birthday');secret.focus();return;}form.classList.toggle('hidden');if(!form.classList.contains('hidden'))identity.focus();});
    const guestButton=document.createElement('button');guestButton.type='button';guestButton.className='btn shop-auth-guest';
    const guestTitle=document.createElement('span');guestTitle.textContent='Войти как гость';
    const guestHint=document.createElement('span');guestHint.className='shop-auth-guest-hint';guestHint.textContent='Без подтверждения номера';
    guestButton.append(guestTitle,guestHint);if(!employee)methods.append(guestButton);
    guestButton.addEventListener('click',async()=>{if(busy)return;const run=customerRun;busy=true;guestButton.disabled=true;try{const result=await api('/api/public/auth/guest',{method:'POST',body:{phone:identity.value}});if(!disposed&&run===customerRun)await finish(result);}catch(e){if(!disposed&&run===customerRun)message.textContent=errorText(e.message);}finally{busy=false;guestButton.disabled=false;}});
    const resendButton=document.createElement('button'),switchButton=document.createElement('button');
    for(const b of [resendButton,switchButton]){b.type='button';b.className='btn hidden';if(!employee)methods.append(b);}
    if(!employee)methods.insertBefore(switchButton,guestButton);
    resendButton.classList.add('shop-auth-resend');
    resendButton.textContent='Повторить отправку';switchButton.textContent='Использовать другой канал';
    for(const b of [resendButton,switchButton])b.addEventListener('click',async()=>{if(busy)return;if(b===resendButton&&Date.now()<resendAt){message.textContent='Повторная отправка доступна через минуту после предыдущей.';return;}busy=true;b.disabled=true;try{await customerStart(b===resendButton?codeProvider:b.dataset.provider);}catch(e){customerError(e);}finally{busy=false;b.disabled=false;}});
    if(!employee){customerStep('phone');methods.classList.add('hidden');alternative.textContent='Войти по дате рождения';}
    const lookupPhone=async(manual=false)=>{
      const phone=identity.value.replace(/\D/g,'');
      if(disposed||lookupInFlight||busy||phone.length!==11||phone[0]!=='7'||!manual&&phone===lastPhone)return;
      clearTimeout(phoneTimer);lookupInFlight=true;retryButton.disabled=true;
      lastPhone=phone;message.textContent='';retryButton.textContent='Проверяем…';retryButton.classList.remove('hidden');
      const run=customerRun+1;
      try{await customerStart();}catch(error){
        if(disposed||run!==customerRun||phone!==identity.value.replace(/\D/g,''))return;
        customerError(error);retryButton.classList.add('hidden');
      }finally{
        if(run===customerRun){lookupInFlight=false;retryButton.textContent='Продолжить';retryButton.disabled=!/^7\d{10}$/.test(identity.value.replace(/\D/g,''));}
      }
    };
    retryButton.addEventListener('click',()=>void lookupPhone(true));
    if(!employee){
      identity.addEventListener('input',()=>{
        const digits=identity.value.replace(/\D/g,'');if(digits===observedPhone)return;observedPhone=digits;
        clearTimeout(phoneTimer);phoneController?.abort();cancel();codeRequest='';lastPhone='';lastCode='';lookupInFlight=false;
        customerStep('phone');methods.classList.add('hidden');retryButton.textContent='Продолжить';retryButton.classList.remove('hidden');retryButton.disabled=!/^7\d{10}$/.test(digits);message.textContent='';
        phoneTimer=setTimeout(()=>void lookupPhone(),450);
      });
      const enterCode=()=>{
        const code=codeInputs.map(cell=>cell.value).join('');
        if(customerPhase==='code'&&code.length===4&&!busy&&code!==lastCode){lastCode=code;secret.value=code;form.requestSubmit();}
      };
      codeInputs.forEach((cell,index)=>{
        cell.addEventListener('input',()=>{
          const digits=cell.value.replace(/\D/g,'').slice(0,4);
          if(digits.length>1){for(let i=0;i<digits.length&&index+i<4;i++)codeInputs[index+i].value=digits[i];codeInputs[Math.min(3,index+digits.length)]?.focus();}
          else{cell.value=digits;if(digits&&index<3)codeInputs[index+1].focus();}
          enterCode();
        });
        cell.addEventListener('paste',event=>{
          const digits=event.clipboardData?.getData('text').replace(/\D/g,'').slice(0,4);if(!digits)return;
          event.preventDefault();const start=digits.length===4?0:index;
          for(let i=0;i<digits.length&&start+i<4;i++)codeInputs[start+i].value=digits[i];
          codeInputs[Math.min(3,start+digits.length)].focus();enterCode();
        });
        cell.addEventListener('keydown',event=>{
          if(event.key==='Backspace'&&!cell.value&&index>0){event.preventDefault();codeInputs[index-1].value='';codeInputs[index-1].focus();}
          if(event.key==='ArrowLeft'&&index>0){event.preventDefault();codeInputs[index-1].focus();}
          if(event.key==='ArrowRight'&&index<3){event.preventDefault();codeInputs[index+1].focus();}
        });
      });
    }
    form.addEventListener('submit',async event=>{event.preventDefault();if(recovery){message.textContent='Выберите Telegram или MAX для подтверждения смены пароля.';return;}if(busy)return;busy=true;submit.disabled=true;message.textContent='Выполняем вход…';
      const proofRequestId=credentialBinding?requestId:'';
      const submitRun=customerRun;
      if(!employee&&customerPhase!=='birthday'){
        const run=customerRun;
        if(customerPhase==='code'){codeWrap.classList.add('is-verifying');message.textContent='Выполняем вход…';}
        codeInputs.forEach(cell=>cell.disabled=true);
        try{
          if(customerPhase==='code'){
            const result=await api('/api/public/auth/phone-flow/verify',{method:'POST',body:{request_id:codeRequest,code:secret.value}});
            if(!disposed&&run===customerRun)await finish(result);
          }
          else if(customerPhase==='methods'){customerStep('phone');methods.classList.add('hidden');message.textContent='';}
          else await customerStart();
        }catch(e){if(!disposed&&run===customerRun){customerError(e);secret.value='';codeInputs.forEach(cell=>cell.value='');lastCode='';codeInputs[0]?.focus();}}finally{busy=false;submit.disabled=false;codeInputs.forEach(cell=>cell.disabled=false);if(run===customerRun)codeWrap.classList.remove('is-verifying');if(!disposed&&run===customerRun&&customerPhase==='code')codeInputs.find(cell=>!cell.value)?.focus();}return;
      }
      try{const result=await api(employee?'/api/auth/login':'/api/public/auth/login',{method:'POST',signal:AbortSignal.timeout(15000),body:employee?{login:identity.value.trim(),password:secret.value,messenger_request_id:proofRequestId||undefined}:{phone:identity.value,birthday:secret.value,chat_guest_client_id:d.getGuestChatClientIdForAuth?.()}});
        if(disposed || !employee&&submitRun!==customerRun || proofRequestId&&requestId!==proofRequestId)return;
        if(proofRequestId){secret.value='';credentialBinding=false;form.classList.add('hidden');message.textContent='Личность подтверждена. Нажмите «Авторизоваться» в боте.';void check();}
        else await finish(result);}
      catch(e){if(!disposed&&(employee||submitRun===customerRun))message.textContent=errorText(e.message);}finally{busy=false;submit.disabled=false;}
    });
    const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.dataset.authCancel='';cancelButton.className=employee?'auth-link-button':'btn hidden';cancelButton.textContent='Отменить';cancelButton.addEventListener('click',()=>{
      cancel();
      if(!employee){
        clearTimeout(phoneTimer);phoneController?.abort();lookupInFlight=false;lastPhone='';codeRequest='';lastCode='';
        customerStep('phone');methods.classList.add('hidden');
        retryButton.textContent='Продолжить';retryButton.classList.remove('hidden');
        retryButton.disabled=!/^7\d{10}$/.test(identity.value.replace(/\D/g,''));
        identity.focus();message.textContent='';
      }else message.textContent='Вход отменён. Можно выбрать способ снова.';
    });if(employee)root.append(cancelButton);
    const resume=()=>{if(!document.hidden)void check();};document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);
    root.dispose=()=>{disposed=true;stopCodeCountdown();clearTimeout(phoneTimer);phoneController?.abort();cancel();root.querySelectorAll('button,input').forEach(el=>el.disabled=true);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
    if(!recovery&&!options.phone){const pending=pendingRequest(context);if(pending){requestId=pending.id;deadlineAt=pending.at+180000;message.textContent='Проверяем ранее начатый вход…';timer=setTimeout(check,0);}}
    if(!employee){
      const header=document.createElement('div');header.className='shop-auth-customer-header';
      const content=document.createElement('div');content.className='shop-auth-customer-content';
      header.append(title,identity.parentElement,retryButton);
      content.append(...root.children);root.append(header,content);
    }
    return root;
  }
  function createRecoveryCard({ context = "customer", onSuccess, purpose = "login", dependencies = {} } = {}) {
    if (!["customer", "employee"].includes(context)) throw new Error("INVALID_AUTH_CONTEXT");
    const isEmployee = context === "employee";
    const {
      apiJson, normalizePhone, enforcePhonePrefix: enforceCustomerPhonePrefix,
      normalizeCompletedCustomerName, handleBirthdayInput, isValidBirthday, str,
      getGuestChatClientIdForAuth, setCustomerToken, markCustomerTokenVerified, setCustomerCache,
      fetchMeSafe, refreshAddressState, hasCompletedCustomerName, openRequiredCustomerNamePrompt,
      showToast, messengerErrorText
    } = dependencies;
    if (typeof apiJson !== "function") throw new Error("AUTH_CARD_API_REQUIRED");
    const enforcePhonePrefix = input => enforceCustomerPhonePrefix(input);
    let disposed = false;
    const isKsoAuth = !isEmployee && Boolean(document.body?.classList?.contains("page-kso"));
    const wrap = document.createElement("div");
    wrap.className = "shop-auth";
    wrap.dataset.authContext = context;
    if (isKsoAuth) wrap.classList.add("shop-auth--kso");

    const note = document.createElement("div");
    note.className = "shop-auth-text muted";
    note.textContent = "Введите телефон.";
    const notify = text => { note.textContent = text; };
    wrap.appendChild(note);

    const form = document.createElement("div");
    form.className = "shop-auth-form";

    const phoneLabel = document.createElement("label");
    phoneLabel.className = "field-label";
    phoneLabel.textContent = "Телефон";
    const phone = document.createElement("input");
    phone.className = "control";
    phone.type = "tel";
    phone.name = "shop-login-phone";
    phone.autocomplete = "off";
    phone.inputMode = "tel";
    phone.autocorrect = "off";
    phone.autocapitalize = "off";
    phone.spellcheck = false;
    phone.setAttribute("data-lpignore", "true");
    phone.setAttribute("data-form-type", "other");
    phone.value = "+7";
    phone.placeholder = "+7 (999) 999-99-99";
    phone.setAttribute("aria-label", phoneLabel.textContent);
    form.appendChild(phoneLabel);
    form.appendChild(phone);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-primary";
    nextBtn.style.width = "100%";
    nextBtn.textContent = "Продолжить";
    if (isEmployee) nextBtn.style.display = "none";
    form.appendChild(nextBtn);

    const ksoKeypad = document.createElement("div");
    ksoKeypad.className = "shop-auth-kso-keypad";
    if (!isKsoAuth) ksoKeypad.classList.add("hidden");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"].forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-auth-kso-key";
      btn.dataset.key = key;
      if (key === "backspace") {
        btn.setAttribute("aria-label", "Удалить цифру");
        btn.innerHTML = '<i class="fas fa-backspace" aria-hidden="true"></i>';
      } else if (key === "clear") {
        btn.setAttribute("aria-label", "Очистить номер");
        btn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
      } else {
        btn.textContent = key;
      }
      ksoKeypad.appendChild(btn);
    });
    form.appendChild(ksoKeypad);

    const maxLoginBtn = document.createElement("button");
    maxLoginBtn.type = "button";
    maxLoginBtn.className = "shop-auth-social-btn shop-auth-social-btn--max";
    maxLoginBtn.style.display = "none";
    maxLoginBtn.setAttribute("aria-label", "Войти через MAX");
    const maxIcon = document.createElement("img");
    maxIcon.src = "/static/uploads/auth/max-auth.png";
    maxIcon.alt = "MAX";
    maxLoginBtn.appendChild(maxIcon);

    const tgLoginBtn = document.createElement("button");
    tgLoginBtn.type = "button";
    tgLoginBtn.className = "shop-auth-social-btn shop-auth-social-btn--telegram";
    tgLoginBtn.style.display = "none";
    tgLoginBtn.setAttribute("aria-label", "Войти через Telegram");
    const tgIcon = document.createElement("img");
    tgIcon.src = "/static/uploads/auth/telegram-auth.png";
    tgIcon.alt = "Telegram";
    tgLoginBtn.appendChild(tgIcon);

    const socialRow = document.createElement("div");
    socialRow.className = "shop-auth-social-row";
    socialRow.appendChild(maxLoginBtn);
    socialRow.appendChild(tgLoginBtn);

    maxLoginBtn.style.display = isKsoAuth ? "none" : "";
    tgLoginBtn.style.display = isKsoAuth ? "none" : "";
    socialRow.style.display = isKsoAuth ? "none" : "";

    const nameWrap = document.createElement("div");
    nameWrap.style.display = "none";
    nameWrap.style.gap = "8px";
    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label";
    nameLabel.textContent = "Имя";
    const nameInput = document.createElement("input");
    nameInput.className = "control";
    nameInput.type = "text";
    nameInput.autocomplete = "name";
    nameInput.placeholder = "Введите имя";
    nameWrap.appendChild(nameLabel);
    nameWrap.appendChild(nameInput);
    const nameError = document.createElement("div");
    nameError.className = "shop-auth-error hidden";
    nameWrap.appendChild(nameError);

    const bWrap = document.createElement("div");
    bWrap.style.display = "none";
    bWrap.style.gap = "16px";

    const bLabel = document.createElement("label");
    bLabel.className = "field-label";
    bLabel.textContent = "Дата рождения";
    const bdayInputWrap = document.createElement("div");
    bdayInputWrap.className = "shop-auth-bday-input-wrap";
    const bday = document.createElement("input");
    bday.className = "control";
    bday.type = "text";
    bday.placeholder = "дд.мм.гггг";
    bday.inputMode = "numeric";
    const bdayInfoBtn = document.createElement("button");
    bdayInfoBtn.type = "button";
    bdayInfoBtn.className = "shop-auth-bday-info-btn";
    bdayInfoBtn.setAttribute("aria-label", "Подсказка по дате рождения");
    bdayInfoBtn.innerHTML = '<i class="fas fa-info"></i>';
    const bdayInfoHint = document.createElement("div");
    bdayInfoHint.className = "shop-auth-bday-info-hint hidden";
    bdayInfoHint.textContent = "Дата рождения используется как пароль для входа в учетную запись.";
    const codeWrap = document.createElement("div");
    codeWrap.className = "shop-auth-code-wrap hidden";
    const codeInputs = [];
    for (let i = 0; i < 4; i += 1) {
      const codeCell = document.createElement("input");
      codeCell.type = "text";
      codeCell.inputMode = "numeric";
      codeCell.maxLength = 1;
      codeCell.className = "shop-auth-code-cell";
      codeCell.setAttribute("aria-label", `Цифра ${i + 1} из 4`);
      codeCell.autocomplete = i === 0 ? "one-time-code" : "off";
      codeInputs.push(codeCell);
      codeWrap.appendChild(codeCell);
    }
    bdayInputWrap.appendChild(bday);
    bdayInputWrap.appendChild(bdayInfoBtn);
    bdayInputWrap.appendChild(codeWrap);
    bdayInputWrap.appendChild(bdayInfoHint);
    bWrap.appendChild(bLabel);
    bWrap.appendChild(bdayInputWrap);


    const bdayError = document.createElement("div");
    bdayError.className = "shop-auth-error hidden";
    bWrap.appendChild(bdayError);

    const codeMeta = document.createElement("div");
    codeMeta.className = "shop-auth-code-meta hidden";
    codeMeta.setAttribute("aria-live", "polite");
    bWrap.appendChild(codeMeta);

    const codeActions = document.createElement("div");
    codeActions.className = "shop-auth-code-actions hidden";
    const resendCodeBtn = document.createElement("button");
    resendCodeBtn.type = "button";
    resendCodeBtn.className = "btn btn-sm";
    resendCodeBtn.textContent = "Повторить отправку";
    const telegramFallbackBtn = document.createElement("button");
    telegramFallbackBtn.type = "button";
    telegramFallbackBtn.className = "btn btn-sm hidden";
    telegramFallbackBtn.textContent = "Отправить в Telegram";
    codeActions.append(resendCodeBtn, telegramFallbackBtn);
    bWrap.appendChild(codeActions);

    const resetFields = [];
    if (isEmployee && purpose === "password_reset") {
      for (const placeholder of ["Новый пароль: от 12 символов", "Повторите новый пароль"]) {
        const input = document.createElement("input");
        input.type = "password";
        input.className = "control";
        input.autocomplete = "new-password";
        input.placeholder = placeholder;
        input.setAttribute("aria-label", placeholder);
        input.minLength = 12;
        input.maxLength = 72;
        bWrap.appendChild(input);
        resetFields.push(input);
      }
    }
    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.className = "btn btn-primary";
    loginBtn.style.width = "100%";
    loginBtn.textContent = "Войти";
    bWrap.appendChild(loginBtn);

    form.appendChild(nameWrap);
    form.appendChild(bWrap);
    form.appendChild(socialRow);
    wrap.appendChild(form);

    let authStepMode = isEmployee ? "code" : "birthday";
    let authNeedsNameInput = false;
    let messengerRequestId = "";
    let messengerProvider = "";
    let messengerResendTimer = null;
    const clearCodeInputs = () => codeInputs.forEach((cell) => { cell.value = ""; });
    const getCodeValue = () => codeInputs.map((cell) => String(cell.value || "").replace(/\D/g, "")).join("");
    const focusCodeIndex = (index) => {
      const safe = Math.max(0, Math.min(codeInputs.length - 1, Number(index) || 0));
      if (codeInputs[safe]) codeInputs[safe].focus();
    };
    const setNameError = (msg) => {
      nameError.textContent = msg || "";
      nameError.classList.toggle("hidden", !msg);
      nameInput.classList.toggle("is-invalid", !!msg);
    };
    const getAuthNameValue = () => normalizeCompletedCustomerName(nameInput.value);

    const setBirthdayStepUi = () => {
      authStepMode = "birthday";
      note.textContent = authNeedsNameInput
        ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f \u0438 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f (\u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433)."
        : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f (\u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433).";
      bLabel.textContent = "\u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f";
      bday.placeholder = "\u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433";
      bday.inputMode = "numeric";
      bday.maxLength = 10;
      bday.value = "";
      bday.style.display = "";
      bdayInfoBtn.classList.remove("hidden");
      codeWrap.classList.add("hidden");
      bdayInfoHint.classList.add("hidden");
      clearCodeInputs();
      codeMeta.classList.add("hidden");
      codeActions.classList.add("hidden");
      telegramFallbackBtn.classList.add("hidden");
      setBirthdayError("");
      setNameError("");
      nameWrap.style.display = authNeedsNameInput ? "grid" : "none";
    };

    const setCodeStepUi = () => {
      authStepMode = "code";
      note.textContent = authNeedsNameInput
        ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f \u0438 \u043a\u043e\u0434 \u0438\u0437 \u0431\u043e\u0442\u0430."
        : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438\u0437 \u0431\u043e\u0442\u0430.";
      bLabel.textContent = "\u041a\u043e\u0434 \u0438\u0437 \u0431\u043e\u0442\u0430";
      bday.placeholder = "0000";
      bday.inputMode = "numeric";
      bday.maxLength = 4;
      bday.value = "";
      bday.style.display = "none";
      bdayInfoBtn.classList.add("hidden");
      codeWrap.classList.remove("hidden");
      codeMeta.classList.remove("hidden");
      codeActions.classList.remove("hidden");
      bdayInfoHint.classList.add("hidden");
      clearCodeInputs();
      setBirthdayError("");
      setNameError("");
      nameWrap.style.display = authNeedsNameInput ? "grid" : "none";
    };

    const revealSecondStep = ({ needsNameInput = false } = {}) => {
      authNeedsNameInput = !!needsNameInput;
      if (authStepMode === "code") setCodeStepUi();
      else setBirthdayStepUi();
      if (nextBtn.style.display === "none" && bWrap.style.display === "grid") return;
      nextBtn.style.display = "none";
      bWrap.style.display = "grid";
      if (authNeedsNameInput) {
        nameInput.focus();
        if (typeof nameInput.select === "function" && nameInput.value) nameInput.select();
        return;
      }
      if (authStepMode === "code") focusCodeIndex(0);
      else bday.focus();
    };
    const checkPhoneStatus = async () => {
      const json = await apiJson("/api/public/auth/phone-status", {
        method: "POST",
        body: { phone: phone.value },
        headers: { "x-customer-token": "" },
      });
      return {
        exists: Boolean(json && json.exists),
        hasName: Boolean(json && json.has_name),
        needsNameInput: Boolean(json && json.needs_name_input),
        requiresMessengerLogin: Boolean(json && json.requires_messenger_login),
      };
    };
    let autoContinueLockPhone = "";
    phone.addEventListener("input", () => {
      enforcePhonePrefix(phone);
      if (isKsoAuth) return;
      if (isEmployee) return;
      const n = isEmployee ? phone.value.trim() : normalizePhone(phone.value);
      if (n && n.length === 11 && n.startsWith("7")) {
        if (nextBtn.style.display !== "none" && !nextBtn.disabled && autoContinueLockPhone !== n) {
          autoContinueLockPhone = n;
          nextBtn.click();
        }
      } else {
        autoContinueLockPhone = "";
      }
    });
    phone.addEventListener("focus", () => enforcePhonePrefix(phone));
    ksoKeypad.addEventListener("click", (event) => {
      const btn = event.target?.closest?.(".shop-auth-kso-key");
      if (!btn) return;
      event.preventDefault();
      enforcePhonePrefix(phone);
      const key = String(btn.dataset.key || "");
      const digits = normalizePhone(phone.value).replace(/^7/, "").slice(0, 10);
      if (key === "clear") {
        phone.value = "+7";
      } else if (key === "backspace") {
        phone.value = `+7${digits.slice(0, -1)}`;
      } else if (/^\d$/.test(key) && digits.length < 10) {
        phone.value = `+7${digits}${key}`;
      }
      enforcePhonePrefix(phone);
      phone.focus();
    });
    nameInput.addEventListener("input", () => {
      if (getAuthNameValue()) {
        setNameError("");
      }
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (authStepMode === "code") {
        focusCodeIndex(0);
      } else {
        bday.focus();
      }
    });

    const setBirthdayError = (msg) => {
      bdayError.textContent = msg || "";
      bdayError.classList.toggle("hidden", !msg);
      bday.classList.toggle("is-invalid", !!msg);
    };

    const normalizeBirthdayField = () => {
      if (authStepMode === "birthday") {
        handleBirthdayInput(bday);
        if (isValidBirthday(bday.value) && !loginBtn.disabled) {
          loginBtn.click();
        }
      } else {
        bday.value = String(bday.value || "").replace(/\D/g, "").slice(0, 6);
      }
      setBirthdayError("");
    };

    bday.addEventListener("input", normalizeBirthdayField);
    bday.addEventListener("change", normalizeBirthdayField);
    bday.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!loginBtn.disabled) loginBtn.click();
    });
    bday.addEventListener("blur", () => {
      if (!str(bday.value).trim()) return;
      if (authStepMode === "birthday") {
        if (!isValidBirthday(bday.value)) {
          setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 \u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433");
        }
      } else if (getCodeValue().length !== 4) {
        setBirthdayError("Введите 4-значный код");
      }
    });
    codeInputs.forEach((cell, idx) => {
      cell.addEventListener("input", () => {
        const digit = String(cell.value || "").replace(/\D/g, "").slice(-1);
        cell.value = digit;
        setBirthdayError("");
        if (digit && idx < codeInputs.length - 1) focusCodeIndex(idx + 1);
        if (getCodeValue().length === 4 && authStepMode === "code" && !loginBtn.disabled) {
          loginBtn.click();
        }
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          if (!cell.value && idx > 0) {
            e.preventDefault();
            codeInputs[idx - 1].value = "";
            focusCodeIndex(idx - 1);
          }
          return;
        }
        if (e.key === "ArrowLeft" && idx > 0) {
          e.preventDefault();
          focusCodeIndex(idx - 1);
        } else if (e.key === "ArrowRight" && idx < codeInputs.length - 1) {
          e.preventDefault();
          focusCodeIndex(idx + 1);
        } else if (e.key === "Enter" && !loginBtn.disabled) {
          e.preventDefault();
          loginBtn.click();
        }
      });
      cell.addEventListener("paste", (e) => {
        const text = String(e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (!text) return;
        e.preventDefault();
        clearCodeInputs();
        text.split("").forEach((ch, p) => {
          if (codeInputs[p]) codeInputs[p].value = ch;
        });
        focusCodeIndex(Math.min(text.length, 3));
        if (text.length === 4 && authStepMode === "code" && !loginBtn.disabled) {
          loginBtn.click();
        }
      });
    });

    const startMessengerResendCountdown = (rawDate) => {
      if (messengerResendTimer) clearInterval(messengerResendTimer);
      const until = new Date(rawDate || 0).getTime();
      const update = () => {
        const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        resendCodeBtn.disabled = seconds > 0;
        resendCodeBtn.textContent = seconds > 0 ? `Повторить через ${seconds} с` : "Повторить отправку";
        if (!seconds && messengerResendTimer) {
          clearInterval(messengerResendTimer);
          messengerResendTimer = null;
        }
      };
      update();
      if (until > Date.now()) messengerResendTimer = setInterval(update, 1000);
    };

    const requestMessengerCode = async (provider = "", popup = null) => {
      if (!["max", "tg"].includes(provider)) { popup?.close(); setBirthdayError("Выберите MAX или Telegram."); return false; }
      messengerProvider = provider;
      resendCodeBtn.disabled = true;
      loginBtn.disabled = true;
      if (isEmployee) (provider === "max" ? maxLoginBtn : tgLoginBtn).classList.add("is-loading");
      if (isEmployee) { maxLoginBtn.disabled = true; tgLoginBtn.disabled = true; }
      telegramFallbackBtn.disabled = true;
      setBirthdayError("");
      codeMeta.classList.remove("is-success");
      codeMeta.textContent = "Отправляем код…";
      try {
        const json = await apiJson(isEmployee ? "/api/auth/messenger-code/request" : "/api/public/auth/messenger-code/send", {
          method: "POST",
          body: isEmployee ? { login: phone.value.trim(), purpose, provider, start_in_bot: true }
            : { phone: phone.value, provider: provider || undefined, start_in_bot: true },
          headers: { "x-customer-token": "" },
        });
        if (disposed) { popup?.close(); return false; }
        messengerRequestId = String(json.request_id || "");
        messengerProvider = String(json.sent_via || "");
        telegramFallbackBtn.classList.add("hidden");
        const providerName = messengerProvider === "max" ? "MAX" : "Telegram";
        if (json.delivery_status === "pending") {
          const url = new URL(json.bot_link);
          if (url.protocol !== "https:" || !["t.me", "max.ru"].includes(url.hostname)) throw new Error("BOT_LINK_INVALID");
          codeMeta.textContent = `Запрос создан, код ещё не отправлен. Нажмите Start в ${providerName}, затем введите код здесь. Код действует 3 минуты после отправки. `;
          const link = document.createElement("a");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = `Открыть ${providerName}`;
          codeMeta.append(link);
          if (popup) popup.location.replace(url.href);
        } else {
          codeMeta.textContent = `Код отправлен в ${providerName} (${json.destination || "привязанный профиль"}). Он действует 3 минуты.`;
          popup?.close();
        }
        startMessengerResendCountdown(json.resend_after);
        clearCodeInputs();
        focusCodeIndex(0);
        return true;
      } catch (error) {
        popup?.close();
        const code = String(error?.message || "");
        const canFallback = Boolean(error?.payload?.fallback_available);
        telegramFallbackBtn.classList.toggle("hidden", !canFallback);
        codeMeta.textContent = canFallback ? "MAX недоступен. Telegram не будет выбран без вашего подтверждения." : "";
        setBirthdayError(messengerErrorText(code));
        resendCodeBtn.disabled = false;
        return false;
      } finally {
        telegramFallbackBtn.disabled = false;
        loginBtn.disabled = false;
        maxLoginBtn.classList.remove("is-loading");
        tgLoginBtn.classList.remove("is-loading");
        if (isEmployee) { maxLoginBtn.disabled = false; tgLoginBtn.disabled = false; }
      }
    };

    resendCodeBtn.addEventListener("click", () => openBotLogin(messengerProvider));
    telegramFallbackBtn.addEventListener("click", () => openBotLogin("tg"));


    nextBtn.addEventListener("click", async () => {
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        note.textContent = "Введите телефон (РФ): +7XXXXXXXXXX";
        phone.focus();
        return;
      }
      nextBtn.disabled = true;
      try {
        if (isKsoAuth) {
          const json = await apiJson("/api/public/auth/kso-login", {
            method: "POST",
            body: {
              phone: phone.value,
              chat_guest_client_id: getGuestChatClientIdForAuth(),
            },
            headers: { "x-customer-token": "" },
          });
          if (json.token) {
            setCustomerToken(json.token);
            markCustomerTokenVerified(String(json.token));
          }
          if (json.customer) setCustomerCache(json.customer);
          if (typeof window.refreshShopHomeBonusConfigUi === "function") {
            await window.refreshShopHomeBonusConfigUi({ force: true });
          }
          const me = json.customer || await fetchMeSafe();
          await refreshAddressState({ force: true });
          if (me && typeof onSuccess === "function") onSuccess(me);
          else notify("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438");
          return;
        }
        const status = await checkPhoneStatus();
        const needsNameInput = Boolean(status.needsNameInput || !status.hasName);
        if (status.requiresMessengerLogin) {
          setCodeStepUi();
          revealSecondStep({ needsNameInput });
          codeMeta.textContent = "Выберите MAX или Telegram, чтобы создать запрос входа и получить код в боте.";
          return;
        }
        setBirthdayStepUi();
        revealSecondStep({ needsNameInput });
      } catch (e) {
        const err = String(e && e.message ? e.message : "");
        if (authStepMode === "code") setBirthdayError(messengerErrorText(err));
        else note.textContent = "Не удалось проверить статус входа. Попробуйте ещё раз.";
      } finally {
        if (nextBtn.style.display !== "none") nextBtn.disabled = false;
      }
    });

    const openBotLogin = async provider => {
      enforcePhonePrefix(phone);
      const valid = /^7[0-9]{10}$/.test(normalizePhone(phone.value));
      if (!valid) {
        note.textContent = "Введите телефон (РФ): +7XXXXXXXXXX";
        phone.focus();
        return;
      }
      // Open synchronously so mobile browsers do not block navigation after the request.
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      setCodeStepUi();
      revealSecondStep();
      await requestMessengerCode(provider, popup);
    };
    maxLoginBtn.addEventListener("click", () => openBotLogin("max"));
    tgLoginBtn.addEventListener("click", () => openBotLogin("tg"));

    bdayInfoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      bdayInfoHint.classList.toggle("hidden");
    });
    const closeBirthdayHint = e => {
      if (!bdayInputWrap.contains(e.target)) bdayInfoHint.classList.add("hidden");
    };
    document.addEventListener("click", closeBirthdayHint);

    loginBtn.addEventListener("click", async () => {
      if (isKsoAuth) {
        nextBtn.click();
        return;
      }
      enforcePhonePrefix(phone);
      const n = normalizePhone(phone.value);
      if (!n || n.length !== 11 || !n.startsWith("7")) {
        note.textContent = "Введите телефон (РФ): +7XXXXXXXXXX";
        phone.focus();
        return;
      }
      const authName = authNeedsNameInput ? getAuthNameValue() : "";
      if (authNeedsNameInput && !authName) {
        setNameError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f");
        nameInput.focus();
        if (typeof nameInput.select === "function") nameInput.select();
        return;
      }
      if (authStepMode === "birthday") {
        if (!isValidBirthday(bday.value)) {
          setBirthdayError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 \u0434\u0434.\u043c\u043c.\u0433\u0433\u0433\u0433");
          return;
        }
      } else {
        const code = getCodeValue().slice(0, 4);
        if (code.length !== 4) {
          setBirthdayError("Введите 4-значный код");
          return;
        }
      }

      if (resetFields.length && (resetFields[0].value.length < 12 || resetFields[0].value !== resetFields[1].value)) {
        setBirthdayError("Введите новый пароль от 12 символов и одинаковое подтверждение.");
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c...";

      try {
        let json = null;
        const guestChatClientId = isEmployee ? undefined : getGuestChatClientIdForAuth();
        if (authStepMode === "birthday") {
          json = await apiJson("/api/public/auth/login", {
            method: "POST",
            body: {
              name: authName || null,
              phone: phone.value,
              birthday: str(bday.value).trim(),
              chat_guest_client_id: guestChatClientId,
            },
            headers: { "x-customer-token": "" },
          });
        } else {
          json = await apiJson(isEmployee ? "/api/auth/messenger-code/verify" : "/api/public/auth/messenger-code/verify", {
            method: "POST",
            body: isEmployee ? {
              login: phone.value.trim(), purpose, request_id: messengerRequestId,
              code: getCodeValue(), new_password: resetFields[0]?.value
            } : {
              name: authName || null,
              phone: phone.value,
              request_id: messengerRequestId,
              code: getCodeValue().slice(0, 4),
              chat_guest_client_id: guestChatClientId,
            },
            headers: { "x-customer-token": "" },
          });
          codeMeta.textContent = "Код подтверждён. Выполняем вход…";
          codeMeta.classList.add("is-success");
        }

        if (disposed) return;
        if (isEmployee) {
          if (typeof onSuccess === "function") onSuccess(json);
          return;
        }
        if (json.token) {
          setCustomerToken(json.token);
          markCustomerTokenVerified(String(json.token));
        }
        if (json.customer) setCustomerCache(json.customer);
        if (typeof window.refreshShopHomeBonusConfigUi === "function") {
          await window.refreshShopHomeBonusConfigUi({ force: true });
        }

        const me = json.customer || await fetchMeSafe();
        await refreshAddressState({ force: true });
        if (me) {
          if (hasCompletedCustomerName(me)) {
            if (typeof onSuccess === "function") onSuccess(me);
          } else {
            openRequiredCustomerNamePrompt({
              me,
              note: "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0438\u043c\u044f, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0432\u0445\u043e\u0434.",
              onSuccess: (me2) => {
                if (typeof onSuccess === "function") onSuccess(me2 || me);
              },
            });
          }
        } else {
          notify("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438");
        }
      } catch (e) {
        console.error(e);
        const err = String(e.message || "");
        if (err === "WRONG_BIRTHDAY") {
          bday.value = "";
          setBirthdayError("");
          if (typeof showToast === "function") showToast("\u041d\u0435\u0432\u0435\u0440\u043d\u0430\u044f \u0434\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f");
          else notify("\u041d\u0435\u0432\u0435\u0440\u043d\u0430\u044f \u0434\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f");
        }
        else if (err === "NAME_REQUIRED") {
          setNameError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f");
          nameInput.focus();
          if (typeof nameInput.select === "function") nameInput.select();
        }
        else if (authStepMode === "code") setBirthdayError(messengerErrorText(err));
        else if (typeof showToast === "function") showToast("Не удалось войти. Проверьте данные и повторите попытку.");
        else note.textContent = "Не удалось войти. Проверьте данные и повторите попытку.";
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "\u0412\u043e\u0439\u0442\u0438";
      }

    });


    wrap.dispose = () => {
      disposed = true;
      if (messengerResendTimer) clearInterval(messengerResendTimer);
      document.removeEventListener("click", closeBirthdayHint);
    };
    return wrap;
  }


  window.AuthCard = Object.freeze({ create, openProviderWindow, hasPendingRequest:context=>!!pendingRequest(context) });
})();

