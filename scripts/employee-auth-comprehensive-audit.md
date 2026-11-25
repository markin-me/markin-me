# Итоговая ревизия авторизации сотрудников CRM

## Уточнение фактического локального запуска и доставки MAX

Новое задание уточнило отказ по операции: «Номер телефона в MAX отличается от номера, указанного в вашем профиле. Авторизация невозможна.» либо «Номер телефона в MAX отличается от номера, указанного в вашем профиле. Привязка невозможна.». employeeAuthResponse выбирает вариант по EMPLOYEE_LINK; для Telegram действует та же схема с названием Telegram. Прежняя общая формулировка с «Авторизация/привязка» в исторических таблицах ниже относится к предыдущему уточнению. Текущая таблица состояний обновлена; старые SHA-256 ниже остаются снимком прежней read-only сверки, а не контрольными суммами нового несуществующего развёртывания.

Пользователь уточнил: приложение запускается и перезапускается локально. Удалённые действия прекращены; код удалённого сервиса не обновлялся и сервис не перезапускался. До уточнения был создан приватный каталог резервной копии на тестовом хосте и распакован клиент дампа БД без установки пакетов. Дамп завершился ошибкой; успешная резервная копия, миграция или развёртывание не заявляются.

Локальный порт 3000 обслуживал PID 8908, запущенный 19.11.2026 в 18:57:33 по Барнаулу. SHA-256 публично отдаваемого static/js/settings-tenant.js совпал с markin-me-messenger-auth. Это подтверждает источник статического файла, а не хеш загруженных Node-модулей в памяти.

GET /subscriptions MAX, выполненный только для чтения для tenant 1 из a1186497_test, показал два получателя: https://baseline-bringing-dec-brick.trycloudflare.com и https://posham.ru. Старый туннель не разрешается (ENOTFOUND); posham.ru отвечает и отдаёт другую версию JS. Поэтому локальная страница и локальный перезапуск сами по себе не определяют, где исполняется обработчик событий MAX.

Работающий localhost:3000/api/max/webhook-health вернул HTTP 503 MAX_WEBHOOK_ENDPOINT_NOT_CONFIGURED. В локальной конфигурации отсутствуют MAX_WEBHOOK_BASE_URL и альтернативные публичные origins. Автоматический maxWebhook worker регистрирует подписку по заранее доступному HTTPS-адресу и проверяет instance endpoint; он не создаёт локальный туннель автоматически. Наличие автоматической регистрации не означает готовность локальной доставки. Ранее это различие было отражено недостаточно явно.

Существующий scripts/dev-pwa-tunnel.js имеет отдельный режим --max-webhook, но автоматически не запускается сервером. Он использует отдельный ограниченный proxy и требует явных портов; сейчас отдельно запрещает messenger servicePort=3000. Переключение подписки MAX на локальный процесс и изменение адреса webhook не выполнялись; вопрос о локальной маршрутизации задан пользователю. Ранее существующая подписка posham.ru не удалялась.

Повторное чтение challenges обнаружило employee MAX link tenant=1/account_id=1, созданный по времени БД 14:59:19 со сроком 15:09:20 и UID с окончанием 2423. Он остался consumed_at=NULL, delivery_status=pending, а cleanup позднее стал expired. Это согласуется с незавершением link старым маршрутом; время 14:59 нельзя автоматически приравнивать к времени скриншота без учёта временной зоны БД. Конкретный сырой webhook не сохранялся в этой диагностике, поэтому соответствие отдельному кадру не выдаётся за доказанный факт.

## Повторная сверка тестового сервиса 19.11.2026

По SSH только для чтения проверен `markin-me-test.service` на тестовом хосте 141.8.198.215. MainPID=179114, запуск 18.11.2026 16:21:03 MSK (20:21:03 по Барнаулу), CWD `/var/www/markin-me/markin-me-test`. В каталоге сервиса отсутствует employeeAuthResponse; пять проверенных файлов отличаются от локальных. Их время записи предшествует запуску процесса. Метаданных .git нет, поэтому commit развёрнутого каталога достоверно назвать нельзя. Версия фиксируется SHA-256 ниже; дамп require.cache процесса и пользовательский прогон не выполнялись.

