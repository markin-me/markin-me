# Payment Core — этап 1.1

После реализации 1.2 три JS-модуля перенесены в `services/payment-service/src/`.
Описание ниже фиксирует исходный этап 1.1. Актуальная сервисная граница,
платежный guard вместо блокировки Order и политика проверки legacy is_paid
описаны в `services/payment-service/README.md`.

## Найденные механизмы и границы

`order_orders` владеет составом, клиентом, доставкой, скидками, рассчитанным
`total_price DECIMAL(10,2)` и производственным `status_id`.
`order_payments` — справочник способов (`cash`, `card`, `online`), а не финансовые
транзакции. `order_orders.payment_id` и `order_refunds.payment_id` ссылаются именно
на этот справочник. Ручная отметка использует `order_orders.is_paid` и существующий
PUT /paid в `api/admin/orders.js`. Отдельного gateway `payment_status` не найдено.

Существующий возврат — `order_refunds` + `order_refund_items`, расчёт в
`api/helpers/orderRefunds.js`, транзакционная операция в `api/admin/orders.js`.
Она определяет товары/количества/сумму и остаётся единственной бизнес-операцией
возврата заказа. Будущая интеграция передаст её финансовую сумму в Payment Core.
На этапе 1.1 интеграция намеренно отсутствует.

Tenant — `ten_tenants.id INT`; филиал — `ten_stores(tenant_id,id)`.
Используются MySQL/mysql2, CommonJS, pool из `db.js`, соединение +
beginTransaction/commit/rollback/release и SELECT FOR UPDATE.
Миграции — отдельные SQL в `migrations/`, запуск через `migrate.js`.
Отдельный `services/address-service` имеет свои server/config/db и внутренний HTTP;
платежный сетевой сервис на этом этапе не создаётся.
Отдельного общего admin audit механизма в просмотренном backend не найдено:
возвраты сохраняют actor snapshot, есть технические console logs и request/DB metrics.
PaymentEvent не подменяет admin audit; подключение настроек к audit относится к 2.x.

Orders owns order state. Payment owns financial state. Payment Core принимает
готовую серверную сумму и не пересчитывает заказ. Новые модули нигде не подключены
к действующим маршрутам. Существующие модели, UI, manual payment и refunds не менялись.

## Файлы и схема

- `services/payment-domain.js`: деньги, ошибки, валидация, обе state machine.
- `services/payment-core.js`: транзакционные операции и tenant/store-scoped чтение.
- `services/payment-provider.js`: контракт, capabilities, нормализация и пустой registry.
- `migrations/2026-10-03_payment_core.sql`: четыре новые таблицы и два append-only trigger.
- Этот документ и `Задания/онлайн-оплаты/PAYMENTS_MASTER_TODO.txt`: описание и состояние.

```text
Tenant
 ├── Store (существующий ten_stores)
 ├── PaymentProviderConnection
 │       └── Payments
 └── Order
       ├── Payment #1
       ├── Payment #2
       └── Payment #3
              ├── PaymentEvents
              └── PaymentRefunds
```

`payment_provider_connections`: tenant, provider, name, test/live, enabled,
created_at/updated_at. Credentials отсутствуют.
`payment_payments`: tenant/store/order, connection, provider/environment snapshot,
channel/method, amount/currency, status, внешний ID, idempotency_key, confirmation_url,
captured_amount/refunded_amount, provider_data, технические и терминальные timestamps.
`payment_events`: append-only история, tenant/payment/connection, type, предыдущий/новый
статус, source, provider/provider_event_id, allowlisted metadata, created_at.
`payment_refunds`: tenant/payment/connection, amount/currency, внутренний status,
внешний ID, idempotency_key, reason и timestamps.

Нет UNIQUE на order_id: один Order имеет несколько Payment attempts.
Payment и Refund имеют собственные внутренние ID, отличные от provider IDs.

## Деньги и время

Сохраняется DECIMAL(10,2) в основных денежных единицах. API домена принимает только
десятичные строки: `"2490.50"`, не JS number. В mysql2 необходимо оставить
`decimalNumbers: false` (стандартное поведение текущего `db.js`). Промежуточная
арифметика использует BigInt копейки и обратно возвращает decimal string;
в БД второй формат денег не вводится. Суммы положительные, currency обязательная
строка из трёх заглавных ASCII-букв. Валюты с другой точностью пока не поддерживаются.
ID соответствуют signed INT существующих таблиц.

Новые timestamps — DATETIME(6), записываемые явно UTC_TIMESTAMP(6), независимо от
timezone MySQL session. При дальнейшем HTTP mapping их нужно сериализовать как UTC.
UI преобразует UTC в местное время. Старые timestamps не мигрируются.

## Переходы

Payment:

```text
created → pending | waiting_for_confirmation | paid | cancelled | failed
pending → waiting_for_confirmation | paid | cancelled | failed
waiting_for_confirmation → paid | cancelled | failed
paid → partially_refunded | refunded
partially_refunded → partially_refunded | refunded
cancelled / failed / refunded → нет переходов
```

