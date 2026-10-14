# Payment Service — этапы 1.2–4.2

## Этап 4.2: Reconciliation + Recovery

### Подключение

1. Вручную применить `migrations/2026-10-10_payment_reconciliation.sql` после миграции 4.1.
   Миграция добавляет scheduling/lease/cooldown поля, индексы и текстовый снимок запроса
   в существующие provider operations. Предыдущие миграции не изменены.
2. В `services/payment-service/.env` добавить `PAYMENT_RECONCILIATION_ENABLED=1`.
   Остальные параметры и безопасные значения приведены в `.env.example`.
   Указать действующий `PAYMENT_MAIN_EVENTS_URL`: Outbox работает и при выключенном
   webhook receiver. Публичный HTTPS/tunnel для reconciliation не нужен.
3. Перезапустить Payment Service. Main Backend перезапустить для обновления summary.
   Пока миграция не применена, сервис с новым кодом не считается готовым.
4. Диагностика: `GET /internal/v1/reconciliation/status`, только по внутренней сети
   с `x-payment-service-token`. `/health` не зависит от размера backlog.

### Финансовый путь и recovery

Кандидаты: только online/yookassa Payment в `created`, `pending`,
`waiting_for_confirmation`, с наступившим `next_reconcile_at`. `waiting_for_capture`
у нашего adapter отображается как `pending` с provider metadata. Cash/manual/legacy
Order не создают кандидатов. `paid`, `cancelled`, `failed`, `partially_refunded`,
`refunded` не опрашиваются. Новые попытки моложе 60 секунд пропускаются.

Worker выбирает до 25 просроченных записей по индексируемому schedule, запускает до
2 задач одновременно на экземпляр сервиса. DB lease на подключении разрешает одну
reconciliation этого подключения среди всех экземпляров; DB lease на Payment
защищает отдельную задачу. Оба lease — 120 секунд; общий refresh lease — 60 секунд.
Claim — условный UPDATE, row lock не удерживается во время HTTP. Умершие owners
заменяются после истечения lease, а токен защищает завершение чужой задачи.

Tick — 30 секунд плюс jitter до секунды. Базовая задержка: created 60 секунд,
pending 120 секунд, waiting_for_capture 300 секунд; затем удвоение с jitter до 20%,
максимум 3600 секунд. После 72 часов либо 100 проверок незавершённая попытка
требует ручной проверки. Значения конфигурируются; это технический horizon,
а не объявление истечения provider Payment. `pending` не становится `failed`.

Известный provider ID проверяется существующим `operations.get` / YooKassa GET.
Используются прежние amount/currency/account/test validators, Payment Core,
state machine и атомарные PaymentEvent + Outbox. Для GET применяется проверка
ожидаемой `Payment.version` и refresh lease: поздний ответ не откатывает новое состояние.
Источник событий worker и ручной reconciliation — `reconciliation`.
Одинаковый pending GET без изменений не создаёт финансовый event.

При отсутствии provider ID восстанавливается существующая create operation:
тот же `provider_key`, та же сумма/валюта и сохранённый `request_snapshot`, с проверкой
SHA-256 fingerprint, connection и metadata tenant/store/order/payment. Новый внешний
Payment и новый ключ не создаются. Полученный объект применяется сразу через общий
Core; привязка ID отмечается событием `payment.provider_link_recovered`. Payment,
event, Outbox и завершение operation фиксируются одной транзакцией Core.