Локальная ветка feat/messenger-auth имеет HEAD 50822535a06a6d97aa19a76ad6cf873f8c0d84b0 и незакоммиченные изменения. Этот HEAD сам по себе не идентифицирует рабочее дерево. Исправления унификации в сервисном каталоге отсутствуют. Для перечисленных старых сообщений установлена причина: сервер использует старую реализацию. Повторных исправлений уже исправленных маршрутов не внесено. Единственная правка текста текущего прохода — последовательно уточнённый пользователем отказ при другом номере, без фразы «Обратитесь к администратору».

Через db.js сервисного каталога прочитано SELECT DATABASE(): a1186497_test. В bot_content_templates tenant=1/store=1/provider=tg сохранены contact_request = «Отправьте только собственный контакт системной кнопкой мессенджера.», code_sent = «Код для входа отправлен. Никому его не сообщайте.», request_expired = «Запрос истёк. Начните вход заново в магазине.». Среди этих трёх ключей сохранённых строк MAX нет: наблюдаемые сообщения MAX формируются fallback-текстами старого кода. БД не изменялась.

| Сценарий | Фактический источник старого сообщения и причина | Полный текст до исправления | Точный итоговый текст | Кнопки и переход | Источник локального исправления | Версия на сервере / наличие локально |
| --- | --- | --- | --- | --- | --- | --- |
| Telegram, запрос контакта для входа | Сервер api/tenantTelegramBot.js:116, handleTenantTelegramUpdate → serviceText(contact_request); сохранённый шаблон БД имеет приоритет | Отправьте только собственный контакт системной кнопкой мессенджера. | Для авторизации нажмите кнопку „Авторизоваться“. | Авторизоваться, request_contact; pending → started; после собственного правильного контакта confirmed без перезапуска | api/botContentTemplates.js:149 employeeAuthResponse; api/tenantTelegramBot.js:43 customerResult | На сервере mapper отсутствует; локально применяется до renderer |
| Telegram, запрос привязки из профиля | Сервер api/tenantTelegramBot.js:136 использует тот же contact_request для EMPLOYEE_LINK | Отправьте только собственный контакт системной кнопкой мессенджера. | Для привязки мессенджера нажмите кнопку „Привязать“. | Привязать, request_contact; действующий link challenge → ожидание своего контакта | api/botContentTemplates.js:149 employeeAuthResponse; api/tenantTelegramBot.js:43 customerResult | Старый сервис; локально фиксированная employee ветка |
| Telegram, завершение привязки | Сервер api/tenantTelegramBot.js:185–190, старый хвост onAuthContact; customerResult не обрабатывает employee | Номер подтверждён, Telegram привязан. Начните вход в исходной карточке и подтвердите новый запрос в боте. | Telegram успешно привязан. | Кнопок нет, remove_keyboard; challenge consumed; исходная CRM-сессия сохраняется | api/tenantMessengerUpdate.js:158 onBrowserContact маршрутизирует employee challenge; employeeAuthResponse и customerResult | На сервере нет соответствующей маршрутизации; локально есть |
| MAX, запрос привязки на скриншоте | Сервер api/maxBotPolling.js:891, handleTenantMaxUpdate, a_ ветка: EMPLOYEE_LINK не равен PROFILE_LINK, выбирается fallback contact_request | Подтвердите собственный контакт для привязки MAX к вашему профилю. | Для привязки мессенджера нажмите кнопку „Привязать“. | До: Поделиться своим контактом, request_contact. После: Привязать, request_contact; link pending | api/maxBotPolling.js:799 customerResult → employeeAuthResponse | На сервере mapper отсутствует; локально есть |
| MAX, контакт после employee link на скриншоте | Сервер api/tenantMessengerUpdate.js:97–120, onBrowserContact сначала ищет customerOnly link, затем browserBotAction. Employee challenge не завершается; api/maxBotPolling.js:868 отправляет fallback request_expired при отсутствии подходящего browser request | Запрос отсутствует или истёк. Начните вход заново в исходной карточке. | При правильном номере: MAX успешно привязан. При другом: Номер телефона в MAX отличается от номера, указанного в вашем профиле. Авторизация/привязка не возможна. | Кнопок нет. Правильный номер → commit link; другой → rollback и закрытие challenge, без переключения карточки | api/tenantMessengerUpdate.js:158 employee challenge branch; api/messengerAuth.js completeLinkChallenge; employeeAuthResponse | Это ошибка старого маршрута, а не корректное сообщение о несовпадении. Локально маршрут исправлен ранее |
| Сотруднический OTP, Telegram и MAX | Сервер api/messengerDelivery.js:202–208, deliverCode использует options.customer; employee попадает в codeMessage и объединение с code_sent | Код для входа отправлен. Никому его не сообщайте.\n\nКод входа: {код}. Он действует 3 мин. Никому не сообщайте этот код. | {название магазина}: {код} - Ваш код подтверждения. | Нет кнопок, ровно одно сообщение; после OTP отдельного успеха нет | api/messengerDelivery.js:194 deliverCode, fixedCode на строке 204; accountType передаётся issuer | Сервис содержит старую проверку customer; локально employee формат фиксирован |
| Другой номер employee, Telegram | Старые общие ветки не имели единого согласованного отказа и могли выбирать не тот результат | Серверный Telegram link fallback: Не удалось привязать мессенджер, так как номер телефона не совпадает с учётной записью | Номер телефона в Telegram отличается от номера, указанного в вашем профиле. Авторизация/привязка не возможна. | Нет кнопок; текущая операция прекращается, не продолжает вход под B | api/botContentTemplates.js:153–155 employeeAuthResponse; browserBotAction и completeLinkChallenge | Новая формулировка уточнена в текущем проходе только локально; сервер не обновлялся |