Прямой paid допустим, если provider уже подтвердил завершение, а промежуточное
уведомление было пропущено. Внутренний waiting_for_confirmation — pending hosted flow;
это не автоматическое отображение какого-либо внешнего статуса или capture state.
Partial capture на 1.1 не поддерживается: paid требует captured_amount == amount.
Повтор точного Payment/Refund состояния — no-op без нового события.
Прямой переход в refund aggregate states запрещён в transitionPayment:
ими управляет только успешный transitionRefund.

Refund:

```text
created → pending | succeeded | failed | cancelled
pending → succeeded | failed | cancelled
succeeded / failed / cancelled → нет переходов
```

Новая попытка после terminal failure получает новый внутренний ID и idempotency key.
Network timeout не считается финансовым failure: recovery появится на этапе 4.2.

## Core API, изоляция, атомарность

Создание: `createPaymentCore(db)` возвращает:

- `getPayment({tenantId, storeId, paymentId})`;
- `createPayment({tenantId, storeId, orderId, connectionId, channel, method, amount,
  currency, idempotencyKey, source?, providerEventId?, metadata?})`;
- `transitionPayment({tenantId, storeId, paymentId, status, providerPaymentId?,
  confirmationUrl?, capturedAmount?, source?, providerEventId?, metadata?})`;
- `createRefund({tenantId, storeId, paymentId, amount, currency, idempotencyKey,
  reason?, source?, providerEventId?, metadata?})`;
- `transitionRefund({tenantId, storeId, paymentId, refundId, status, providerRefundId?,
  source?, providerEventId?, metadata?})`.

Tenant/store обязателен во всех публичных методах. Создание проверяет Order по
tenant/store/id, connection по tenant/id. Provider/environment копируются из connection,
не задаются вызывающим кодом. Refund доступен только через scoped Payment.
Нельзя подставлять tenant из browser: доверенный internal context появится в 1.2.

Каждая мутация использует собственную транзакцию. Порядок блокировок: Order,
Payment, Refund; создание дополнительно блокирует Connection. Order не изменяется,
его lock сериализует конкурирующие финансовые попытки. Статус, суммы и события
сохраняются в одной транзакции; ошибка любого запроса приводит к rollback.
Точное повторение идемпотентного create возвращает исходную запись; другие входные
данные с тем же ключом отклоняются. DB unique также защищает гонки разных Order;
SQL duplicate/deadlock errors не скрываются. Их безопасная HTTP-нормализация/retry
будет добавлена в 1.2/4.x.

Invariant: один Order имеет не более одного Payment с captured_amount > 0 за всю
историю, включая полностью refunded. Проверяется под lock Order при create/paid.
Legacy is_paid также блокирует новую оплату. Это ещё не синхронизация Payment → Order:
при подключении manual/gateway пути в 3.x потребуется общий guard и обработка
внешнего факта второй оплаты через manual review, а не потеря факта списания.

Refund creation резервирует сумму всех created/pending/succeeded refunds под lock
Payment. Failed/cancelled освобождают резерв. Сумма резервов не может превышать
captured_amount. Успех Refund атомарно увеличивает refunded_amount и меняет Payment
на partially_refunded/refunded; повтор успеха не увеличивает сумму второй раз.
Currency возврата должна совпадать с Payment. Orders refund пока не вызывает Core.

## Ограничения и индексы

FK RESTRICT: Connection → Tenant, Payment → Store/Order/Connection, Event/Refund →
Payment. Composite FK connection включает tenant/provider/environment, поэтому
исторический connection нельзя удалить или изменить его identity при наличии Payment.
Disable и изменение отображаемого name допустимы; финансовая история сохраняется.
Refund composite FK также фиксирует исходный connection.
Order FK использует существующий PK(id); совпадение tenant/store Order проверяет Core,
без добавления индекса/изменения старой Order таблицы.

UNIQUE: tenant + payment idempotency key; tenant + refund idempotency key;
connection + provider_payment_id; connection + provider_refund_id.
Внешние ID case-sensitive, nullable до получения ответа. CHECK защищает суммы,
enabled и соответствие агрегированных сумм финансовому status.
ENUM ограничивает внутренние statuses/source/environment. NOT NULL защищает обязательные поля.
Два DB trigger отвергают UPDATE/DELETE payment_events. Core не имеет методов
редактирования/удаления истории. Не использовать TRUNCATE или DDL runtime-аккаунтом.

Индексы: `(tenant,store,order,id)` для attempts; `(tenant,status,created_at,id)` для
будущего поиска зависших операций; connection FK index для истории connection;
`(tenant,payment,id)` для истории событий; refund payment/connection index для резервов
и возвратов; `(tenant,enabled,id)` для списка connections. Отдельные индексы на tenant
или created_at не добавляются без соответствующего запроса.

## Provider contract и безопасность

Контракт в JSDoc `payment-provider.js` определяет create/get/capture/cancel/refund,
входы и нормализованные outputs. Registry пустой; реальные/mock adapters отсутствуют.
Capabilities: supportsCapture/Cancel/Refund/PartialRefund, supportedChannels/Methods.
Registry проверяет обязательные методы и нормализует результат каждого вызова,
выбрасывая любые лишние SDK поля. Provider status явно преобразуется adapter'ом
в наши статусы, автоматически внешняя строка не принимается.