ЮKassa гарантирует идемпотентность 24 часа. Наш safety cutoff — 23 часа от записи
operation до первого POST; позднее POST запрещён и требуется ручная проверка.
Источник: [формат взаимодействия ЮKassa](https://yookassa.ru/developers/using-api/interaction-format).
Старые uncertain operations без текстового снимка запроса также требуют ручной
проверки: MySQL JSON может менять порядок ключей, поэтому точный fingerprint нельзя
восстановить предположением. Это ограничение не относится к Payment с известным ID.

Recovery capture/cancel: общий GET подтверждает уже выполненные операции.
Автоматического capture/cancel/refund POST worker не делает; полный recovery
refund относится к 4.3. Disabled/archived connection обслуживает историю,
используя актуальный Secret того же Shop ID; удаление credentials/history запрещено
существующим модулем Connections.

### Ошибки, ручная проверка и диагностика

Timeout/network/5xx/429 оставляют финансовое состояние прежним. Для подключения
действует cooldown 900 секунд (либо больший валидный Retry-After для 429).
Auth/access/key failure подавляются на уровне connection. Смена credentials revision
или успешная новая verification снимают suppression при следующем доступном запуске.
Amount/currency/account mismatch, известный ID с 404, повреждённый fingerprint,
истёкшее окно восстановления — manual_review, без объявления оплаты или неудачи.
После horizon/лимита попыток сетевые ошибки тоже отправляются в ручную проверку.

Manual review сохраняется с отдельным техническим состоянием, append-only event
и Outbox в транзакции. Existing Order panel показывает «Требуется проверка»,
а в истории попыток доступны provider ID, operation ID/state, счётчики, даты и error code.
Кнопка «Обновить статус» и клиентский refresh используют тот же reconciliation entrypoint
с DB cooldown 15 секунд. Ручной GET может возобновить проверку; новый платеж и redirect
для unresolved manual_review заблокированы. Credentials/payload/raw response в диагностику
и журналы не попадают. Полноценная новая страница мониторинга не создавалась.

Вторая достоверно успешная попытка фиксируется как paid, а не скрывается ошибкой
«уже оплачено». Existing snapshot выявляет `PAYMENT_DUPLICATE_SUCCESS`, сумма остаётся
правдивой, fulfillment блокируется anomaly. Автоматического возврата нет.
Защита от создания новой попытки уже оплаченного заказа сохранена.

Status endpoint содержит counters scanned/attempted/changed/recovered/errors/manualReview,
суммарную длительность, heartbeat, возраст незавершённых Payment по test/live,
backlog uncertain operations и ошибки connections. Counters/heartbeat относятся к текущему
процессу; durable счётчики и даты находятся в БД. Inbox/Outbox recovery остаётся worker 4.1,
reconciliation напрямую Order не обновляет. На SIGTERM новые кандидаты не берутся,
активные задачи ожидаются; общий shutdown deadline завершает процесс, незаконченные lease
истекают. Неопределённая операция не объявляется failed при аварийной остановке.

### Abandoned Orders: результат изучения кода

Для Online Order с суммой больше нуля списание остатков при создании пропускается;
при режиме `on_create` оно происходит после подтверждённой оплаты через существующий
release path. До оплаты fulfillment не разрешён. Автоматического удаления Order,
освобождения резервов и изменений складской политики в 4.2 нет.

В исследованном storefront submit сохраняется `scheduled_at`, отдельного reservation
доставочного слота с capacity/lease в этом пути не обнаружено. Поэтому worker не
обещает освобождение слота; если такая подсистема есть в другом модуле, её нужно
проверять отдельной задачей.

Неоплаченный Order остаётся активной записью. В `api/admin/clients.js` и пересчёте
customer metrics в `api/admin/orders.js` COUNT/SUM активных заказов не фильтруются
по online payment satisfaction. Такой заказ может учитываться в количестве/сумме
клиентских заказов. Разделение статистики созданных и оплаченных заказов, а также
cleanup abandoned Orders — отдельная задача; эти подсистемы не изменены.

### Файлы и ручная приёмка

Добавлены `src/reconciliation.js` и `migrations/2026-10-10_payment_reconciliation.sql`.
Расширены существующие `src/config.js`, `application.js`, `server.js`, `webhooks.js`,
`provider-operations.js`, `payment-core.js`, `payment-domain.js`, `yookassa-provider.js`,
`checkout.js`, `.env.example`, этот README, `api/helpers/orderPaymentSummary.js`,
`data/order-online-payment.js`, `static/js/shared-order-panel.js` и мастер-TODO.

Проверен только синтаксис JS. Миграция агентом не применялась, сервисы не запускались,
DB/network/provider/browser тесты не выполнялись. Этап остаётся открытым до приёмки:

* Нет webhook/return: тестовая оплата должна автоматически обновить Payment и Order.
* Timeout create и повторный timeout: один provider Payment, прежний key и payload.
* Перезапуск во время claim; два экземпляра; webhook/return одновременно с worker.
* Provider timeout/429/5xx/неверный Secret, исправление Secret, archived connection.
* Amount/currency/account mismatch, известный ID с 404, horizon и expired recovery.
* Дубликат paid и Outbox delivery; Main Backend OFF с последующей синхронизацией.
* Manual refresh cooldown, отсутствие повторной оплаты при manual_review,
  сохранение Cash/Card/manual/legacy сценариев.

Возвраты, partial refund UX, refund timeout recovery, auto-refund и stock/order cleanup
не реализуются в этом этапе. Следующий этап 4.3 — реальные возвраты.

## Этап 4.1: webhook, Inbox, Outbox и Order consumer

Реализация подготовлена; миграция и настройка хостинга выполняются вручную.
Серверные сценарии ещё не проверены. В существующую панель подключения добавлена
read-only информация об HTTP-уведомлениях: URL, события и последняя обработка.

### Порядок подключения

Локальное тестовое окружение настроено отдельно от production:

* В `.env` Payment Service включены webhooks, test environment и чтение временного
  адреса (`PAYMENT_WEBHOOK_DEV_TUNNEL=1`). Callback указывает на локальный backend;
  доверены только loopback proxy peers. Официальный allowlist ЮKassa сохранён.
* В корневом `.env` включён `PAYMENT_ORDER_RELEASE_WORKER_ENABLED=1`.
* Для временного адреса: `npm run payment:webhook:tunnel`. Команда переиспользует
  существующий `scripts/dev-pwa-tunnel.js` в отдельном payment режиме, с локальным
  фильтром на 127.0.0.1:3501. Порт 3000 не занимает. Только POST webhook доступен
  через HTTPS; остальные пути возвращают 404. Режим работает только через cloudflared,
  без автоматической подмены tunnel provider. Сервис не публикуется целиком.
  Для тестового туннеля явно выбран HTTP/2: QUIC в текущей локальной сети завершается таймаутом.
  При настройке 10.10.2026 Cloudflare сообщил недоступность TCP и UDP до tunnel edge
  (порт 7844); HTTPS-адрес был выделен, но соединение не установлено. Процесс остановлен,
  файл временного адреса удалён. Для повторного запуска нужен доступ сети к Cloudflare Tunnel.
* Cloudflare передаёт исходный IP через `CF-Connecting-IP`; loopback фильтр
  пересылает только этот одиночный валидный IP, JSON и тело <=32 KB в Payment Service.
  Клиентские Authorization/cookies/X-Forwarded-For не пересылаются.
  [Документация Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
* Адрес находится в `tmp/dev-payment-webhook-tunnel.json` и выводится командой.
  Карточка «Настройки → Платежи» читает его через защищённый API: нажать
  «Обновить информацию», затем «Скопировать адрес». Там же показаны нужные события
  и дата последнего обработанного уведомления, отдельно от проверки реквизитов.
* Скопировать адрес в личный кабинет **тестового** магазина ЮKassa и включить три
  указанных события. Само наличие адреса не подтверждает подписку в ЮKassa.
* Сначала перезапустить основной backend и Payment Service. Временный tunnel
  процесс должен оставаться запущенным. При новом запуске адрес меняется —
  обновить его в кабинете ЮKassa. Статические ENV не переписываются каждым tunnel run.
* Для production отключить `PAYMENT_WEBHOOK_DEV_TUNNEL=0`, задать постоянный
  `PAYMENT_WEBHOOK_PUBLIC_URL=https://YOUR_PUBLIC_HOST/webhooks/yookassa` и выполнить
  настройку reverse proxy ниже. Тестовый туннель не является production deployment.

Агент не запускал backend/Payment Service и не выполнял DB/browser/provider тесты.
Применение миграции пользователь подтвердил; это не заменяет серверную приёмку.

1. Применить `migrations/2026-10-10_payment_webhooks.sql` после всех предыдущих
   payment/provider/Order projection миграций. Это обязательная additive миграция:
   `version`, refresh lease, Inbox, Outbox, consumer dedup и журнал release effects.
2. Выполнить `npm run payment:service:install`. Сервис явно использует `proxy-addr`.
3. В `services/payment-service/.env` установить:
   `PAYMENT_WEBHOOKS_ENABLED=1`,
   `PAYMENT_MAIN_EVENTS_URL=http://127.0.0.1:3000/internal/v1/payment-events`,
   `PAYMENT_WEBHOOK_TRUSTED_PROXIES=127.0.0.1/32,::1/128` **только если Nginx
   подключается к сервису с этих адресов**. При прямом соединении список пустой.
   Сервис остаётся на `127.0.0.1:3500`. Здесь 3000 — адрес уже работающего backend,
   новый процесс на 3000 не запускается.
4. В корневом `.env`: прежние `PAYMENT_SERVICE_URL`, общий
   `PAYMENT_SERVICE_INTERNAL_TOKEN` и `PAYMENT_ORDER_RELEASE_WORKER_ENABLED=1`.
   Корневые и сервисные `.env` не изменены автоматически; значения секретов не выводятся.
5. Настроить HTTPS reverse proxy ниже, затем перезапустить оба процесса.
   Проверить защищённый `/ready` Payment Service: HTTP 200. Наличие `/health` 200
   само по себе не доказывает готовность БД/очередей.
6. В тестовом магазине ЮKassa → HTTP-уведомления вручную указать
   `https://YOUR_PUBLIC_HOST/webhooks/yookassa` и три события:
   `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`.
   В текущей Basic Auth интеграции webhook через API не создаётся.

### Reverse proxy (пример для существующего HTTPS server блока Nginx)

```nginx
# В http{}, один раз:
limit_req_zone $binary_remote_addr zone=payment_webhooks:10m rate=50r/s;

# В существующем server{} с HTTPS/TLS >= 1.2:
location = /webhooks/yookassa {
    limit_except POST { deny all; }
    client_max_body_size 32k;
    limit_req zone=payment_webhooks burst=100 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3500;
    proxy_set_header Host $host;
    # Перезаписать, не добавлять клиентский X-Forwarded-For!
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 3s;
    proxy_read_timeout 10s;
}
location ^~ /internal/ { return 404; }
location ^~ /webhooks/ { return 404; }
```

Не публиковать порт 3500, `/ready`, `/health` и весь `/internal/v1` Payment Service
через общий proxy_pass. Закрыть `/internal/` также на публичном proxy Main Backend:
его consumer доступен только по внутренней сети/loopback. Если перед Nginx есть CDN
или другой proxy, сначала настроить доверие к его точным адресам и перезапись IP;
не включать глобальное доверие к forwarded headers и не добавлять весь Internet
в trusted proxies. На TLS terminator нужен сертификат и HTTPS 443/8443.
Это пример конфигурации, а не заявление о её применении на хостинге.

Официальные требования к уведомлениям и IP-адресам:
[ЮKassa: HTTP-уведомления](https://yookassa.ru/developers/using-api/webhooks).
Текущий allowlist включает IPv4 и IPv6; его можно заменить через
`PAYMENT_WEBHOOK_SOURCE_CIDRS`. При изменении официального списка обновить ENV.

### Гарантии и границы обработки

* POST `/webhooks/yookassa` принадлежит только Payment Service. IP проверяется
  через `req.ip` и явные trusted proxy CIDR. Content-Type — JSON, лимит 32 KB,
  обязательны notification/event/object.id/object.status. Неподдержанный event
  получает 422; неправильный источник — 403; недоступная БД — 503, без ACK.
* HTTP 200 выдаётся только после durable INSERT Inbox. UNIQUE
  `(provider,event_type,object_id)` устраняет concurrent дубликаты; повторный
  запрос увеличивает duplicate counter, сохраняет исходные identity hints и
  получает 200. Уже обработанный duplicate не запускает новый provider GET.
* Inbox хранит только event, object ID, четыре разрешённых metadata references,
  hash их нормализованного представления, correlation UUID и техническое состояние.
  Это не hash полного исходного body. Карточные данные, контакты, credentials,
  Authorization и полный provider body не сохраняются и не логируются.
* Worker сначала ищет Payment по `(provider,provider_payment_id)`; при отсутствии
  — только существующий Payment по internalPaymentId + tenant/store/order hints.
  Не создаёт Payment из webhook и не перебирает ключи магазинов. Неоднозначный
  или неизвестный ID повторяется ограниченно, затем остаётся dead для диагностики.
* Authoritative GET выполняется с credentials исторического connection, включая
  disabled/archived. Ключ читается заново; ротация того же Shop ID допустима.
  Проверяются ID, account/Shop ID, test/live, сумма и валюта. При metadata fallback
  дополнительно все четыре references из **ответа GET** должны совпасть с Payment.
* GET webhook/return/manual refresh использует общий adapter/result contract и
  `operations.get` → `apply` → Payment Core. Per-Payment refresh lease 60 секунд
  не держит транзакцию через HTTP; token/expiry проверяются при transition.
  State machine запрещает регресс оплаченного Payment. Неизвестный provider status
  — ошибка без изменения финансового состояния.
* `succeeded` → paid, `canceled` → cancelled, `waiting_for_capture` → pending.
  Checkout использует `capture=true`; webhook не вызывает capture автоматически.
  Refund events/операции возврата в этот этап не добавлялись.
* Transition + append-only PaymentEvent (`source=provider` и безопасные Inbox
  references) + Outbox UUID/Payment version записываются в одной транзакции.
  No-op не создаёт второй transition/outbox. Первоначальный paid_at сохраняется.
* Main consumer POST `/internal/v1/payment-events` использует service token,
  строгий DTO и лимит 4 KB. Browser JWT не даёт доступ. В том же Order transaction
  сохраняется уникальный event_id, проекция и payment_satisfied_at/release work.
  Перед применением берётся текущий Service snapshot; map Payment versions и
  финансовые invariants защищают от старой проекции. Service не пишет Order tables.
* Fulfillment, списание склада и начисления переиспользуют существующий handler.
  Durable release effects имеют UNIQUE tenant/store/order/effect. Только один
  процесс может перевести pending в sending. Cash/Card и ручные оплаты остаются
  в прежнем workflow, без зависимости от этих очередей.
* Worker backend возобновляет pending release effects после restart. Внешние
  Telegram/MAX/push и печать не обещают exactly-once delivery: после timeout или
  падения между отправкой и локальным ACK результат фиксируется как uncertain.
  Зависший sending через 120 секунд тоже становится uncertain; автоматическая
  повторная отправка запрещена, чтобы не напечатать/не отправить повторно.
  Проверить внешний журнал/print_jobs перед ручным решением. Каналы без настроенных
  получателей пропускаются существующими обработчиками. Ошибки отправки в Online
  flow больше не маскируются успешным результатом общего notification helper.
* Inbox/Outbox claims — условный UPDATE с lease UUID и сроком 120 секунд,
  completion/error update fenced тем же token. Несколько процессов допустимы.
  Poll по умолчанию 1 секунда, до 20 попыток, exponential backoff до 1 часа + jitter.
  Просроченный processing подхватывается после restart. Shutdown прекращает
  claims и ждёт текущую работу до общего deadline. Forced stop сохраняет jobs.
* Main outage сохраняет Payment paid и Outbox pending/dead; DB outage не получает
  webhook ACK. После исчерпания retries события сохраняются, нужна диагностика
  и replay. В этом этапе нет сканирования всех pending/uncertain Payments:
  потерянные webhook и поиск неизвестного create результата — этап 4.2.

### Диагностика и replay (только внутренняя сеть + service token)

GET `/internal/v1/delivery/status` Payment Service возвращает queue counts/status,
oldest, error code, среднюю задержку, durable duplicate count и invalidSinceStart.
Invalid counter локален текущему процессу; rejected events также в структурных логах.
Логи связывают Inbox/request/provider ID и Payment/Order/Outbox IDs, без raw body.
Контролировать dead, старый pending, delivery latency и `order.payment.effect` uncertain.

POST `/internal/v1/delivery/inbox/ID/replay` или `/outbox/ID/replay`:
service token, `x-actor-user-id` положительный ID оператора, body `{}`.
Разрешены только done/dead без активного lease. Сохранённые identity/version
не редактируются. Inbox снова выполняет authoritative GET, Outbox посылает тот же
event UUID. Operator ID и replay фиксируются в структурном operational log.
Replay Outbox не пересылает уже выполненные внешние release effects.

Для расследования delivery effects на Main DB:

```sql
SELECT tenant_id,store_id,order_id,effect,status,error_code,updated_at
FROM order_payment_release_effects
WHERE status IN ('pending','sending','uncertain') ORDER BY updated_at;
```

Retention policy: done Inbox/Outbox можно архивировать через 90 дней после
processed_at; до подтверждения приёмки автоматическое удаление выключено.
Pending/processing/dead, consumer dedup и uncertain effects не удалять.
PaymentEvent и финансовые записи не очищаются вместе с delivery records.
Автоматическую очистку/alerts/админский инструмент для uncertain согласовать отдельно.

### Приёмка пользователем

Агент выполнил только syntax checks и review кода/SQL, без runtime/DB/browser tests.
После миграции и настройки проверить все 27 сценариев задания 4.1, особенно:

* Оплата тестовой картой с закрытием браузера до return: Order обновляется сам.
* Повторные/concurrent webhook, return раньше/позже webhook, старый waiting после
  succeeded: нет регресса paid и повторных stock/benefits/print/notifications.
* canceled и waiting_for_capture не снимают fulfillment hold.
* DB outage при приёме — не 200; restart после Inbox/processing — работа возобновляется.
* Main выключен после Payment paid: Outbox сохраняется, доставка после запуска.
* Provider timeout/429, неизвестный Payment, ID/amount/currency/account/environment
  mismatch, spoofed X-Forwarded-For, чужой IP: финансовое состояние не портится.
* Historical disabled/archived connection и ротация ключа того же Shop ID работают.
* Oversized/non-JSON/unknown event отклоняются; internal API недоступен снаружи.
* Cash/Card/zero-total, штатная остановка и несколько процессов остаются корректными.

Файлы этапа: `api/paymentEvents.js`, `api/public/shop.js`, `server.js`,
`api/{printPush,telegramNotifications,maxNotifications,maxIntegration,chatTemp}.js`,
`services/payment-service/src/{application,checkout,config,durable-queue,payment-core,
payment-domain,payment-provider,provider-operations,server,webhooks,yookassa-provider}.js`,
service package/lock, `.env.example`, этот README, миграция и master TODO.
Далее сохранены отчёты прошлых этапов; их старые ограничения читать с учётом этого раздела.

Сервис владеет Payment/PaymentEvent/PaymentRefund, state machine, транзакциями и
provider registry. Основной backend использует только `data/payment-service-client.js`.
Административный UI подключений работает через Main Backend. Checkout, manual payment
и бизнес-возвраты Orders не подключены к сервису.
Перейти к 1.2 разрешил пользователь; отложенные проверки 1.1 остаются открытыми.

## Реализация 2.2 и отчёт

Реализован технический adapter и проверка подключения; клиентский Checkout по-прежнему
не запускает Payment Service. Реальных запросов с credentials пользователя, тестовых
платежей, тестов и запуска сервисов в этой сессии не выполнялось. Проверены синтаксис JS/EJS
и изменения кода. Миграция подготовлена, но её применяет пользователь.

1. Источники сверены 03.10.2026: [API](https://yookassa.ru/developers/api),
   [interaction format](https://yookassa.ru/developers/using-api/interaction-format),
   [официальная OpenAPI YAML](https://yookassa.ru/developers/api/yookassa-openapi-specification.yaml),
   [test shops](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing).
   YAML получена непосредственно с официального сайта; глобальная security содержит BasicAuth,
   `/me` не переопределяет её. Описание `/me` отдельно перечисляет partner/split/payout сценарии:
   доступность этого read-only метода для конкретного обычного merchant нужно подтвердить
   ручной проверкой. Ответ 403 не заменяется фиктивным verified или созданием платежа.
2. Собственный небольшой HTTP transport на Node fetch/AbortController внутри adapter:
   SDK не добавлен, общие auth/timeout/body-size/error правила находятся в одном месте.
3. `src/yookassa-provider.js`: transport, normalizePayment/normalizeRefund, verify/create/get/
   capture/cancel/refund/getRefund. `src/provider-operations.js`: application orchestration
   и persistent operation journal; не второй Core, не отдельная публичная платежная подсистема.
4. HTTP Basic Shop ID/Secret Key берутся из конкретного encrypted connection перед запросом.
   Secret/Auth/Shop ID не пишутся в operational logs. OAuth не добавлен.
5. Adapter зарегистрирован в общем registry; contract расширен verifyConnection/getRefund/refundable.
   Нормализаторы используются одинаково для create/get/capture/cancel и доступны будущему webhook.
6. UI → POST `/api/admin/payment-connections/:id/verify` → client → internal verify →
   GET `/v3/me`. Только сохранённая revision, manage role, body не содержит plaintext secret.
   Сохраняются verified_at/last_checked_at/verified_revision/verification_code/capabilities snapshot.
7. `account_id` должен совпадать с Shop ID, `test` — с environment. Disabled shop, 401/403,
   mismatch дают определённую ошибку и failed; timeout/network/5xx не объявляют credentials неверными.
8. Методы берутся только из `payment_methods` успешного ответа магазина; unsupported способы
   отображаются как полученная metadata, но test flow принимает только реализованные card/yoo_money.
   Provider API supports capture/cancel/refund/partial refund; конкретный Payment проверяется
   перед capture/cancel/refund. Capabilities не означают, что любой способ доступен любому магазину.
9. pending → pending; waiting_for_capture → pending с provider_status; succeeded → paid;
   canceled → cancelled. Refund pending/succeeded/canceled → pending/succeeded/cancelled.
   Unknown status даёт INVALID_RESPONSE и безопасный log, состояние не продвигается.
10. 401 AUTH_FAILED; 403 ACCESS_DENIED; 429 RATE_LIMITED; 5xx/network UNAVAILABLE;
    deadline TIMEOUT; invalid JSON/schema INVALID_RESPONSE; прочий 4xx REQUEST_INVALID.
    Raw description/headers не передаются наружу. Error содержит retryable/uncertain classification.
11. `payment_provider_operations` сохраняет logical key, operation, payment/connection scope,
    immutable payload hash, UUID provider key до HTTP POST. Разные операции получают разные keys.
    Повтор с другим payload — 409. Ключи не генерируются заново при неопределённом результате.
12. Default provider deadline 3000 ms, Main Backend 5000 ms: оставлен запас для DB/outcome.
    При изменении ENV Main timeout должен быть больше provider timeout с запасом для БД.
    Ограничение ответа 256 KiB, JSON Content-Type, redirect=error, AbortController.
13. Нет автоматического retry. Reserved/uncertain операция блокирует новую операцию Payment.
    Явный повтор того же key использует прежний UUID; старше 23 часов POST retry запрещён,
    поскольку нельзя рассчитывать на бесконечную provider idempotency retention.
    Deadline/in-flight lease сохраняет исход для ручного восстановления; Payment не становится failed
    только из-за таймаута. GET refresh восстанавливает известные provider objects без нового POST.
14. Деньги — decimal strings RUB, BigInt для сравнения/лимитов. No float arithmetic/rounding.
15. Create поддерживает capture true/false, redirect, доверенный ENV return URL, безопасные
    internalPaymentId/tenantReference metadata и централизованную description. Результат проверяется
    по id/status/amount/currency/recipient/test. Не создаёт Order и не меняет его бизнес-статус.
16. Get — GET `/payments/:id`; internal POST `/payments/:id/refresh` применяет результат через Core.
17. Capture — только waiting_for_capture, полная сумма существующего Payment; adapter умеет
    передавать сумму, частичный capture не включён из-за Core invariant captured_amount=amount.
18. Cancel — только waiting_for_capture; pending неподтверждённый платёж не отменяется произвольно.
19. Refund — отдельный Core refund, reservation суммы, POST `/refunds`, полный/частичный.
    POST `/payments/:id/refunds/:refundId/refresh` получает объект и применяет Refund Core transition.
    Кнопка возврата Order не подключена. Все HTTP financial mutations в 2.2 разрешены только test flow.
20. После изменения secret/config прежняя проверка становится stale, если раньше была успешной.
    При первом сохранении остаётся not_checked. Credentials version отличается от display revision:
    название/enabled/scope не делают merchant credentials другими.
21. Tenant/store/payment/connection проверяются до decrypt. Создание требует operational + assignment;
    исторические get/refund используют связанный connection, даже если он disabled/archived.
    Operational вычисляется: enabled + verified + verified_revision=credentials_version + !archived.
22. Shop ID/environment immutable уже при любой Core Payment history (правило 2.1 строже
    минимального запрета после первого provider object). Secret rotation того же merchant разрешена.
23. Logs — requestId/connectionId/paymentId/operation/status/duration/normalized code, без тела
    provider ответа, Authorization, Secret Key, encrypted envelope или карточных данных.
24. Добавлен audit verification_started/verified/verification_failed/secret_rotated.
    DB lease + attempt ID защищают concurrent verification; credentials version защищает старый результат
    от подтверждения новых credentials. Frontend блокирует повторный клик и проверку dirty draft.
25. `migrations/2026-10-03_yookassa_provider.sql`: additive verification fields + operation journal/FK/indexes.
    Миграции 1.1/1.2/2.1 не менялись в этой сессии. Readiness проверяет новую таблицу и поля.
26. ENV: PAYMENT_PROVIDER_TIMEOUT_MS=3000; PAYMENT_PROVIDER_TEST_ENABLED=0;
    PAYMENT_PROVIDER_TEST_RETURN_URL (trusted HTTPS; обязателен при включении test flow).
    Локальный ignored .env дополнен defaults; test flow выключен. Master key/token не менялись.
27. Internal developer endpoint POST `/internal/v1/provider-test/payments`. Только environment=test,
    enabled+verified+assignment, amount <=100 RUB, card/yoo_money, существующий тестовый order ID.
    Сумма/Order scope поступают от доверенного caller с S2S token; FK не доказывает tenant Order,
    поэтому caller обязан проверить принадлежность и использовать отдельный тестовый tenant/store/order.
    Endpoint не опубликован в browser/BFF. Core создаёт Payment/Event; journal precedes provider POST.
28. В проекте есть товарная печать `api/print.js`/`api/printPush.js`, а распознавание фискальных
    расходных чеков через proverkacheka в server.js — учёт расходов, не фискализация онлайн-продажи.
    Не найден подтверждённый production owner отправки чеков для онлайн-оплаты. Перед 3.1 нужно
    определить единственного владельца: существующая ККТ/OFD или merchant flow ЮKassa; согласовать
    receipt customer/items/VAT/payment_subject/payment_mode и возвраты. Это открытый acceptance пункт.
    Test create с fiscalizationEnabled=true блокируется RECEIPT_CONFIGURATION_REQUIRED;
    receipt не синтезируется, бизнес-печать не дублируется и production flow не включается.
    Контракт для 3.1: доверенный backend передаёт receiptData с customer contact и items
    (description, quantity decimal string, amount/currency, vatCode, paymentSubject, paymentMode),
    при необходимости taxSystemCode. Значения берутся из утверждённой фискальной модели,
    не из формы клиента и не из default adapter. Если owner — ЮKassa, adapter преобразует этот
    provider-neutral receiptData в receipt при create/capture/refund; если owner — существующая ККТ,
    второй receipt в ЮKassa не отправляется. До выбора owner этот путь намеренно не включён.
29. Файлы 2.2: service src/yookassa-provider.js, src/provider-operations.js, src/connections.js,
    src/config.js, src/payment-core.js, src/payment-domain.js, src/payment-provider.js,
    src/application.js, src/server.js; service .env/.env.example/README.md;
    data/payment-service-client.js; api/admin/paymentConnections.js;
    static/js/settings-tenant.js; views/partials/home/right.ejs;
    migrations/2026-10-03_yookassa_provider.sql; PAYMENTS_MASTER_TODO.txt.
30. Для 3.1: Checkout/online availability/server amount/return URL/receipt ownership и данные.
    Для 4: webhook/reconciliation/retry worker/бизнес-возврат, production financial execution.
    Заголовок Settings «Платежи» исправлен в существующем sync heading.

### Ручная приёмка 2.2

Сначала применить SQL 2.2 к PAYMENT_DB_NAME сервиса и перезапустить Main Backend/Payment Service.
Мастер-ключ credentials сохранить прежним. Credentials вводить в UI, не публиковать в сообщениях.

A: сохранить неверный Secret Key → Verify → failed/AUTH_FAILED без раскрытия секрета.
B: верные test credentials → Verify → verified, дата, test, методы из реального ответа.
C: live connection с test credentials → IDENTITY_MISMATCH, operational=false.
D: изменить secret после verified → Save → stale → Verify → verified.
E: изменить название → verification сохраняется.
F: изменить Shop ID до history → stale; после Payment history → 409 HISTORY_LOCKED.
G/H: отдельный internal test payment, повторить с тем же key/body, проверить один provider ID.
I: provider timeout → uncertain journal, без Payment failed/слепого нового ключа;
  ручной повтор того же key или refresh известного ID; никаких автоматических повторов.
J: после подтверждения на hosted test page выполнить refresh → paid через Core/Event, без Order changes.
K/L: чужой tenant/assignment не должен дойти до decrypt/provider HTTP.
M/N: disabled/archived connection не создаёт новый Payment; история доступна для get/refund.
O: сеть/provider недоступны → normalized error; остальные настройки и /health не затронуты.
P: проверить browser network/logs/audit/DB: ciphertext вместо secret, секрет отсутствует в responses.
Дополнительно: manage/read permissions, concurrent verify и secret change во время verify;
capture=false → waiting_for_capture → capture/cancel; paid → partial/full refund → refreshRefund;
проверить amounts/currency/id/merchant/test в ответах и отказ при неизвестных статусах.

Пример developer вызова из корня проекта (выполнить вручную после настройки ENV):
в service .env включить test flag и доверенный HTTPS return URL, затем перезапустить сервис.
Ниже заменить ID на отдельный существующий тестовый Order своего tenant/store/connection.
Не использовать реальные бизнес-заказы: Payment Core history привязана к Order.

```powershell
@'
require('dotenv').config({quiet:true});
const key='REPLACE_WITH_UUID_V4_AND_REUSE_FOR_RETRY';
fetch(process.env.PAYMENT_SERVICE_URL+'/internal/v1/provider-test/payments',{
 method:'POST',headers:{'content-type':'application/json',
  'x-payment-service-token':process.env.PAYMENT_SERVICE_INTERNAL_TOKEN,
  'x-tenant-id':'1','x-store-id':'1','idempotency-key':key},
 body:JSON.stringify({orderId:'REPLACE',providerConnectionId:'REPLACE',
  amount:'1.00',currency:'RUB',method:'card',capture:false})
}).then(async r=>console.log(r.status,await r.text())).catch(e=>console.error(e.name));
'@ | node
```

Остальные internal операции с теми же S2S/tenant/store headers:

| Method | Path | Body / key |
|---|---|---|
| GET | /internal/v1/payments/:id | локальная Core projection |
| POST | /internal/v1/payments/:id/refresh | `{}`; read-only provider GET, без key |
| POST | /internal/v1/payments/:id/capture | amount/currency, новый стабильный key |
| POST | /internal/v1/payments/:id/cancel | `{}`, новый стабильный key |
| POST | /internal/v1/payments/:id/refunds | amount/currency/reason?, новый стабильный key |
| GET | /internal/v1/payments/:id/refunds | local list |
| POST | /internal/v1/payments/:id/refunds/:refundId/refresh | `{}`; без key |

Для внутреннего verify нужен также x-actor-user-id, body revision; browser использует BFF.
Ни один runtime сценарий в этом списке агентом не запускался. STAGE-2.2 остаётся открытым.

## Реализация 2.1 и отчёт

1. Переиспользованы Settings sections/lifecycle, карточки, `ensureTab`, `setActiveRightTab`,
   общий footer и `window.AppModal`; второго менеджера вкладок или модалок нет.
2. В `views/partials/home/left.ejs` добавлен пункт «Платежи» рядом с остальными настройками.
3. В `center.ejs` добавлен список: провайдер, название, филиалы, режим, enabled.
   Сортировка enabled DESC/provider/name/id, loading/error/retry через общий lifecycle;
   empty появляется только после успешного ответа. Используется существующий «+».
4. Один редактор в `right.ejs` показывает активный draft; вкладки принадлежат текущему manager.
5. Новый draft получает UUID и сначала предлагает backend-каталог провайдеров. БД меняется
   только по Save. При создании ID вкладки заменяется на connection ID в том же DOM-элементе.
6. Draft и secret живут только в памяти страницы. Input/change обновляют dirty state;
   переключение не теряет ввод, закрытие/отмена используют AppModal, уход со страницы — beforeunload.
   Ошибка сохраняет форму; успешный Save очищает введённый secret. Read-only пользователи не могут менять поля.
7. Admin API: `GET /api/admin/payment-connections/providers`, GET list/detail,
   POST create, PATCH `/:id`, POST `/:id/archive`. Все через JWT middleware и PaymentServiceClient.
8. Internal API: `/internal/v1/payment-providers`, `/internal/v1/provider-connections`
   с теми же CRUD/archive методами. Требуются internal token, tenant headers, actor ID при изменении.
9. Connection расширен verification_status/configuration/credentials_encrypted/
   credentials_version/scope_type/revision/archived_at. DTO возвращает createdAt/updatedAt,
   credentials.secretKeyConfigured и hasHistory. Provider/tenant/id неизменяемы.
10. `payment_connection_stores` с tenant-scoped FK использует реальные `ten_stores`;
    копии филиалов нет. All означает динамически все текущие и будущие филиалы.
11. Routing slot в 2.1: tenant + provider + environment для online подключения.
    Два enabled подключения этого slot не могут иметь пересекающийся all/selected scope.
    Test и live независимы. Disabled подключения могут пересекаться.
    Изменения сериализуются tenant guard в транзакции; revision отклоняет устаревший PATCH/archive.
    Core проверяет scope перед новой попыткой Payment, архивированные подключения не принимает.
12. В проекте нет отдельного ACL платежей: использован существующий role pattern.
    Owner/admin: read/manage; manager: read; courier: нет доступа. Main Backend каждый запрос
    проверяет актуальную роль активного app_users в своём tenant, не доверяет роли из body.
13. Secret шифруется AES-256-GCM с новым nonce, authentication tag и AAD tenant/connection.
    Ciphertext записывается в JSON только после шифрования. Ошибка приводит к rollback.
14. `PAYMENT_CREDENTIALS_MASTER_KEY` — 32 bytes в hex, только ENV Payment Service.
    Локальный ключ настроен в ignored `services/payment-service/.env`, значение не опубликовано.
    На hosting нужно безопасно перенести этот ключ, если используются эти же зашифрованные записи.
    DB backup содержит ciphertext; ключ хранить и резервировать отдельно. Простая замена ключа
    без перешифрования сделает старые credentials недоступными.
15. DTO построен по allowlist: secret и encrypted envelope не возвращаются браузеру,
    не записываются в audit/logs. Расшифрование доступно только серверному provider module.
16. PATCH без `credentials` оставляет прежний ciphertext. Явный null/пустой secret/mask отклоняется;
    UI никогда не отправляет маску, пустое password-поле при редактировании означает «без изменения».
17. Замена credentials либо режима/Shop ID сбрасывает verification в not_checked.
    При наличии любой истории Payment режим и Shop ID заблокированы на сервере и в форме.
    Enabled не означает verified; проверки ЮKassa ещё нет, кнопка disabled.
18. Append-only audit: created, updated, credentials_changed, enabled, disabled,
    archived, store_assignments_changed. Только actor/tenant/connection/request ID и безопасная metadata.
19. Новая additive migration: `migrations/2026-10-03_payment_provider_connections_admin.sql`.
    Старые применённые SQL не изменены. Новую миграцию применяет пользователь перед запуском этой версии.
20. ENV: `PAYMENT_CREDENTIALS_MASTER_KEY`, `PAYMENT_CREDENTIALS_KEY_VERSION` (1).
    Envelope содержит format version, algorithm, keyVersion; rotation UI и автоматической rotation нет.
21. Файлы текущей сессии 2.1: три home EJS partials; `static/js/settings-tenant.js`;
    `static/css/style.css`; `api/admin/paymentConnections.js`; `api/middleware/auth.js`;
    `server.js`; `data/payment-service-client.js`; service `src/connections.js`, `src/config.js`,
    `src/server.js`, `src/application.js`, `src/payment-core.js`, `src/payment-domain.js`,
    `src/payment-provider.js`; `.env.example`, ignored `.env`; этот README;
    SQL migration и `Задания/онлайн-оплаты/PAYMENTS_MASTER_TODO.txt`.
22. Для 2.2 оставлены настоящий YooKassaProvider, внешняя проверка credentials,
    capabilities и sandbox payment. Реальных provider calls, SDK, checkout, redirect,
    webhook, reconciliation, capture/cancel/refund в этом этапе не добавлено.

### Проверка и приёмка 2.1

В этой сессии выполнены только JS syntax checks, EJS compilation и review diff.
Тесты, сервер и браузер не запускались. Миграция не применялась агентом.
Этап не помечен завершённым: нужны runtime/DB/UI сценарии после применения SQL на hosting.
Ранее `/ready` локально возвращал 503 из-за недоступности hosting MySQL; это не заменено заглушкой.
Readiness теперь проверяет восемь таблиц, включая новые assignments/guard/audit.

Порядок ручной проверки после миграции и настройки ENV на hosting:

- A: открыть Settings → Платежи; проверить loading, empty/list, раздел «Компания → Способы оплаты».
- B: «+» → выбор ЮKassa → заполнение → Save; до Save запись в БД отсутствует.
- C: несколько новых и существующих вкладок, переключение сохраняет ввод; повторное открытие не создаёт дубль.
- D: закрытие dirty draft/Отмена требуют подтверждения; успешный Save сохраняет позицию вкладки.
- E: редактировать название/филиалы с пустым Secret Key; старый ciphertext не меняется.
- F: заменить Secret Key; ciphertext/credentials_version меняются, verification становится not_checked.
- G: selected применяет только выбранные филиалы; all автоматически включает вновь созданный филиал.
- H: пересечение enabled подключений одного provider/environment (selected/selected и all/selected)
  даёт 409; повторить параллельно из двух сессий; разные environment не конфликтуют.
- I: другого tenant connection ID недоступен для чтения, PATCH и archive; чужой store ID отклоняется.
- J: manager читает, не изменяет; прямой mutation API даёт 403.
- K: courier не видит пункт, прямой API даёт 403; owner/admin управляют.
- L: archive закрывает вкладку, убирает карточку, сохраняет запись/audit/историю;
  новая Payment attempt с этим connection отклоняется.
- M: при остановленном Payment Service остальные настройки/заказы работают;
  только раздел платежей получает ошибку с повтором.

Дополнительно: malformed/null PATCH даёт 400; устаревшая revision — 409;
отсутствующий encryption key отклоняет замену secret без изменений в БД;
credentials отсутствуют в GET/POST/PATCH responses, logs и audit;
проверить UI на мобильной ширине и блокировку Shop ID/environment при Payment history.
Никакой ручной сценарий выше пока не отмечен пройденным.

## Структура и изменения 1.1

```text
services/payment-service/
  src/config.js             конфигурация процесса и собственного DB pool
  src/server.js             HTTP, auth, correlation, logging, shutdown
  src/application.js        DTO и application boundary
  src/payment-core.js       единственная реализация Core из 1.1
  src/payment-domain.js     деньги, состояния, ошибки, sanitization
  src/payment-provider.js   контракт и пустой registry
  package.json / package-lock.json / .env.example
```

Три существующих JS-модуля перенесены из `services/`, не скопированы.
Core больше не делает SELECT/UPDATE Orders и не использует его строку как mutex.
Минимальная additive-миграция
`migrations/2026-10-03_payment_service_order_guards.sql` добавляет одну техническую
таблицу `payment_order_guards` с PK `(tenant_id,store_id,order_id)`.
INSERT/SELECT FOR UPDATE этой строки сериализует попытки оплаты одного заказа.
Миграцию 1.1 не меняли. Новую миграцию пользователь применяет самостоятельно.
Существующие FK Payment → Order/Store/Tenant сохраняются; используется текущая MySQL,
отдельный PostgreSQL instance не нужен. Рекомендуется отдельный DB user сервиса:
SELECT/INSERT/UPDATE платежных таблиц, SELECT/INSERT событий, доступ к guard,
без прав удаления истории, DDL и изменения Orders. Runtime не запускает миграции.

Авторизованный Main Backend отвечает за существование и принадлежность Order,
его final amount и legacy/manual is_paid перед вызовом сервиса. Сервис доверяет
этому internal контексту, не обращаясь за данными Orders. Старый FK проверяет
существование order_id, но не принадлежность tenant/store: последнюю обязан
проверять доверенный backend. Внешних маршрутов для браузера на 1.2 нет.
Invariant одного captured Payment обеспечивается Core под платежным guard;
legacy is_paid теперь проверяется вызывающим Orders при orchestration этапа 3.x.

## Запуск и ENV

1. Применить миграции 1.1 и guard (пользователь подтвердил применение обеих).
2. Скопировать `.env.example` в `services/payment-service/.env`.
3. Заполнить PAYMENT_DB_HOST/PORT/USER/PASSWORD/NAME и случайный
   PAYMENT_SERVICE_INTERNAL_TOKEN (32–256 ASCII-символов без пробелов).
4. `npm run payment:service:install`, затем `npm run payment:service:start`.

Для Main Backend в корневом `.env`:

```dotenv
PAYMENT_SERVICE_URL=http://127.0.0.1:3500
PAYMENT_SERVICE_INTERNAL_TOKEN=<тот же внутренний токен>
PAYMENT_SERVICE_TIMEOUT_MS=5000
```

Сервис читает собственный `.env` относительно своего каталога; переменные окружения
процесса имеют приоритет. DB_* основного backend автоматически не используются.
PAYMENT_SERVICE_HOST=127.0.0.1, PORT=3500, SHUTDOWN_MS=15000;
PAYMENT_DB_POOL_SIZE=8, CONNECT_TIMEOUT_MS=5000. Config validation обязательна;
отсутствующий token/DB config — явная ошибка старта. Порт 3000 запрещён.
Provider credentials отсутствуют. Реальные секреты не записывались и не коммитились.

Health `/health` — 200 о жизни процесса, не проверяет БД/банк.
Readiness `/ready` требует internal token и проверяет чтение пяти платежных таблиц,
включая guard; ошибка БД/схемы даёт 503 или нормализованный 500 для неожиданной ошибки.
Readiness не создаёт платежей. Отсутствие adapter не делает процесс нездоровым.
SIGINT/SIGTERM: закрыть listener, дождаться HTTP операций, закрыть pool.
По истечении SHUTDOWN_MS принудительный выход с кодом 1; исход финансовой операции
может быть неопределённым, потому автоматического retry нет.
Не публиковать `/internal/*` и `/ready` через внешний reverse proxy.
Будущий публичный webhook будет отдельным маршрутом, сейчас его нет.

## Internal API

Все `/internal/v1/*` требуют `x-payment-service-token`.
После auth tenant/store берутся только из `x-tenant-id` / `x-store-id`.
Эти значения Main Backend берёт из проверенной серверной сессии/Order, не из browser body.
Token сравнивается через timingSafeEqual двух SHA-256 digests; пустая auth недопустима.
Auth выполняется до JSON parsing; body limit 16kb. Лишние поля отвергаются.

| Метод | Путь | Результат на 1.2 |
|---|---|---|
| POST | /internal/v1/payments | Создать только Core entity со статусом created |
| GET | /internal/v1/payments/:id | Scoped Payment DTO |
| POST | /internal/v1/payments/:id/capture | 503 PAYMENT_PROVIDER_NOT_CONFIGURED |
| POST | /internal/v1/payments/:id/cancel | 503 PAYMENT_PROVIDER_NOT_CONFIGURED |
| POST | /internal/v1/payments/:id/refunds | 503 PAYMENT_PROVIDER_NOT_CONFIGURED |
| GET | /internal/v1/payments/:id/refunds | Scoped Refund DTO list |
| GET | /health | Liveness без auth |
| GET | /ready | DB readiness с auth |

POST Payment body:

```json
{
  "orderId": "123",
  "providerConnectionId": "1",
  "amount": "2490.50",
  "currency": "RUB",
  "channel": "online",
  "method": "card"
}
```

Все POST требуют `Idempotency-Key` (не поле body). Capture принимает amount/currency;
cancel — `{}`; refund — amount/currency/reason?. До обращения к registry выполняется
scoped поиск Payment, чужой ID даёт 404. Пустой registry означает отсутствие
банковской операции: capture/cancel/refund не меняют финансовые записи и не создают
фиктивные successful results. Полноценное выполнение появится с adapter в 2.2.
Fake YooKassa/TestProvider не создавались. CRUD connections — этап 2.1.
Доступного HTTP endpoint для произвольного изменения status нет.

Успех: `{ok:true,data,requestId}`. Payment DTO содержит id, tenantId/storeId/orderId,
providerConnectionId, provider/environment/channel/method, amount/currency/status,
capturedAmount/refundedAmount, confirmation и UTC timestamps.
Refund DTO содержит id/paymentId, amount/currency/status/reason и UTC timestamps.
Внешние SDK objects, raw metadata/provider_data, encrypted values, idempotency keys
и DB rows в DTO не выдаются. Все деньги — decimal strings, вычисления Core — BigInt.

Ошибка: `{ok:false,error:{code,message,requestId}}`, без stack/SQL/credentials.
400 invalid input; 401 auth; 404 scoped entity/route not found; 409 state/idempotency;
422 amounts/business invariant; 503 provider not configured или DB unavailable;
502 provider error; 500 unexpected. SQL duplicate нормализуется в idempotency conflict,
lock timeout/deadlock — в retryable availability error без автоматического повторения.

## Idempotency, транзакции и correlation

Core использует UNIQUE `(tenant_id,idempotency_key)` и сравнение всех значимых полей
Payment/Refund (payload fingerprint через сравнение, без новой hash-колонки).
Повтор создания Payment возвращает существующую запись, изменённые поля дают 409.
Disabled connection не мешает точному replay созданной entity; новый Payment требует enabled.
Конкурентный SQL conflict не скрывается: HTTP 409/503. Provider POST ещё не выполняются;
их durable operation idempotency будет реализована в следующих этапах.

Порядок блокировок Core: платежный guard → Payment → Refund; при create также Connection.
Payment transition + event, Refund + event + Payment aggregates остаются атомарными
в одной транзакции. HTTP controller не пишет финансовые таблицы.
Неуспех rollback не подменяет исходную ошибку; соединение всегда освобождается.
Refund reservation считает created/pending/succeeded под locking read,
сумма не превышает captured_amount; повтор успеха не увеличивает refund aggregate.
Append-only triggers и исторические composite FK из 1.1 сохраняются.

Request ID: `x-request-id` до 64 ASCII букв/цифр/_/- или сгенерированный UUID;
возвращается в header/JSON и структурированном логе операции.
Логи содержат operation, requestId, tenant/payment/order/provider (когда известны),
duration/result; INFO для успеха, WARN для ожидаемых business/provider/service errors,
ERROR для неожиданной внутренней ошибки.
Body, headers, Secret, raw payload, DB exceptions и stacks не логируются.
Application/API boundary позволяет позже добавить metrics без обходных путей.

## Main Backend client и optional service

Единственный клиент — `data/payment-service-client.js`, по принятому pattern
`data/address-service-client.js`. В server.js установлен через
`app.set('paymentServiceClient', createPaymentServiceClient())`.
Будущий серверный controller берёт его из `req.app.get('paymentServiceClient')`.
Клиент не импортирует service internals или DB и не предоставляет browser endpoints.
Token остаётся в серверном environment/closure, не попадает в EJS locals или frontend.

Методы: createPayment/getPayment/capturePayment/cancelPayment/createRefund/getRefunds/
health/readiness. Context: tenantId/storeId, paymentId для адресных запросов,
idempotencyKey для POST, requestId опционально. Body создаётся отдельно.
При отсутствии конфигурации вызов даёт PAYMENT_SERVICE_NOT_CONFIGURED, но создание
клиента не мешает старту Main Backend. URL credentials/query/redirects запрещены.
Каждый запрос имеет AbortController timeout, включая чтение response body.
Сеть/timeout — PAYMENT_SERVICE_UNAVAILABLE/TIMEOUT; POST uncertainty явно отмечается
флагом error.uncertain. HTTP errors не возвращают raw response.
Ни GET, ни POST автоматически не повторяются. GET можно повторить вручную;
POST — только с исходным ключом и тем же payload. Timeout не означает rollback.
Health не вызывается перед финансовой операцией.

Main Backend не читает/меняет payment tables: SQL находится только внутри сервиса.
При service OFF каталог/Orders/admin сохраняют прежние пути; PaymentClient вызовы
дают нормализованную ошибку. Runtime UI подтверждение этого сценария не выполнялось.

## Проверка и границы готовности

Выполнены node --check новых/перенесённых модулей, client и server.js,
git diff --check; рассмотрены diff, auth-before-body, scoped access, state boundary,
таймауты, Order isolation, locking reads и сохранение транзакционных операций.
Создан service package-lock через npm --package-lock-only --ignore-scripts;
зависимости/версии соответствуют существующему проекту.
Тесты, сервер и браузер не запускались согласно AGENTS.md. Порт 3000 не занимался.
2026-10-03 пользователь подтвердил применение
`migrations/2026-10-03_payment_service_order_guards.sql`.
Runtime/DB concurrency/auth/shutdown ещё не подтверждены,
поэтому STAGE-1.2 не отмечается. Непройденные проверки 1.1 также не закрываются.

Ручная приёмка после конфигурации и применения guard:

1. Service OFF: старт Main Backend, admin/catalog/legacy Orders работают.
2. Service ON: `/health` → 200; `/ready` с токеном → 200 после миграций.
3. Internal request без/с неверным token → 401; broken JSON после auth → 400.
4. На искусственном Order/Connection: POST Payment дважды с одним key → один id;
   changed amount с тем же key → 409; foreign tenant/store GET → 404.
5. GET refunds чужого Payment → 404; capture/cancel/refund существующего → 503
   PAYMENT_PROVIDER_NOT_CONFIGURED без financial mutations.
6. На отдельной test DB проверить Core atomic rollback, concurrent Payment/refunds,
   invalid state transition и append-only/FK/CHECK. Их нельзя проверить через
   произвольный HTTP status endpoint — такого endpoint намеренно нет.
7. SIGTERM во время активного запроса: ожидание или явный shutdown deadline;
   DB outage: liveness остаётся 200, readiness неуспешна.

Этапы 2–4: credentials/UI/connection assignments, реальные provider operations,
checkout/paid projection/fulfillment, webhook, outbox, reconciliation/recovery и банковские refunds.
Пользователь подтвердил отдельный запуск через npm run payment:service:start на 3500
и успешный ответ /health {ok:true,status:ok}. Пункты 1.2-02 и 1.2-028 отмечены.
Авторизованный /ready вернул 503 PAYMENT_SERVICE_NOT_READY; точная причина
этим ответом не установлена. Успешная readiness, graceful shutdown и сценарий
Main Backend при Service OFF пока не подтверждены; 1.2-09/10 и STAGE-1.2 открыты.
Последующая диагностика 1.2-09: прямое подключение mysql2 с конфигурацией сервиса
вернуло ETIMEDOUT до проверки таблиц. /health подтверждён 200, /ready — 503.
Shutdown handler проверен на отдельном процессе с портом 3501: во время активного
/ready вызван зарегистрированный SIGTERM handler через process.emit (не системный
SIGTERM Windows), запрос дождался своего DB timeout, pool закрылся, записан
service.shutdown completed, exit code 0, длительность около 8.2 секунд.
Реальная доставка SIGTERM операционной системой этой проверкой не подтверждена.
Добавлены безопасные логи завершения/ошибки закрытия pool; start экспортирован
для запуска того же lifecycle в отдельном процессе. Пункт 1.2-09 остаётся открытым:
нужен доступ к MySQL и успешный /ready 200. Настройки/секреты БД не изменялись.
Для последующего серверного развёртывания пользователь запросил единый скрипт
настройки ENV, установки, запуска/автоперезапуска и health/readiness проверки;
миграции остаются отдельным шагом пользователя. Этот скрипт пока не реализован.
Файлы migrations/ и Задания/ игнорируются Git; их нужно отдельно включить при будущем
коммите. Commit/push и изменение AGENTS.md этой работой не выполнялись.

## Этап 3.1: текущая реализация и ручная приёмка

Реализован инициирующий Checkout для test. Live пока заблокирован; ручные сценарии
и миграция этой сессией не выполнялись. Тесты запрещены AGENTS.md, пункт 27.
Проверка синтаксиса не заменяет runtime-приёмку. Cash/Card используют прежний поток.

Перед проверкой применить `migrations/2026-10-04_checkout_online_payment.sql`:
он добавляет `ten_tenants.online_receipt_config` и Order payment gate/snapshot.
Затем перезапустить Main Backend и Payment Service. В локальных ENV установлены:

```dotenv
# services/payment-service/.env
PAYMENT_CHECKOUT_ENABLED=1
PAYMENT_CHECKOUT_ENVIRONMENT=test
PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN=1
# .env Main Backend
PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN=1
PAYMENT_CHECKOUT_RETURN_ORIGINS_JSON={"1":"http://localhost:3000"}
```

Tenant 1 взят из текущего UI; для другого tenant нужен его собственный trusted origin.
Origin должен совпадать с витриной, чтобы после возврата работал гостевой доступ.
HTTP разрешён только loopback и только в test. Для сервера использовать HTTPS
домен tenant, отключить локальный флаг. Порт 3000 агент не занимал.

Параметры чеков заполняются в **Компания → Способы оплаты → Чеки онлайн-оплаты**,
по просьбе пользователя. Сохранение доступно owner/admin. Налоговая система, НДС
товаров/доставки, предмет/способ расчёта не получают выдуманных значений по умолчанию.
Это общая ставка каталога: смешанные ставки требуют модели налогов по позициям.
В нефискализированном test-магазине receipt можно не передавать; фискализированный
магазин требует настроенные параметры и контакт покупателя.

Отчёт по 34 вопросам задания:

1. Расширен прежний `openCheckoutView` и существующая AppModal; нового Checkout нет.
2. Final total рассчитывает `createOrder` в `api/public/shop.js`. Online конфигурации
   каталога валидирует `api/helpers/orderOnlinePricing.js`; client prices/snapshot игнорируются.
3. Delivery store определяет прежний delivery quote, pickup проверяется по tenant.
   Submission scope остаётся прежним; Payment использует окончательный store Order.
4. Availability API проверяет store, бизнес-способ Online и operational Service route.
5. Service `src/checkout.js` выбирает единственное enabled/verified/неархивное
   подключение нужного environment и store scope.
6. «Способы оплаты» — бизнес-выбор, «Платежи» — merchant route; отключение одного
   филиала не выключает Online глобально. Включение требует operational route.
7. Сохраняется прежний Order transaction с items/total и новым payment gate.
8. Main вызывает Service через единый PaymentServiceClient, не читает payment tables.
9. Commit Order предшествует provider request; Order transaction не держится во время HTTP.
10. Использованы прежние UUID, fingerprint, in-flight Map и unique Order submission.
11. Core idempotency/order guard переиспользуют активную Payment attempt.
12. Provider journal хранит UUID, payload hash, receipt/return URL и lease;
    повтор create использует `checkout:<paymentId>` и прежний provider UUID.
13. Конкуренцию ограничивают order guard, Payment row lock и operation lease;
    concurrent tabs/DB acceptance ещё не выполнены.
14. Pending/waiting с той же суммой переиспользуется, merchant остаётся историческим.
15. Явный POST pay работает с существующим Order; после cancelled/failed нужен новый UUID.
16. Captured/paid защищён от новой оплаты; ручной is_paid не открывает gateway gate.
17. Browser получает безопасный payment DTO и action `{type:"redirect",url}` либо null.
18. Return URL формируется по trusted tenant domain/ENV; request Host не используется.
19. Возврат показывает фактический provider status и явные refresh/pay actions.
20. Timeout сохраняет Order и uncertain journal, не объявляет платёж failed.
21. Service outage после commit возвращает сохранённый Order с payment error.
22. YooKassa outage не отменяет Order. До commit недоступность Online отклоняется явно.
23. Неоплаченный Order виден администратору и публикуется в прежний SSE.
24. `orderFulfillment.js` используется в print/status consumers; production print
    исключает неоплаченные Online Orders. Stock on_create отложен до подтверждения.
    Новый reservation ledger не создавался; stock shortage после оплаты требует
    бизнес-разрешения следующими этапами, без автоматического refund.
25. Нулевая сумма — `not_required`, без gateway Payment.
26. Полный PUT нового Online Order заблокирован для защиты immutable snapshot.
    Изменение суммы с безопасным завершением прежней attempt остаётся незавершённым
    сценарием 3.1-067/068/069. Legacy Cash/Card edit/refund не изменены.
27. SQL/Service scope включает tenant/store/order. Customer обязан владеть Order;
    гостю нужен x-order-payment-token из результата оформления, хранимый на origin.
    Один публичный UUID доступа к Payment не даёт.
28. Используются прежние append-only Core create/transition events; отдельного журнала нет.
29. Добавлены public availability, pay, payment status и internal checkout API;
    ответ Order submit расширен additive полями payment/paymentAccessToken.
30. Новая migration — `2026-10-04_checkout_online_payment.sql`, применяется пользователем.
31. Изменены Shop, admin Orders/tenant, print, Service/client, текущие Company/Checkout;
    новые domain/helper файлы находятся в существующих папках.
32. Ручные сценарии не выполнялись: нужны Cash/Card с Service OFF, redirect/return,
    double submit, concurrent tabs, refresh без create, failed/cancelled retry,
    amount tampering, чужой tenant/customer/guest, смена филиала, disabled connection,
    outages, zero total, fulfillment/stock и сложная корзина. Полный A–Z список — в TODO.
33. Чеки через ЮKassa выбраны пользователем. Receipt строится сервером из Order,
    с контактом, скидками/бонусами, доставкой и точными копейками; неподдерживаемые
    или непредставимые строки отклоняются. Отправка чеков ещё не проверена.
    Справочник полей: https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/parameters-values
    Процесс платежа: https://yookassa.ru/developers/payment-acceptance/getting-started/payment-process
34. Для 3.2/4: webhook, outbox/reconciliation/recovery, гарантированные уведомления
    после commit, случай «покупатель не вернулся», доплаты/refunds, полный admin UI,
    deployment script. Без возврата/ручного status read Order gate автоматически не обновится.

STAGE-3.1 остаётся открытым: нужны миграция, ручная приёмка и сценарий изменения суммы.
Live дополнительно требует проверки фискализации и production acceptance.
Синтаксическая проверка: 22 JS-файла (`node --check`) и `right.ejs` (EJS compile),
`git diff --check` прошли. Браузер, БД и внешние финансовые операции не запускались.

## Этап 3.2 — состояние оплаты заказа

Перед запуском вручную применить `migrations/2026-10-04_order_payment_projection.sql`
после миграции Checkout и перезапустить Main Backend и Payment Service.
Миграция добавляет только поля/таблицу/триггеры; историю платежей не генерирует.

1. `OrderPaymentSummary` рассчитывает `api/helpers/orderPaymentSummary.js`: required,
   method, state, source, amount/paidAmount/refundedAmount в копейках, RUB, current и
   successful Payment IDs, paidAt, paymentSatisfied, canPay, fulfillmentEligible, anomalies.
2. created — «Подготавливаем оплату», pending — «Платёж обрабатывается»,
   waiting_for_confirmation — «Ожидает оплаты», paid — «Оплачено онлайн», failed —
   «Оплата не прошла», cancelled — «Оплата не завершена», partially_refunded —
   «Частичный возврат», refunded — «Возвращено». Zero total — «Оплата не требуется».
3. Current выбирает Service: successful Payment имеет приоритет, иначе последняя
   попытка по id. Браузер не выбирает попытку.
4. Successful определяется по captured_amount>0, включая историю refund.
   Все successful учитываются в денежных суммах.
5. Satisfaction: zero total либо net captured-refunded покрывает сумму заказа,
   captured равен сумме заказа, отсутствуют duplicate/currency anomalies.
6. Клиент: существующий accordion «Оплата и суммы» показывает state, суммы, оплату
   и проверку. Отменённый оплаченный заказ отдельно сообщает незавершённый возврат.
7. Кнопка переиспользует существующий return dialog и POST pay endpoint 3.1.
   Запрос защищён busy/disabled и UUID idempotency key; guest использует сохранённый
   submission token, customer — существующую авторизацию.
8. Pending без пригодного confirmation не предлагает новую попытку. Failed/cancelled
   разрешают явный retry. Paid/refunded не предлагают повторную оплату.
9. Общая admin панель показывает отдельный блок «Оплата», источник, суммы и дату.
10. История attempts загружается по открытию существующего details, новые сверху:
    ID, state, сумма, provider, connection name, дата. Ошибка истории не скрывает Order.
11. Legacy paid отображается как manual, Payment Core paid — gateway.
12. Обычная ручная отметка для новых Online-заказов заблокирована, включая смену
    способа оплаты. Manual override не реализуется. Cash/Card on delivery сохраняются.
13. Единый predicate `isOrderEligibleForFulfillment` использует тот же summary.
14. Entry points: создание public Order, admin status transition (приёмка/сборка/
    курьерские статусы), on_create/on_status stock, Print API board, printPush,
    Telegram/MAX уведомления, customer push, Orders events/counters.
15. Unpaid Online виден в admin New/counters/events, но переход в производство,
    складское списание, обычная производственная печать и creation notifications held.
16. Оплата снимает hold через существующий synchronizeOnlinePayment. Этот handler
    используют customer return/refresh/pay и admin refresh; обычные Orders GET не используют.
17. Transaction lock и payment_satisfied_at защищают stock/benefits/release от повторов.
    Внешние уведомления и enqueue запускаются только первым release. Это не гарантия
    доставки ровно один раз при аварии после commit: durable delivery/recovery — этап 4.
18. Marker — order_orders.payment_satisfied_at; stock_document_id/stock_deducted_at
    сохраняют существующую складскую идемпотентность. Старые оплаченные Online-заказы
    получают marker при первой явной синхронизации без повторного release, а не
    массовой миграцией истории.
19. Service OFF: Order GET/list работают из локальной проекции; refresh/история явно
    сообщают недоступность. Последнее известное состояние остаётся доступным.
20. Minimal projection JSON хранится у Order для независимого чтения. В нём нет
    credentials, provider IDs/URLs, истории attempts или provider response JSON.
21. Проекцию пишет только общий handler после получения Service snapshot. Pending
    не откатывает известный captured; updatedAt не позволяет старой проекции заменить новую.
22. В списках нет вызовов Service/provider на каждый Order. Проекция читается одним
    существующим SELECT. История — отдельный запрос при явном открытии details.
23. Старые заказы используют is_paid/payment_code; искусственные Payments не создаются.
24. Amount mismatch показывается явно и не снимает hold. Полное редактирование нового
    Online-заказа остаётся заблокированным защитой 3.1; безопасная смена суммы не реализована.
25. Отмена проверяет Service snapshot под Order lock; active attempt блокирует cancel.
    Недоступный Service не разрешает опасную отмену. Paid cancel не означает refund.
26. Order status и Payment state независимы. Новых order statuses/очередей не добавлено.
27. Basic summary доступен по обычным Orders permissions. Provider/history используют
    paymentPermissions из существующей модели ролей. Manual permissions не расширены.
28. Manual paid/unpaid пишут append-only order_payment_audit (actor, scope, amount,
    timestamp) в той же транзакции. Gateway события остаются в PaymentEvent;
    Order update идёт через существующий Orders event stream.
29. Добавлены internal POST checkout/snapshot, admin GET :id/payment и POST
    :id/payment/refresh; Order DTO получает paymentSummary. Public payment response
    тоже содержит summary. Refresh имеет durable cooldown 5 секунд на Order.
30. Миграция: 2026-10-04_order_payment_projection.sql; выполняет пользователь.
31. Файлы этапа: api/helpers/orderPaymentSummary.js, api/helpers/orderFulfillment.js,
    data/order-online-payment.js, data/payment-service-client.js, api/public/shop.js,
    api/admin/orders.js, api/printPush.js, server.js, services/payment-service/src/
    {checkout,application,server,payment-core}.js, static/js/{shop-late,orders,cash,
    clients,shared-order-panel,shared-order-payment}.js,
    views/partials/orders/info_content.ejs, migrations SQL, этот README и master TODO.
32. Runtime/ручные сценарии A–X НЕ выполнены агентом: пользователь запрещает тесты.
    Проверены только синтаксис JS/EJS и diff. Этап остаётся открытым до ручной приёмки.
33. Этап 4: webhook, deduplication, reconciliation/recovery, доставка side effects
    после аварий, настоящие refunds. Legacy refund endpoint для нового Online
    заблокирован, чтобы не показывать возврат без движения денег у провайдера.

Ручная приёмка после миграции: unpaid/paid/pending/failed/cancelled и retry того же
Order; двойной click/двойной return/refresh paid без повторного stock и print;
отключённый Service и provider; legacy Cash/Card/manual paid; attempts с old failed
и newer created после successful; duplicate successful anomaly; отмена с active
gateway и отмена paid без refund; zero total; сумма mismatch; tenant isolation;
50–100 Orders без запросов к Service на каждую строку. UI сценарии и БД ещё не подтверждены.
# Этап 4.4 — эксплуатация и приёмка (11.10.2026)

**LIVE READINESS: BLOCKED.** Это подготовка к проверкам, а не подтверждение production-ready.
Код Order Return dispatch, refund recovery, чеков, support replay и abandoned cleanup
добавлен 11.10.2026; ручная приёмка не выполнена. Новую миграцию применяет пользователь.
Live checkout требует явного production-флага PAYMENT_LIVE_RELEASE_APPROVED=1 после приёмки.

## Что изменено

- `/api/admin/payment-connections/operations/status`: owner/admin, только свой tenant.
  В «Платежи» добавлена кнопка диагностики через существующий AppModal.
  Обновление запрашивается вручную; агрегаты кешируются на 30 секунд, кеш ограничен 32 tenants.
- Диагностика: Payment за 24 часа по currency/environment/status, незавершённые
  ProviderOperation и Refund, backlog Inbox/Outbox, manual_review, duplicate successful
  Payment, расхождения `Payment.refunded_amount` с SUM успешных Refund.
  Истории ограничены 100 строками; полный мониторинг неизвестных webhook остаётся
  в приватном `/internal/v1/delivery/status` для оператора сервиса.
- Alert codes: OUTBOX_DEAD, INBOX_DEAD, ORDER_SYNC_DELAY (старше 300 секунд),
  PAYMENT_MANUAL_REVIEW, DUPLICATE_PAYMENT, REFUND_AGGREGATE_MISMATCH,
  PROVIDER_OPERATION_UNCERTAIN, QUEUE_WORKER_UNAVAILABLE. Это диагностические условия,
  отправка уведомлений во внешнюю систему мониторинга ещё не настроена.
- В диагностике есть «Проверить у провайдера»: owner/admin, tenant/store/payment scope,
  существующий reconciliation/validator/Core, без кнопки ручного Paid.
  Действие фиксируется логом и append-only payment_operational_audit до provider GET.
- Replay очереди разрешён только для `dead`, а не для уже обработанных `done`.
  Операторский endpoint `/internal/v1/delivery/:queue/:id/replay` остаётся приватным;
  передавать service token браузеру нельзя. Browser replay идёт через Main API, проверяет
  owner/admin, tenant, подтверждение; queue UPDATE и append-only audit атомарны.
- Outbox имеет независимый `PAYMENT_OUTBOX_ENABLED`: rollback checkout не должен
  останавливать обслуживание исторических платежей.
- В production запрещены provider test tooling, dev tunnel, local return и просмотр Secret Key.
  Тестовый просмотр ключа, ранее запрошенный пользователем, сохранён вне production.
- Shutdown сначала помечает приложение stopping (HTTP 503), останавливает получение новых
  задач, ждёт HTTP/worker work, затем закрывает pool. Deadline и восстановление DB leases сохранены.
- Retention только `done` Inbox/Outbox с `processed_at`, без действующей lease,
  максимум 100 записей за час на queue instance. Политика выключена до явного выбора сроков.
  PaymentEvent, ProviderOperation, Payment/Refund и receipt snapshots не удаляются.
- Master-key rotation — отдельный CLI в существующем сервисе, без HTTP/browser endpoint.

## ENV и server launcher

Новые параметры:

| Параметр | Поведение |
| --- | --- |
| NODE_ENV=production | Валидация production guardrails, Secret view запрещён |
| PAYMENT_OUTBOX_ENABLED=1 | Независимое обслуживание доставки событий |
| PAYMENT_CREDENTIALS_PREVIOUS_KEYS | JSON object version → hex key; максимум 4 старых ключа |
| PAYMENT_INBOX_RETENTION_DAYS | Явный срок 1–3650 дней; отсутствие выключает cleanup |
| PAYMENT_OUTBOX_RETENTION_DAYS | Аналогично для доставленных Outbox |

Не копируйте локальный тестовый `.env` в production без проверки.
Секреты задаются только на сервере; `.env` не включается в git или обычный SQL backup.
`PAYMENT_CHECKOUT_ENABLED=0`, `PAYMENT_WEBHOOKS_ENABLED=1`,
`PAYMENT_RECONCILIATION_ENABLED=1`, `PAYMENT_OUTBOX_ENABLED=1` — безопасное отключение
новых gateway оплат с сохранением historical servicing. Проверить то же ограничение
на Main Backend. Cash/Card on delivery не должны зависеть от этих flags.

`services/payment-service/deploy.sh` — Linux launcher: проверяет наличие `.env` и mode 600,
делает `npm ci --omit=dev`, валидирует config, затем `exec node src/server.js`.
Он НЕ применяет SQL, не генерирует и не печатает credentials, не настраивает reverse proxy
и не устанавливает supervisor. Shell script ещё не запускался на Linux.
Запускать отдельным непривилегированным пользователем под systemd/существующим supervisor;
для restart использовать SIGTERM, таймаут supervisor должен превышать PAYMENT_SERVICE_SHUTDOWN_MS.
Установить NODE_ENV=production в окружении supervisor. Сервис слушает loopback 3500.
Reverse proxy публикует только POST /webhooks/yookassa, не /internal, /ready или /health.
Отключить логирование authorization, x-payment-service-token, request bodies и secret responses
в reverse proxy/APM. Trusted proxy — только точные реальные peers.

## Controlled encryption rotation

1. Сохранить доступ к старому ключу в отдельном secret storage, не рядом с SQL backup.
2. Выбрать новый уникальный version, установить новый active key и version, старый key
   добавить в PAYMENT_CREDENTIALS_PREVIOUS_KEYS. Не изменять значение существующего version.
3. На rolling deployment сначала обеспечить всем читающим процессам доступ к обоим ключам.
   Только после этого переключить все записывающие процессы на новый active version.
4. `node src/rotate-credentials.js` — dry-run: проверяет расшифровку, ничего не записывает.
5. `node src/rotate-credentials.js --apply` — batch 50, проверка decrypt→encrypt→decrypt,
   compare-and-swap исходного envelope, без изменения credentials_version/verified status.
   При конфликте exit 1; повторить после разрешения конкуренции. Restart-safe: уже новые
   envelope пропускаются. Никакие secret/envelope значения не выводятся в лог.
6. Повторить dry-run, убедиться `remaining=0`, проверить provider GET для test и live отдельно.
7. Старый ключ не удалять, пока не проверены все envelope, работа всех instances и restore
   старых backup. Rotation и rollback/restore пока не проверялись пользователем.

Provider Secret rotation — другой процесс: существующее сохранение подключения, затем
verification новой credentials revision. Shop ID/environment исторического подключения
не менять; новый merchant оформлять новым connection.

## Runbooks

| Случай | Действия |
| --- | --- |
| Payment stuck / деньги списались | Найти tenant/store/order/payment и operation; проверить diagnostics, затем provider GET. Не создавать новую операцию при uncertain и не ставить Paid SQL-командой |
| Paid, Order не обновился | Проверить Outbox callback URL/token, Main Backend, DB; после устранения причины replay только dead Outbox. ACK означает committed Order transaction |
| Dead Inbox | Проверить источник, сопоставление provider ID, merchant/test и доступ GET; исправить причину, затем private replay. Unknown/external Refund не привязывать по сумме |
| Double payment | Сверить оба provider объекта и суммы; остановить fulfillment при anomaly; ручное решение, без автоматического refund дубля |
| Refund завис | Worker выполняет GET известного Refund либо повтор той же durable operation/snapshot/key до 23 часов. После horizon — manual review. Новый attempt разрешён только после definitive failed/cancelled |
| Secret сломан | Остановить новые оплаты, сохранить workers; обновить Secret того же merchant и verify; не менять историческую связь |
| Master-key incident | Отключить новые gateway операции, восстановить нужные versions из отдельного vault; не перешифровывать нерасшифровываемые envelope |
| Restart | Дождаться graceful stop; после запуска /health, authenticated /ready, worker heartbeat и восстановление leases; не переотправлять POST автоматически новым ключом |
| Abandoned Order | Cleanup сначала закрывает новые attempts под Service order guard, проверяет только final failed/cancelled без uncertain операций; затем Main атомарно отменяет новый unpaid Order и освобождает bonus/reward/promo ресурсы. Pending/manual review остаются held |

## Backup / restore / settlement

Backup должен быть согласованным InnoDB snapshot со всеми payment/order tables,
Inbox/Outbox, received event UUID, ProviderOperation request_snapshot и receipt history.
Ключи и internal token хранить отдельно с ограниченным доступом; SQL backup без keys
не позволяет обслуживать исторические connections.

Restore drill проводить в изолированной среде с checkout/provider test mutations выключенными.
До разрешения provider POST сверить время snapshot, операции после snapshot и provider объекты.
При потерянном idempotency key или истёкшем 23h recovery window — manual review,
не генерировать новый key. Восстановить старые key versions, проверить decrypt без вывода secrets,
затем GET, Outbox delivery и только после сверки разрешать новые операции.
Backup/restore drill не выполнен.

Сверка settlement: отдельно test/live и currency, по подтверждённым captured amounts
минус только succeeded Refund. Pending/created не вычитать как завершённые.
Сопоставить provider merchant/export с локальными provider IDs, суммами, внешними Refund,
дубликатами и Order projection. Диагностическая SUM-проверка не является полноценной
банковской сверкой или settlement listing. Unlinked/external refunds требуют расследования.

## Карта write paths и итоговый аудит

| Путь | Владелец / найденное состояние |
| --- | --- |
| Checkout и retry | Main создаёт Order, передаёт committed total через PaymentServiceClient; Service создаёт Payment/ProviderOperation |
| Provider Payment state | provider-operations validator → Payment Core transaction → event/version/Outbox |
| Provider Refund state | Refund Core transaction → aggregates/event/version/Outbox; Main Order Return intent/dispatch/retry |
| Order gateway projection | private api/paymentEvents → public/shop synchronize, received UUID + version guard |
| Manual paid | admin/orders, online mutation заблокирована; обычные cash/manual оставлены |
| Edit order | online order edit guard сохранён; оплаченный состав меняется через refund и новый Order |
| Reconciliation | Только technical scheduling/leases; финансовые изменения через общую provider/Core цепочку |
| Support | Read-only diagnostics, provider refresh; нет ручной установки financial status |

Опасных новых direct-status write paths не добавлено. В Service финансовые UPDATE
найдены в Payment Core, technical UPDATE — в reconciliation/provider lease code.
Legacy code, stock/promo/bonus бизнес-логика и общие методы Cash/Card не удалялись.
Полное доказательство отсутствия bypass/regression по всему Main Backend ещё не получено.

## Отчёт по обязательным пунктам 4.4

1–5. Карта write paths и ownership приведены выше. Legacy не удалялся вслепую;
полный финансовый аудит Main Backend остаётся проверкой.
6–10. Scoped aggregates, alert codes, dead queue detection, manual_review UI и provider
refresh добавлены. Tenant-scoped browser replay и durable support-action audit реализованы;
функциональная проверка остаётся пользовательской.
11. Double successful Payment выявляется группировкой order/store/environment.
12–15. Abandoned cleanup подготовлен под отдельным флагом. Переиспользованы bonus/reward
release и promo usage; online stock до payment satisfaction не списывается. Отдельного
durable stock reservation/slot-capacity механизма в просмотренной модели не найдено.
16–19. Retention configurable/off by default для done queues; ProviderOperation и
append-only PaymentEvent сохраняются, финансовые факты не удаляются.
20–23. AES-GCM/AAD scoped envelope, versioned keyring и CLI rotation добавлены;
production Secret reveal запрещён. В просмотренных provider/connection log paths
секреты не печатаются; reverse proxy/APM и runtime leakage ещё не проверены.
24–25. Backup/restore стратегия выше; restore drill не выполнялся.
26–29. Stopping guard, settled worker shutdown и существующие leases сохранены;
rolling deploy/keyring порядок описан. Новая migration additive, runtime совместимость не подтверждена.
30–34. Load/concurrency/tenant/runtime/CSRF/proxy/SSRF проверки не запускались.
Новые support routes проверяют активную DB role, tenant scope; Main client в production
разрешает plaintext service HTTP только на literal loopback.
35–36. Refund aggregate consistency + settlement runbook; внешний Refund проверяется
authoritative GET по webhook либо явно указанному Refund ID в диагностике. Полный
merchant listing не реализован; внешняя сверка реестра остаётся процедурой оператора.
37–38. Независимый Outbox flag и rollback checkout описаны; отдельный production refund
kill switch PAYMENT_REFUNDS_ENABLED добавлен. Не выключать historical servicing при rollback UI.
39–40. Добавлены индексы operational tenant/window/backlog; constraints и EXPLAIN на БД не проверялись.
41. Нет отдельного provider GET на обычное открытие diagnostics; данные cached и bounded.
Полный performance audit и high-volume load остаются открытыми.
42. Production config отвергает тестовые операции/dev tunnel/local return; registry без нового mock.
43. Этот README обновлён: config, architecture boundaries, failure runbooks, rotation, deployment, acceptance.
44. Новая migration: migrations/2026-10-11_payment_hardening_indexes.sql; применять вручную.
Предыдущие migrations остаются в migrations; применение 2026-10-11_payment_refunds.sql ещё не подтверждено.
45. Файлы сессии: src/config.js, src/connections.js, src/server.js, src/application.js,
src/webhooks.js, src/durable-queue.js, src/reconciliation.js, src/operational-status.js,
src/rotate-credentials.js, .env.example, deploy.sh, README.md;
api/admin/paymentConnections.js, data/payment-service-client.js, static/js/settings-tenant.js,
PAYMENTS_MASTER_TODO.txt и SQL indexes migration.
46. Все новые ENV перечислены выше; реальные значения секретов не документированы.
47–48. Проверен только JS syntax; smoke/failure/browser/DB/provider проверки не запускались.
49–50. Blockers: новая schema не подтверждена, production infrastructure/credentials/webhook
не подтверждены, refund/receipt/restore/concurrency/регрессии не проверены. Live release
flag выключен; наличие реализации не подтверждает готовность к production.

## Что проверяет пользователь перед закрытием

1. Вручную применить indexes migration и подтвердить prerequisites schema, включая Refund link migration.
2. Перезапустить Service; /health 200 и authenticated /ready 200.
3. В Settings → Payments открыть diagnostics, проверить tenant isolation и запрет manager на diagnostics/actions.
4. Создать test Payment; double submit/retry не создаёт вторую успешную попытку.
5. Отключить checkout, оставить Outbox/Reconciliation/Webhook; существующий pending обслуживается.
6. Webhook burst/duplicates, callback outage, dead replay, restart во время lease — без повторных financial effects.
7. Rotation dry-run/apply на копии БД, конкурентная secret replacement, restart посередине, rollback/restore старого backup.
8. Retention на копии: удаляются только старые done, pending/dead/history остаются.
9. Проверить код 4.3: full/partial/pending/failed/uncertain Refund, receipt и внешний Refund.
10. Cash/Card/manual/legacy regression, бонусные/promo reservations и abandoned cleanup.

**LIVE READINESS: BLOCKED.** Этапы и FINAL-READY не закрывать до выполнения prerequisites и проверки пользователем.

### Дополнение 11.10.2026: Refund recovery, support и abandoned cleanup

Перед запуском обновлённого кода вручную применить `migrations/2026-10-11_payment_refund_recovery_and_support.sql` после предыдущих payment migrations, включая `2026-10-11_payment_refunds.sql` и `2026-10-11_payment_hardening_indexes.sql`. Агент миграции не применял.

После миграций для тестов включить в `services/payment-service/.env`:

```dotenv
PAYMENT_REFUNDS_ENABLED=1
PAYMENT_REFUND_RECOVERY_ENABLED=1
PAYMENT_OUTBOX_ENABLED=1
PAYMENT_RECONCILIATION_ENABLED=1
PAYMENT_LIVE_RELEASE_APPROVED=0
```

В окружении Main Backend нужен `PAYMENT_ORDER_RELEASE_WORKER_ENABLED=1` для доставки бизнес-возвратов и обработки результатов. Cleanup включается отдельно: `PAYMENT_ABANDONED_CLEANUP_ENABLED=1`. Оба процесса должны использовать одинаковый `PAYMENT_ABANDONED_ORDER_HOURS` (по умолчанию 72). Текущие `.env` автоматически не переключались: workers нельзя включать до применения схемы.

Возврат оформляется через существующий Order Return. Сумма вычисляется сервером, намерение сохраняется до внешнего запроса, операция и PaymentRefund связываются атомарно. Timeout сохраняет финансовую неопределённость; recovery использует прежние ключ и payload. После истечения безопасного окна повторного POST операция требует ручной проверки. Повтор после окончательного failed/cancelled выполняется через существующую панель возвратов с подтверждением и новой попыткой того же Order Return.

Для частичного фискального возврата нужен email покупателя. Позиции и распределение суммы восстанавливаются из исходного receipt snapshot, статус регистрации чека отслеживается отдельно от движения денег. Полный возврат исходного Payment может не передавать новый receipt. Правила провайдера: [чеки возврата](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/refunds), [возвраты](https://yookassa.ru/developers/payment-acceptance/after-the-payment/refunds).

Внешний возврат принимается по webhook либо через diagnostics с provider Refund ID: Service проверяет его и родительский Payment через авторизованный provider GET. Order Return не придумывается. Неоднозначная связь, конфликт с зарезервированными суммами или неизвестный Payment требуют ручного разбора. Автоматического обхода всех merchant refunds нет; пропущенные уведомления сверяются по реестру провайдера и проверенному импорту.

Support replay доступен только для dead Inbox/Outbox, после явного подтверждения и проверки owner/admin и tenant. Replay и append-only аудит записываются одной транзакцией. Provider refresh/import также оставляют запись о действии оператора; финансовые статусы вручную не выставляются.

Cleanup сначала закрывает создание новых Payment attempts под блокировкой Order guard, затем Main Backend повторно проверяет заказ и освобождает существующие бонусные, promo, gift/reward ресурсы при отмене. Pending/uncertain/manual-review платежи не очищаются. В этой модели нет отдельного резервирования складского остатка неоплаченного заказа; новый механизм резервов не добавлялся.

Ручная приёмка: full/partial refund, повторный submit, failed retry, timeout/restart, receipt pending/canceled, внешний refund, остановка Main Backend и последующая доставка Outbox, cross-tenant/permissions, dead replay и аудит, abandoned cleanup с бонусами/promo, сохранение pending/uncertain заказов, Cash/Card/manual regression. До этих проверок и production-настройки live release остаётся выключенным.