Для MAX-скриншота подтверждены точные источники двух текстов и доступная в развёрнутом коде ошибочная цепочка обработки. Содержимое конкретного входящего webhook и его соответствие отдельной записи операции не снимались: ответ «Запрос отсутствует или истёк» сам по себе не доказывает, что была выполнена проверка другого номера. Старый маршрут не доходил до employee link-проверки. Состояния отмены, восстановления, повторов, второй/повторной привязки, очистки и OTP повторно прослежены в локальном dispatcher, mapper, domain и worker; полный каталог находится в связанном документе.

Сервисы не перезапускались, файлы на сервер не копировались. Старые шаблоны не переписывались для маскировки отсутствующего развёртывания.

19.11.2026, локальные исходники ветки `feat/messenger-auth`. Развёртывание, миграции, перезапуск, тесты и проверочные сценарии не выполнялись. Соответствие работающего сервиса новой реализации не заявляется.

[Полные состояния, ответы, отказы, 11 Mermaid-схем и сравнение с клиентами](employee-auth-states-and-bot-responses.md).

## Причины расхождений и исправления

| Источник до исправления | Почему использовался | Итоговая реализация | Источник |
| --- | --- | --- | --- |
| code_sent БД + codeMessage: «Код для входа отправлен. Никому его не сообщайте.» и «Код входа: {код}. Он действует 3 мин. Никому не сообщайте этот код.» | Employee не попадал в customer ветку фиксированного OTP; renderer объединял абзацы | Все employee code purposes используют один server-owned формат с brand tenant, без вызова code_sent | `api/messengerDelivery.js:194`, deliverCode; `api/messengerAuth.js:803`, issueCodeChallengeLocked |
| contact_request БД: «Отправьте только собственный контакт системной кнопкой мессенджера.» | Employee результат попадал в legacy fallback адаптера | employeeAuthResponse в существующем botContentTemplates перехватывает employee результат до renderer; фиксированные инструкция и кнопка | `api/botContentTemplates.js:149`, employeeAuthResponse; `api/tenantTelegramBot.js:37`, handleTenantTelegramUpdate / customerResult; `api/maxBotPolling.js:796`, handleTenantMaxUpdate / customerResult |
| «Номер подтверждён, Telegram привязан. Начните вход в исходной карточке и подтвердите новый запрос в боте.» | Завершение employee challenge шло в устаревший хвост onAuthContact | Контакт направляется в конкретный challenge; привязка получает точный короткий итог, browser login продолжается сам | `api/messengerAuth.js:384`, completeLinkChallenge; `api/tenantMessengerUpdate.js:23`, handleTenantMessengerUpdate; `api/tenantTelegramBot.js:37`, handleTenantTelegramUpdate / customerResult |
| Ранние auth_success, «Подтверждение принято» и дополнительные сообщения после контакта | Подтверждение в боте смешивалось с выдачей JWT | Employee confirmed без сообщения об успехе; общий worker отправляет итог после consumed. OTP без отдельного успеха | `api/botContentTemplates.js:149`, employeeAuthResponse; `api/messengerCleanup.js:532`, createMessengerCleanupWorker / notifyCustomerTerminal; `api/messengerAuth.js:1541`, consumeBrowserRequest |
| link_success, auth_success, confirmation_pending, request_error, request_expired из БД | Общие старые fallback-ветки | Employee mapper имеет приоритет; неизвестные token игнорируются в dispatcher, stale/invalid результаты не порождают новую операцию | `api/botContentTemplates.js:149`, employeeAuthResponse; `api/tenantMessengerUpdate.js:23`, handleTenantMessengerUpdate |
| «Запрос завершён.» при очистке reply keyboard | Telegram требует сообщение для remove_keyboard | Для employee используется согласованный терминальный текст по фактическому исходу; сообщение сразу удаляется. Успешное снятие клавиатуры фиксируется, исключая обычный повтор | `api/messengerCleanup.js:463`, clearTelegramControls |
| Приоритет сотруднического контакта при нескольких ожиданиях | Сам контакт не содержит operation ID | Общее активирование учитывает employee, закрывает прежние employee ожидания; остаточная неоднозначность не выбирает карточку по приоритету | `api/messengerAuth.js:302`, activateCustomerOperation; `api/tenantMessengerUpdate.js:23`, handleTenantMessengerUpdate |