Payment result: providerPaymentId, status, amount, currency, capturedAmount,
confirmation `{type: 'redirect', url}` или null, rawMetadata.
Refund result: providerRefundId, status, amount, currency, rawMetadata.
Список нормализованных ошибок — ERROR_CODES в payment-domain.js; PaymentError
содержит только code, без provider body/credentials.

Metadata — строгий allowlist: refund_id, actor_user_id, operation из фиксированного
набора. rawMetadata проходит тот же фильтр. `provider_data` зарезервирован схемой,
Core пока его не заполняет и не хранит необработанные provider responses.
Confirmation URL допускает только HTTPS без username/password.
PAN/CVV/CVC/Authorization/credentials не имеют полей или API сохранения в Core.
Core не логирует входные данные/provider payloads. Reason — только пользовательская
причина возврата, не место для технических payloads. Hosted confirmation относится к 3.x.

## Применение и проверка

Миграция additive: старые таблицы/миграции не изменяет, не содержит ведущих SQL
комментариев, которые существующий migrate.js пропускает вместе с первым statement.
Trigger состоят из одного SIGNAL statement и совместимы с его разделением по `;`.
Запуск: `node migrate.js migrations/2026-10-03_payment_core.sql`.
Это однократная миграция; повтор после частичного DDL требует сначала проверить
фактическую схему. MySQL DDL не является единой rollback-транзакцией.
Требуются MySQL с enforced CHECK (8.0.16+) и права CREATE/TRIGGER/REFERENCES.

2026-10-03: node --check для трёх модулей и git diff --check прошли.
Код и критичные ветки рассмотрены статически: scoped lookup, locking order,
same-state no-op, refund reservation, rollback status/event, отсутствие Order writes.
Тесты/сервер/браузер не запускались согласно AGENTS.md; порт 3000 не использовался.
Попытка read-only подключения к настроенной MySQL завершилась ETIMEDOUT.
2026-10-03 пользователь подтвердил применение migrations/2026-10-03_payment_core.sql.
Создание четырёх таблиц отмечено в TODO по этому подтверждению. Проверки поведения
constraints, конкурентных транзакций и runtime-сценариев на БД пока не подтверждены.
STAGE-1.1 остаётся открытым до этих проверок.
По прямому запросу пользователя «делай проверки» выполнены 12 проверок домена без БД:
точная денежная арифметика, нормализация/границы суммы, currency, переходы Payment
и Refund, metadata allowlist, confirmation URL, ID, нормализация provider payment/refund
и пустой registry. Все прошли; node --check и git diff --check также прошли.
Повторное read-only подключение к MySQL с connectTimeout=8000 завершилось ETIMEDOUT.
Проверочные записи не создавались. Атомарность, конкуренция, tenant/store isolation
на БД, FK/UNIQUE/CHECK и triggers не проверены; 1.1-07/09/10 остаются открытыми.
Позднее проверен предоставленный a1186497_test.sql (phpMyAdmin 5.2.1,
сервер 8.0.37-29, экспорт 2026-10-03). Дамп подтверждает четыре таблицы и их поля,
четыре PRIMARY KEY/AUTO_INCREMENT, все предусмотренные индексы/UNIQUE,
шесть FK с RESTRICT и оба append-only trigger.
В дампе отсутствуют chk_payment_connection_enabled, chk_payment_amounts,
chk_payment_financial_state, chk_payment_refund_amount; CHECK не найден вообще.
Это расхождение экспорта с миграцией, а не доказанное отсутствие CHECK в исходной БД.
Пользователь предоставил полные результаты SHOW CREATE TABLE для этих трёх таблиц
на скриншотах. Все четыре CHECK присутствуют и соответствуют миграции:
enabled IN (0,1), границы payment amounts, согласованность финансового status
с captured/refunded amounts, refund amount>0. Расхождение относится к дампу;
дополнительная миграция для этих CHECK не нужна. Пункт 1.1-10 отмечен по проверке
определений таблиц, индексов и ограничений. Исполнение CHECK отдельно не проверялось.
Наличие объектов подтверждено статически; исполнение triggers/constraints,
атомарность и конкурентные операции этим дампом не подтверждаются.
`migrations/` и `Задания/` игнорируются Git; файлы существуют на диске, но для
будущего коммита потребуется явно включить их. Индекс Git сейчас не изменялся.

## Что оставлено следующим этапам

1.2: отдельный Payment Service, internal API/auth, transport mapping и error handling.
2.x: credentials encryption, store assignments, admin UI/audit, verification и YooKassa adapter.
3.x: server final amount → Payment, checkout redirect, summary, paid projection,
manual payment coordination и fulfillment eligibility.
4.x: webhook inbox/outbox, stronger idempotency/dedup, provider-state application,
reconciliation/recovery, реальная интеграция Order refund, production hardening.