Шаблоны БД не удалялись и не редактировались: это могло бы затронуть независимые функции. Старые строки могут оставаться в общих fallback-ветвях иных контекстов. Они исключены из классифицированной сотруднической авторизации посредством employeeAuthResponse и dispatcher, а не заменой пользовательских требований. Employee `l_` не вызывает legacy выдачу, произвольный employee `c_` callback не превращается в клиентский PROFILE_LINK. Все фактически достижимые employee auth-ответы, включая очистку и silent-группы, перечислены в таблице 2 связанного документа.

## Карточка, номер и права

Исходный телефон должен находить единственную активную app_users с действующей ролью. Перед выдачей ссылки сохраняется account_id. browserBotAction сверяет текущую карточку, requested_phone, собственный контакт и выбранную по действующей связи карточку. Другой номер прекращает операцию; переключение account_id запрещено. В completeLinkChallenge сотруднический контакт отдельно сверяется с актуальным номером app_users до записи связи.

Guest session hash и профильная клиентская операция не принимаются для employee. Из контакта не создаётся app_users. Публичный интерфейс смены сотрудником своего номера не добавлялся. Запись phone находится в административном team handler с существующей проверкой полномочий. Регистрация владельца нового tenant и связанные независимые функции не менялись.

Источники: `api/auth.js:81`, POST /messenger-browser/start; `api/messengerAuth.js:1211`, createBrowserRequest; `api/messengerAuth.js:1233`, browserBotAction; `api/messengerAuth.js:384`, completeLinkChallenge; `api/messengerAuth.js:111`, assertAccountActive; `api/admin/team.js:980`, PUT /users/:id.

## Контакт и маршрутизация

Telegram проверяет личный диалог, наличие собственного contact.user_id, совпадение UID, отсутствие признаков пересылки, действующее назначение операции, предварительный prompt, время и стадию. Existing customer_prompt_at используется и для employee link, customer_contact_prompt_at — для browser; исторические имена колонок не требуют новой схемы. Повтор после завершённого подтверждения не выдаёт доступ.

MAX сохраняет HMAC-проверку VCF, UID и признаки пересылки. Собственный подписанный employee contact направляется в общий completeLinkChallenge для challenge, а для browser — в browserBotAction. Проверки MAX не заменялись проверкой одного UID.

Арбитраж использует существующий activateCustomerOperation с employee scope: новая employee операция не присваивает контакт при действующем клиентском ожидании; прежние employee ожидания закрываются. Новый клиентский запрос может закрыть employee ожидание, сохраняя свой согласованный клиентский сценарий. Остаточная неоднозначность не разрешается выбором «сотрудник важнее клиента». Token, account_type, UID и tenant определяются сервером; клиентский браузерный endpoint не может потребить employee request и наоборот. Источники: `api/messengerAuth.js:1233`, browserBotAction; `api/messengerAuth.js:384`, completeLinkChallenge; `api/messengerAuth.js:302`, activateCustomerOperation; `api/tenantMessengerUpdate.js:23`, handleTenantMessengerUpdate; `api/tenantTelegramBot.js:37`, handleTenantTelegramUpdate / customerResult; `api/maxBotPolling.js:796`, handleTenantMaxUpdate / customerResult.

## Первая, вторая и повторная привязки

Повторный запрос уже действующей подтверждённой связи того же UID завершается без повторного получения контакта. Новая связь/новый UID требует собственного контакта. Для восстановления ранее подтверждённого employee номера используются собственные m.verified_at/c.verified_at и текущая app_users, а не обязательное историческое доказательство через auth_employee_customer_links. Это не снимает ограничения текущего номера: административная смена номера инвалидирует employee связи, операции и auth_version.

Повторно используется общий link challenge. История UID не является самостоятельным запретом. Новый UID допустим после добровольной отвязки при правильном текущем номере. Существующий provider с другим UID не перезаписывается; чужая employee связь и person проверяются. Existing helper переназначения person допускает только действительно несвязанный канал: любые активные account messenger links, клиентские identities либо legacy UID запрещают его присвоение.

revoked_at проверяется до обновления и не сбрасывается повторной привязкой. Добровольная отвязка удаляет только выбранную employee связь и отменяет относящиеся к ней OTP/link/browser операции. Она не отзывает действующий JWT и не удаляет клиентские связи. Последняя отвязка сохраняет парольный вход. Существующая связь employee-customer не переопределяет права CRM.

Источники: `api/messengerAuth.js:384`, completeLinkChallenge; `api/messengerAuth.js:684`, unlinkAccountChannel; `api/messengerAuth.js:269`, assertEmployeeSessionVersion.

## Административная смена номера

Пользователь отдельно согласовал отзыв активных сессий. Нормализованные номера сравниваются внутри существующего team handler. В одной транзакции повышается auth_version, отменяются незавершённые employee browser requests по account_id, прежнему номеру либо связанному UID, challenges закрываются с delivery_status=failed, удаляются только соответствующие employee messenger links. Карточка app_users.id, должность, права, настройки, tenant, клиентские связи и административный статус не сбрасываются. Global revoked_at не изменяется. После commit существующий revokeUserStreams закрывает потоки.

Middleware сравнивает authVersion JWT с app_users.auth_version. Срок жизни JWT не менялся. Создание employee link стало транзакционным; assertEmployeeSessionVersion повторно проверяет версию под блокировкой app_users. Та же проверка добавлена при отвязке: старый запрос, прошедший middleware до административного изменения, не может записаться после отзыва.

assertAccountActive использует актуальное блокирующее чтение сотрудника с проверкой tenant, статуса и роли. Завершение browser/link повторно проверяет текущий номер. Проверка employee browser OTP дополнительно сверяет requested_phone с текущим номером. Если вход завершился раньше административной транзакции, его JWT отзывается изменением версии. Если изменение произошло первым, старые операции отменены и завершаются отказом. Deadlock/ошибка БД приводит к rollback, обходящего проверки fallback нет.

Блокировка/увольнение использует тот же cancelEmployeeAuthOperations для pending операций и существующее повышение auth_version. Роли проверяются повторно; права между карточками не копируются.

Источники: `api/admin/team.js:980`, PUT /users/:id; `api/admin/team.js:282`, cancelEmployeeAuthOperations; `api/middleware/auth.js:103`, authMiddleware; `api/messengerAuth.js:269`, assertEmployeeSessionVersion; `api/messengerAuth.js:111`, assertAccountActive; `api/messengerAuth.js:1233`, browserBotAction; `api/messengerAuth.js:384`, completeLinkChallenge; `api/messengerAuth.js:1643`, verifyEmployeeBrowserCode.

## Восстановление, пароль и выбор роли

При открытии password_reset карточка и текущий номер закрепляются за действующим employee каналом; дальнейшая смена карточки или номера отклоняется. В browser login дополнительно проверяется отсутствие появившейся во время операции конфликтующей связи того же provider до upsert. Это закрывает конкурентную замену действующего UID после начала входа.

Парольный вход, смена временного пароля, восстановление и выбор роли сохраняют существующие endpoints. Password_reset подтверждает действующую employee операцию, а новый пароль устанавливается в браузере; успешная авторизация в боте при промежуточном подтверждении не объявляется. Существующий отзыв по auth_version при смене пароля сохранён. Несколько ролей дают существующий ограниченный JWT выбора роли; полный доступ задаёт уже действующий обработчик выбора роли. Новой политики доступа или срока жизни сессий не введено. Источники: `api/messengerAuth.js:1233`, browserBotAction; `api/messengerAuth.js:1541`, consumeBrowserRequest; `api/middleware/auth.js:103`, authMiddleware; api/auth.js, buildSuccessfulAuth, /login, /change-password, /select-role.

## Очистка и transport

Переиспользованы auth_service_operations/messages, ID сообщений обоих провайдеров, tick, terminal delays, retry, lease и failed. Смена номера, блокировка, отвязка и замена link приводят к очистке без входящего обновления. Employee browser confirmed не закрывает операцию очистки до consumed/cancelled либо expiry. Успех выдачи JWT и отправка итога разделены; OTP завершается в CRM без дополнительного успеха.

Telegram pollingDemand учитывает client/employee incoming operations, confirmed до deadline, pending notices и pending/processing задачи очистки обоих scopes. Отдельного employee poller не создано; сохранены advisory lock, lease, offset, дедупликация и восстановление. Failed удаление не считается deleted. Очистка работает независимо от polling и входящих событий. MAX остаётся на существующем Webhook; его регистрация и transport в этой задаче не менялись.

Источники: `api/telegramPolling.js:59`, pollingDemand; `api/messengerCleanup.js:588`, createMessengerCleanupWorker / tick; `api/messengerCleanup.js:532`, createMessengerCleanupWorker / notifyCustomerTerminal; `api/messengerCleanup.js:463`, clearTelegramControls.

## Изменённые функции

- api/auth.js: messenger-browser/start; messenger-links create/delete, передача authVersion.
- api/messengerAuth.js: assertAccountActive, assertEmployeeSessionVersion, createLinkChallenge/createLinkChallengeLocked, activateCustomerOperation, completeLinkChallenge, browserBotAction, unlinkAccountChannel, verifyEmployeeBrowserCode. Сохранены уже выполненные изменения OTP payload accountType и клиентских сценариев.
- api/botContentTemplates.js: employeeAuthResponse в существующем модуле, без второй системы шаблонов.
- api/tenantTelegramBot.js и api/maxBotPolling.js: employee результаты обрабатываются до устаревших renderer, нет промежуточного успеха и повторного запуска входа.
- api/tenantMessengerUpdate.js: token/UID/tenant/account_type, назначение контакта, employee native/signed link, legacy guards, стадия завершения.
- api/messengerCleanup.js: общий prompt tracking, employee terminal notice, синхронизация закрытых challenges, снятие native keyboard с фиксацией результата.
- api/telegramPolling.js: employee demand и очистка.
- api/admin/team.js: согласованный отзыв при смене номера и общий helper аннулирования для блокировки.

Клиентские чаты, SSE, заказы, бонусы, адреса, корзина, гостевые данные и настройки хранения переписки не менялись. Предыдущие корректные клиентские изменения и расположение свитчей сохранены. Изменения общего арбитража касаются employee ожиданий, а не переноса клиентских карточек или CRM-прав.

## Оставшиеся вопросы и технические ограничения

1. Принятое ограничение Telegram API: ручная собственная карточка с одинаковыми полями неотличима от request_contact. Первичная авторизация из-за этого не отключена; MAX HMAC не ослаблен.
2. При потере ответа API ограниченный retry итогового сообщения может дать повтор. Exactly-once не заявляется.
3. Необратимая ошибка удаления остаётся failed с причиной; сообщение может остаться до административного вмешательства.
4. Для специфических отказов без согласованного текста новые фразы не вводились: без ответа бота, код ошибки в CRM/журнале. Если нужны отдельные сообщения о блокировке, отсутствующей роли, отключённом канале, неоднозначности и технических сбоях, их необходимо отдельно согласовать. Это не препятствует остальным допустимым операциям.
5. Telegram требует сообщение для снятия reply keyboard. В таблице отдельно указан согласованный итог, используемый только при незавершённой очистке клавиатуры и сразу удаляемый. MAX такого сообщения не требует.

## Статическая верификация

Прослежены HTTP начала/проверки/потребления, парольный вход и recovery, link create/delete, dispatcher token/UID/tenant/account_type, оба адаптера, employeeAuthResponse, deliverCode, renderer, worker terminal/keyboard/delete/retry и pollingDemand. Каталог таблицы 2 включает отдельные сообщения очистки и silent-группы; шаблоны БД не объявлены фиксированными сообщениями кода.

Выполнены проверка JS-синтаксиса и git diff --check. Тесты и проверочные сценарии не создавались и не запускались. Миграции, развёртывание, перезапуск и обращения к Production не выполнялись. Проверка работающего бота возможна после отдельно разрешённого обновления сервиса.


## 25.11.2026 — вход сотрудников через общий домен CRM

Причина `TENANT_REQUIRED`: общий домен CRM не связан с конкретным магазином, а прежний выбор единственного активного tenant прекращал работать после появления второй организации. Переменные `.env` с токенами ботов не устраняют эту ошибку.

В `api/auth.js`, `employeeByPhone` и обработчиках `/phone-flow/start`, `/messenger-browser/start` организация для входа определяется по единственной действующей карточке сотрудника с нормализованным номером, активным tenant и назначенной ролью. На домене конкретного магазина сохраняется поиск только внутри этого магазина. Номер не является доказательством доступа: после выбора карточки остаются прежние OTP/нативный контакт, проверки привязок, статуса и выдачи сессии.

Если один номер соответствует карточкам нескольких организаций, возвращается `EMPLOYEE_TENANT_AMBIGUOUS`; в существующей карточке входа показывается предложение использовать логин и пароль или домен своей организации. Произвольный tenant не выбирается, уведомления во все организации не отправляются. Несколько совпадающих карточек внутри одной организации также не дают однозначного сотрудника и не разрешают вход.

Новая функция `resolveEmployeeBrowserTenant` в существующем модуле `api/messengerAuth.js` находит tenant только у сотруднической операции по случайному `public_id` и хешу HttpOnly-cookie `messenger_browser`. `employeeRequestTenant` дополнительно проверяет соответствие домену, если тот связан с магазином. Это применяется при проверке OTP, ожидании подтверждения, отмене и подтверждении операции логином/паролем. Затем существующие функции повторно проверяют актуальность, binding, карточку и принадлежность операции. Клиентская операция не может быть использована вместо сотруднической; tenant из тела запроса не принимается.

Изменение не добавляет самостоятельную регистрацию, гостевой доступ к CRM или перенос прав. Сценарий начала восстановления пароля без номера/организации на общем домене не расширялся. `.env`, клиентская авторизация, webhook, polling и сроки сессий не менялись. Выполнены только статическая ревизия, проверки синтаксиса и `git diff --check`; тесты, миграции, развёртывание и перезапуск не выполнялись. Работающий удалённый сервис этим изменением не обновлён.

## Контрольные суммы повторной сверки

Хеши файлов сервисного каталога, а не дамп памяти процесса. Локальные хеши включают последнее уточнение текста отказа.

| Файл | SHA-256 тестового сервиса | SHA-256 локальной рабочей копии |
| --- | --- | --- |
| api/botContentTemplates.js | 38afd2183f4917f3275ebb7da7aa5a27e2f3dd50cabe6860af08c66e00506110 | 23dc90d1cb5740bbbb60ac1092ec67ca770d2b9dbf092ef866a4bd72f3d9295d |
| api/tenantTelegramBot.js | e8db8a5734c80169dea28b708330a2698d060c97a1f5cacd61e1ee6cddc3ba86 | 07551cc01b6df4ab10a47e3d39eb79dd632f35414cbbf443abb8d547931da587 |
| api/maxBotPolling.js | 3a7a6b5d293e82db69e22a9f7061499c978d4e4b3b44389ed42b89a818749c39 | d93270c193e1325fb66127c0c072f0522e445cf47da7f23b1ec3f2f915be7a54 |
| api/messengerDelivery.js | 00aa29ad4ff2fac71908fe7d4051b224fd70f456bf2d6237cc8b4578058a6ca0 | e0e1ff470af2b664b07b22e4971b862660731778f9dd3247ee9c2d28bf4465a8 |
| api/tenantMessengerUpdate.js | 6bfd1fe54635db0ba861f435232aeff61bcb25bc46244b31a3dfab6f2c8669c1 | efe2ed122282c7120311d808d7531d405c06af1231704c7b406e9201af8bfdf2 |

В таблице источников последовательность \n\n обозначает два реальных перевода строки старого OTP; в согласованном формате их нет.
