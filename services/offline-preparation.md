# A4.2: аудит, границы и первый вертикальный срез

Статус: PARTIAL. Реализованы срезы `settings.safe-profile` и ограниченных сводок заказов.
Полная гидратация девяти модулей и согласованная активация частей паспорта НЕ реализованы.
В A4.2.4 добавлен код staging первой части core-texts; требуется отдельная активация и браузерная приёмка.
Предыдущие незакоммиченные изменения A4.1 сохранены.

## Существующая инфраструктура (проверено по коду)

- `admin_persistent_cache`, IndexedDB v3, единственный используемый здесь store
  `entries`; индексы `namespace`, `namespace_updatedAt`, `expiresAt`.
- `AdminLocalRepository` добавляет tenant, principal type/id, activeRoleId,
  accessViewId, revocation epoch, domain/version и дополнительные dimensions.
  Он проверяет поколение и общий маркер отзыва до и после async-операций.
  Наличие JWT/записей не заменяет подтверждённый контекст и tab-proof.
- `setMany()` действительно проходит через одну readwrite-транзакцию
  `AdminPersistentCache.requestMany()`, а не последовательные отдельные записи.
  Есть AbortSignal, guard перед операциями и в callbacks; завершённый commit
  задним числом не откатывается.
- `bufferWrite()` резервирует локальную последовательность запроса под Web Lock.
  Это защита порядка рабочих ответов, НЕ серверная версия набора.
- `AdminIdleHydration` координирует вкладки через Web Locks, shared activity
  markers, BroadcastChannel/storage. Порог минимум 60 секунд, скрытое окно
  допустимо. Один HTTP за ход, deadline 8 секунд по умолчанию, JSON до 256 KiB,
  до 25 записей, пауза минимум 2 секунды (по умолчанию 3), до двух повторов
  с backoff/jitter. Возраст задач влияет на приоритет.
- `admin-offline-navigation.js` получает SW resource plan, ставит отдельные
  ресурсы в ту же очередь. Девять публичных EJS-shell используют настоящие
  страницы, layout, sidebar/header. Приватные API/HTML не становятся статикой.
- Каталог: `meta:offline:state` содержит scans/checkpoints; рабочий realtime
  cursor отделён от offline checkpoint. Флаги `complete:false` и
  `snapshotConsistent:false` нельзя превращать в доказательство полноты.
- `orders:outbox:courier` остаётся отдельным существующим механизмом операций.
  Из него нельзя производить разрешённые базовые UI-заказы. Не изменялся.

## Матрица покрытия

Все строки ниже имеют статус PARTIAL относительно полной цели A4.2.
Наличие shell или записанного рабочего ответа не означает подготовки раздела
без его посещения. Локальное чтение везде обусловлено допустимым контекстом.

| Маршрут / шаблон | Сейчас: источник и локальная модель | Недостающая подготовка / ограничения |
|---|---|---|
| cash / `cash.ejs` | `cash.js`, `cash:workspace`: query, сводка периода, дневные строки, статусы/способы оплаты; общие разрешённые паспорта заказов | `/api/admin/orders/cash-summary`, `cash-day`: агрегат периода и OFFSET не являются согласованным фоновым снимком. Нет подготовки непосещённой кассы |
| products / `products.ejs` | `CatalogRepository`: product/passport/passport-index, категории, units/conversions, combos, editor references; `meta:offline:state` | Есть ограниченные targets/combos и idle-паспорта, но запуск зависит от потребителя. Полный паспорт иногда >8 с; согласованного многозапросного snapshot нет |
| orders / `orders.ejs` | `orders:list:*`, `orders:detail:shared`: рабочие снимки и карточки; scoped idle-страницы `orders.recent-summaries` | Независимый bounded scan добавлен в A4.2.2: до 100 сводок за 7 суток, без полных карточек. In-memory events не доказывают полноту/удаления |
| courier-screen / `courier-screen.ejs` | Те же scoped списки/карточки, idle prewarm уже известных разрешённых заказов; существующий outbox | Нельзя узнавать видимый набор из outbox. Нужна самостоятельная ограниченная выдача с `x-rbac-context: courier` и существующей фильтрацией назначений |
| new-order / `new-order.ejs` | Общий `CatalogRepository`, сохранённый bootstrap в product cache, локальные checkout/durable drafts | `/api/new-order/bootstrap`, inventory, rounding, delivery/payment/time references ещё не образуют независимую полную idle-подготовку; сохранять `x-rbac-context: new-order` |
| clients / `clients.ejs` | `clients`, dimensions store + marketing/chat: query-keyed список, карточки/адреса/заказы/benefits; дополнительный scoped localStorage | `/api/admin/clients` применяет all/stores/assigned/own, но использует OFFSET; отдельные фильтры вычисляют большой набор до slice. Такой путь нельзя просто завернуть в idle |
| chat / `chat.ejs` | `chat:summaries/latest`, `chat:threads/client:*`, сохранённые страницы сообщений; store/identity scopes | `/api/chat-temp/clients`, summaries и thread имеют paging, но изменяемый summaries cursor не immutable snapshot. Нужна политика видимости/истории и bounded prefetch; отправка не равна доставке |
| team / `home.ejs` (team partials) | `team:employees/employees`, formatVersion 1: id/name/status/is_owner, имена ролей/магазинов. Локальное чтение сотрудников сейчас только `*` или employees.read/all | `/api/admin/team/bootstrap` читает все users/roles/stores/permissions. Не подходит как фоновая порция. Для stores/own/assigned нельзя молча расширять текущий локальный допуск |
| settings / `home.ejs` (settings partials) | `settings:profile/safe-profile`: name/site_name/timezone; текущий UI уже читает этот ключ офлайн | Новый срез готовит только эту проекцию. Интеграции, доставка, роли, платежные и прочие настройки этим НЕ покрыты |

### Минимальные наборы и предлагаемые границы следующих срезов

Ниже проект, а не включённые массовые загрузчики:

- Касса: сегодняшний день и предыдущие 7 дней; разрешённые сводки + страницы
  строк по 25. Финансовые подтверждения/платёжные секреты не копировать.
- Каталог/новый заказ: разрешённые категории, единицы, конверсии, варианты,
  цены/правила, availability, ограниченные части карточек; несекретные способы
  оплаты/доставки/времени. Существующие черновики не затирать гидратацией.
- Заказы: активные разрешённые + завершённые за последние 7 дней. Явно
  ограничивать историю, не называть этот набор всей историей компании.
- Курьер: только назначенные/допустимые текущему курьеру рабочие заказы,
  ограниченная завершённая история по той же серверной политике.
- Клиенты: разрешённый минимальный список + карточки и адреса; никаких
  клиентских session tokens. Области marketing/chat не объединять.
- Чаты: сначала недавние разрешённые диалоги, затем последние 30 сообщений
  каждого в пределах 30 дней; архив вне политики явно неполон. Нужна серверная
  фильтрация thread/read прав, не только tenant_id.
- Команда: текущая employeeSnapshot-проекция, без документов, контактов,
  password hashes, reset links, полномочий на изменение ролей.
- Настройки: whitelist DTO по подразделам. Никогда не сохранять полный
  `/api/admin/tenant`: он может содержать интеграционные/платёжные данные.

Для каждой будущей страницы: максимум 25 элементов и ограничение байтов на
сервере ДО отправки; индексированный keyset внутри согласованного набора.
Checkpoint должен включать scope, dataset/schema, snapshot/version, cursor,
последнюю подтверждённую порцию, время и отдельную полноту этого набора.
Ни OFFSET, ни отсутствие записи в одной странице не доказывают удаление.

## Реализованный срез: безопасный профиль настроек

1. В существующем `AdminIdleHydration` выделен контракт `policy`:
   `mode`, `limits`, `maxConcurrentRequests`, `allowsPreparation(deadline)`.
   Запросы данных и SW используют один контракт и тот же scheduler/lock.
   Сейчас единственный режим — `idle_only`. Режимы `daytime_throttled`,
   `scheduled`, `hybrid` не реализованы и не включены. Будущее назначение
   политики tenant/store должно поступать с сервера после авторизации;
   browser storage не станет источником политики или новых полномочий.
2. `GET /api/admin/tenant/offline-profile`: существующий Bearer middleware,
   фиксированный granular mapping `settings.company.read`, проверка ресурса
   tenant/store. `site_name` только при отдельном `settings.site.read`.
   Данные: один `SELECT ... WHERE id=? LIMIT 1`, только 2–3 разрешённых поля,
   каждое строка до 256 символов или null. Нет DDL, `SELECT *`, domain probes,
   построения полного tenant response, секретов и интеграционных запросов.
3. Версия — SHA-256 канонического DTO одной строки. Это точная идентичность
   содержимого данной проекции, НЕ монотонная версия и НЕ cross-table cursor.
   `complete:true` относится только к этой singleton-проекции;
   `moduleComplete:false` всегда. Исчезнувшее поле заменяется вместе с DTO,
   а не остаётся от старого объекта.
4. `admin-reference-cache.js` подключён общим layout на всех девяти страницах.
   При подтверждении контекста, online, смене магазина и начальной загрузке
   он только ставит задачу в очередь. HTTP выполняется строго внутри idle turn.
   Нет нового scheduler, кнопки, индикатора, banner или polling.
5. Проверка свежести выполняется ВНУТРИ глобального хода: вкладки не скачивают
   повторно уже подготовленный профиль. TTL 15 минут; обновление допускается
   при следующем указанном lifecycle trigger, без постоянного таймера.
6. Используется ровно существующий `settings:profile`, version 1, ключ
   `safe-profile`. Проекция tenant-wide: в ней нет данных конкретного магазина;
   scheduler всё равно прекращает старую работу при смене активного магазина.
   Principal, role, accessViewId, revocation epoch и tab-proof не обходятся.
7. Перед HTTP запоминается sequence `meta:buffer:safe-profile`. Перед commit
   берётся тот же `admin:buffer:<namespace>:safe-profile` Web Lock, что у
   foreground `bufferWrite()`. Если появился более новый рабочий запрос,
   фоновый результат пропускается БЕЗ записи и продвижения checkpoint.
8. Профиль и `meta:refresh:safe-profile` записываются одним `idle.commit()` /
   `setMany()` с AbortSignal/guard, без quota cleanup. Отменённые данные не
   публикуются в memory/dirty и не сохраняются позднее через flush.
9. `getSettingsProfileState()` — только программная диагностика dataset:
   loading / ready / partial / unavailable, всегда `moduleComplete:false`.
   Состояние не отображается пользователю. Готовность требует совпадения hash
   профиля и checkpoint; более новый foreground ответ не выдаётся за сверенный
   старым checkpoint при несовпадении.
10. Существующий `loadTenantProfile()` уже читает этот ключ офлайн. Его UI,
    онлайн-запрос и рабочий bufferWrite не менялись. Офлайн-сохранение
    серверных настроек не добавлено.

## A4.2.2: первый срез заказов (активирован; приёмка PARTIAL)

- Источник — `GET /api/admin/orders/offline-page`: фиксированное
  `orders.list.read`, существующие Bearer/auth/granular middleware, tenant +
  выбранный store; all/stores/assigned/own с теми же SQL-ограничениями списка.
  Контексты courier/cash/new-order не подменяют право чтения этого endpoint.
- Не более 25 строк, keyset `id DESC`, `before_id`, фиксированный `window_end`.
  Период — созданные за последние 7 суток относительно window_end (не все
  старые активные заказы). Клиент ограничивает проход четырьмя страницами / 100
  записями. Нет OFFSET/COUNT/MAX(id), N+1 и загрузки состава заказа.
  SQL hint MAX_EXECUTION_TIME(2000) — дополнительный бюджет MySQL, не доказательство
  поддержки hint конкретным сервером или стоимости плана. EXPLAIN/индексы и
  фактическая длительность нового запроса пока не проверены на работающей БД.
- DTO: id/store/status, даты, сумма, ограниченные name/phone/address,
  заголовки статуса/доставки. Нет items, комментариев, полного клиента,
  payment_projection/истории платежей, реквизитов, tokens или интеграций.
  Сервер ограничивает ответ 64 KiB. Hash страницы — идентичность DTO, не
  монотонная серверная версия и не согласованный снимок всех страниц.
- `admin-orders-cache.js` подключён общим layout; это доменный модуль над
  существующим AdminLocalRepository, не новая IndexedDB/очередь. В namespace
  `orders:list:orders` version 1 используются существующие store/accessContext
  dimensions и вся identity/role/accessViewId/revocation/tab-proof из core.
  Четыре переиспользуемых ключа `offline:recent:0..3` содержат порции;
  `meta:refresh:recent-orders` — run/pages/windowEnd/cursor/confirmedAt/portion.
  Запись одной порции и checkpoint — один guarded idle.commit/setMany.
  Незавершённые порции не публикуются в runtime/dirty и не продвигают cursor.
- Планировщик остаётся общим: idle_only, минимум 60 секунд, один HTTP за ход,
  8 секунд, общий Web Lock, отмена при действиях/смене scope. Скрытое окно не
  запрещено. Сбой страницы завершается ограниченными retries существующего
  scheduler, не бесконечным циклом. Quota не очищает пользовательские данные.
- Свежесть подготовленного прохода — 15 минут. Проверка страниц/hash/checkpoint
  выполняется внутри общего хода; другая вкладка пропускает свежий проход.
  Обновление — на lifecycle trigger, не высокочастотным polling. Просроченный
  проход начинается заново; актуальный незавершённый продолжается с cursor.
- Рабочий `last-workspace` и полные карточки никогда не пишутся гидратацией.
  Рабочее сохранение списка использует существующий buffer lock/sequence и
  атомарно публикует рабочий снимок с fence; фон до commit сверяет sequence.
  При чтении рабочий снимок приоритетен; совпадающие ID перекрывают сводки
  даже при другом фильтре дат. Sequence — порядок локальных записей, не версия
  бизнес-данных сервера. Непроверенная гонка двух разных серверных версий A4.2.1
  не объявляется этим исправленной.
- UI использует тот же orders.js и обычные строки/стадии. При отсутствии
  совместимого рабочего снимка читает подготовленные страницы, фильтрует даты,
  дедуплицирует ID, показывает только сохранённую часть. Неполные статусы и
  отсутствие строк не выдаются за полный набор. Полная карточка открывается
  только из существующего detail cache или рабочим запросом; сводка не
  изображает оплату/состав/комментарии. Новые offline-записи не добавлены.
- Realtime не переведён в idle: `ordersEvents.publish` → `/changes/wait` →
  `/changes` → `synchronizeOrdersChanges`/`bootstrapOrdersData` →
  `handleOrderEvent`/список/счётчики. Courier outbox, cash и new-order
  бизнес-пути не меняются. Новый реальный заказ для проверки не создавался.
- Всегда `complete:false`, `moduleComplete:false`, partial. Keyset и временная
  граница не доказывают отсутствие изменений/перемещений/удалений между
  страницами. Нет удаления по отсутствию записи, строгой reconciliation или
  гарантии отзыва прав без сети — это существующая модель доверия и A4.3.

### Уточнение store scope и сетевой очереди (21 октября 2026)

- У `/orders/offline-page` исходный `x-store-id` проверяется до helper: только
  десятичная строка `[1-9][0-9]*` в диапазоне safe integer. Отрицательные/нулевые,
  дробные, exponent/hex, leading-zero, объединённые/нечисловые значения — 400.
  Конфликт с уже установленным authenticated store — 400. Отсутствующий header
  сохраняет прежний контракт helper (authenticated/query/default); middleware
  для `stores` по-прежнему требует допустимый магазин. Общий helper не менялся.
  Эта серверная правка требует отдельно разрешённого перезапуска; PID 9240
  её ещё НЕ выполняет. Нельзя объявлять браузерную проверку нового отказа PASS.
- Chrome фактически использует HTTP/1.1. При трёх вкладках до клиентской правки
  получены 46 `SOCKET_POOL_STALLED_MAX_SOCKETS_PER_GROUP` в NetLog trace.
  Наблюдались три открытых catalog SSE и длительные foreground-паспорта,
  дубли `/tenant/production-zones`. На скрытых products-вкладках orders badge
  не запускал `/changes/wait`; long-poll не объявлен причиной этого прогона.
- `syncProductsBulkActionsUi` вызывал `ensureProductsBulkProductionZonesLoaded`
  повторно до установки `productionZonesLoaded`. Существующий API-helper теперь
  объединяет только одновременные чтения в пределах актуального access/token/
  store. Это не межвкладочный кеш, не новый scheduler и не idle-задержка рабочего
  запроса. Ответы по-прежнему проходят проверки существующего `api()`.
- До правки диагностические порции одного состава (20 сводок, 8535 байт):
  одна вкладка — 707 мс, две — 733 мс, три — 4246 мс (sendStart 3517 мс).
  При обходе SW: 707 / 729 / 3346 мс (sendStart 2638 мс при трёх вкладках).
  Серверное время этих запросов — около 0,70–0,73 с. Наличие SW не является
  объяснением исчерпания socket pool. Это ограниченные наблюдения, не нагрузочный
  benchmark или гарантия времени ответа при любой комбинации разделов.
- После single-flight во всех трёх вкладках наблюдалось по одному zones HTTP.
  Контрольные порции: 1720 мс (sendStart 989 мс, server 724 мс) и 1587 мс при
  обходе SW (sendStart 857 мс, server 723 мс), тот же DTO 20 / 8535 байт.
  При загрузке свежего JS также запрашивались некешированные ресурсы: число
  NetLog stalls 109 против 46 НЕЛЬЗЯ трактовать как сопоставимый benchmark.
  Исчерпание группы всё ещё наблюдается: полного устранения проблемы нет.
  Временный DevTools bypass был снят, CacheStorage не очищался.
- Дополнительный прогретый запрос без участия SW (`workerStart=0`): 8098 мс
  по клиентским часам, Resource Timing 8095 мс; до requestStart 7391 мс,
  TTFB 704 мс, body 0,7 мс. Server-Timing app 703 мс / 5 SQL. Даже HTTP 200
  после этого времени не является успешным idle turn: assertCurrent() сохраняет
  прежний дедлайн 8 с и не принимает запоздалую порцию. В том же коротком trace
  получены ещё шесть SOCKET_POOL_STALLED_MAX_SOCKETS_PER_GROUP. Общий сетевой
  блокер остаётся. После диагностики обычной перезагрузкой восстановлено
  управление SW во всех трёх авторизованных вкладках.
- Если остаточная конкуренция требует общего realtime-транспорта, сначала
  согласовать отдельный срез: один лидер соединения на scope/channel через
  существующие Web Locks + BroadcastChannel, с проверкой identity/store/role/
  accessViewId/token generation, heartbeat/failover и отказом от передачи payload
  вкладке без её собственного допустимого контекста. Каталог, orders wait и chat
  сохраняют немедленную доставку событий; cursor остаётся доменным, outbox —
  независимым. Нельзя просто закрывать потоки скрытых вкладок, отложить realtime
  до idle или включить агрессивные переподключения. Альтернатива — согласованное
  HTTP/2 TLS-терминирование с действующей auth/CSRF моделью и без самовольной
  смены локального порта. Ни новый coordinator/SharedWorker, ни HTTP/2 deployment
  в этом задании не реализованы; это существенно шире single-flight одного API.
- Минимальный первый вариант для согласования — разделять пока только catalog
  SSE: один лидер на точный access/store/rbacContext; followers получают только
  revision-hint и выполняют прежний working-set reconcile со своим Bearer и
  scope. HELLO/snapshot при подключении, Web Lock на всё время stream, проверка
  поколения у отправителя/получателя и ограниченный failover обязательны.
  `/orders/changes/wait`, чат и пользовательский outbox в этом варианте не
  меняются. Это освобождает дублирующиеся постоянные catalog-соединения, но
  не обещает исчезновения любой очереди при произвольном количестве вкладок.
  Без согласования новый общий realtime-coordinator не создавать.
- Порции заказов остаются 25 строк / 64 KiB, keyset `id DESC`, до четырёх
  страниц, семь суток. При byte cap cursor указывает на последнюю ВЫДАННУЮ
  строку, а не последнюю SQL-строку. Если не помещается даже одна строка — 413,
  checkpoint не меняется; scheduler не повторяет 413 бесконечно. Пустой конец
  и граница четырёх страниц не превращаются в `complete:true`. Проверено по коду;
  fixture >100 записей и предельной UTF-8 страницы не создавался в рабочей БД.
- Прежняя браузерная приёмка подтвердила одну транзакцию page+checkpoint,
  trusted-межвкладочную отмену, неизменность записей после неё и после настоящего
  `flushPersistence()`, продолжение после >=60 с и три реальные строки офлайн.
  Гонка двух РАЗНЫХ серверных версий и варианты прав stores/assigned/own этим
  не доказаны. Полной сверки состава заказов в A4.2.2 нет.

## Проект частей паспорта: граница A4.3

### Почему недостаточно добавить `part=` к текущему endpoint

`buildFullProductPassportsPayload()` последовательно обогащает mutable rows:
availability → blocks → nutrition → prices → discounts → categories → details
→ support → stock → assemble. `details` объединяет assignments/option groups,
variants, ingredients и defaultConfig. `prices` читает rounding, block config,
variants, exclusions и tiers. `support` повторно читает ingredients, units,
stocks, discounts и связанные сущности. Части имеют общие зависимости.

Helpers используют pool `db.query`, а не единый snapshot-bound executor.
Один запрос продукта / его `updated_at` не покрывает изменения всех зависимых
таблиц. `catalog_changes` с MAX(id) не доказывает commit-order. Существующий
`product-passport-snapshots.js` сохраняет готовый JSON под tenant/store/product,
может вернуть прежний JSON при dirty/building, использует memory cache и не
имеет неизменяемого идентификатора снимка для всех частей admin-паспорта.
Переиспользовать это как гарантию согласованности нельзя.

### Предлагаемый протокол (НЕ реализован)

- Разрешённый manifest привязан к tenant/principal/role/accessViewId/store и
  schemaVersion. Возвращает opaque snapshotId, срок жизни, обязательные parts,
  зависимости, количества/хеши chunk и границы cursor.
- Кандидат границ по реальным зависимостям: core/category/text; units/links;
  variants/exclusions/tiers; ingredients/nutrition; option assignments/groups/
  items; derived pricing/defaultConfig/discounts; store availability/stock.
  Границы уточняются при извлечении SQL-зависимостей, не по «сложности товара».
- Большие части — страницы до 25 исходных/результирующих элементов + byte cap,
  стабильный состав и cursor внутри ИМЕННО snapshotId; 8 секунд не увеличивать.
  Каждый запрос считает только нужную часть, а не строит полный DTO и slice.
- Нужен immutable источник: экспорт разрешённого raw dependency graph на одной
  `REPEATABLE READ ... WITH CONSISTENT SNAPSHOT` connection для транзакционных
  таблиц, затем durable immutable артефакт и вычисления частей из него.
  До sealed manifest данные не публикуются. Захват большого графа сам должен
  иметь бюджет; если не укладывается, требуется другой протокол версий/экспорта,
  а не удержание открытой транзакции между минутами пользовательского idle.
- Это требует анализа engine/зависимостей, snapshot-aware executor helpers,
  общего durable хранения артефактов для нескольких Node workers и GC.
  Глобальный in-memory объект одного процесса не является заменой протокола.
  Миграции/инфраструктура в этом срезе НЕ созданы и НЕ применены.
- Клиент хранит parts/chunks и checkpoint в существующем scoped `entries` под
  candidate snapshotId; каждый chunk + checkpoint одной транзакцией.
  Старый активный passport/index остаётся неизменным до готовности всех parts.
- По manifest проверяются scope, обязательные chunk, хеши и зависимости;
  одна короткая финальная транзакция активирует новый паспорт + индекс +
  указатель версии. При большом DTO сначала нужен формат ссылочной активации
  без тяжёлой сборки на main thread; это отдельное совместимое изменение.
- Snapshot expired / 401 / 403 / scope changed не активируют кандидата.
  Частичный паспорт не подменяет полный. Ошибочный объект получает bounded
  retry/backoff и не блокирует очередь других товаров/модулей.

Сверка удалений A4.3 также требует sealed manifest разрешённого состава или
эквивалентного протокола; пропуски в частичном обходе не удаляются. Старые
outbox/drafts не участвуют в GC этого протокола.

### Конкретный следующий срез частей (технический план, НЕ реализация)

Точка расширения — существующие `api/admin/products.js`, builder в
`api/public/shop.js`, `services/product-passport-snapshots.js` и
`CatalogRepository`. Новый универсальный event log/вторая IndexedDB не нужны.
Сначала согласуется immutable источник; без него части не активируются.

| Часть | Поля существующего full-product-passport-v1 | Порционирование |
|---|---|---|
| core / texts / visibility | scalar-проекция product, texts, visibility, category IDs, photo references | Отдельные ограниченные документы; длинный текст — UTF-8 сегменты с offset/hash, без обрезания бизнес-значения |
| units | units, unitConversions, productUnitLinks, editor.relatedProductUnitLinks | До 25 элементов; неизменяемый состав и полный уникальный ключ связи внутри snapshot |
| variants | variants, exclusions, tiers и исходные block configs | До 25 сущностей/связей; крупные вложенные списки не прячутся в одну «строку» |
| options | options, optionAssignments, group/item связи | Группы и их items отдельными страницами; cursor содержит part + parent + snapshot |
| ingredients | ingredients, nestedIngredients | Страницы узлов/рёбер исходного графа; порядок/циклы и действующие бизнес-правила сохраняются, не вводится произвольное усечение состава |
| derived | defaultConfig, вычисленные price-поля product, benefits, editor.discounts, nutrition, comboRefs | Скаляры отдельно; массивы по 25; только из того же зафиксированного графа зависимостей |
| store-state | stock, availability, requirements | Тот же snapshot и store; requirements порционно. Более поздний realtime-stock — отдельное рабочее обновление, не часть старого согласованного паспорта |

Предлагаемый контракт:

1. Отдельный разрешённый manifest-запрос одного product возвращает
   `schemaVersion`, `snapshotId`, `projectionId`, scope, `requiredParts`,
   количество/хеш каждой страницы и срок жизни. Версия полного паспорта — hash
   sealed manifest, включающего ВСЕ part hashes/schema/scope; не product.updated_at
   и не MAX(catalog_changes.id). Manifest не строит полный паспорт синхронно
   только ради ответа «готово» и не запускает неограниченный обход магазина.
2. Каждая part-страница адресуется `(snapshotId, part, cursor)`, заново проходит
   Bearer/RBAC/tenant/store. Opaque cursor связан со snapshot/part/родителем;
   не OFFSET по живым таблицам. Один idle turn = один manifest ИЛИ chunk HTTP,
   максимум 25 элементов и 64 KiB. Крупная вложенная сущность получает свои
   страницы, а не снимает byte cap. Никакой предварительной оценки «сложности».
3. Источник частей — immutable артефакт из согласованного чтения всех исходных
   таблиц на одном snapshot-aware executor. Существующие `db.query` helpers
   сейчас этого не гарантируют. Проверить engines и бюджет захвата графа;
   запечатать immutable артефакт до выдачи manifest. Если bounded capture не
   укладывается, источник версий/экспорта требует отдельного решения A4.3.
   Нельзя просто завернуть нынешний дорогой full builder в 202/background job
   или пересобирать полный паспорт при запросе каждой части. Текущее mutable
   `prod_product_passport_snapshots.passport_json` само по себе не подходит:
   статус ready/dirty и timestamp не сохраняют неизменяемую общую версию.
4. В существующих scoped entries кандидат: `passport-part:<product>:<snapshot>:
   <part>:<chunk>`; checkpoint соответствующей части содержит snapshot/schema,
   hash, nextCursor, confirmedChunk, complete и confirmedAt. Chunk+checkpoint
   одной короткой guarded-транзакцией, без публикации в общем runtime/dirty.
   Успешные части сохраняются при отмене; незафиксированная часть повторяется
   после следующего idle. `snapshot expired` не смешивает старые и новые parts.
5. Перед активацией проверяются все обязательные chunks, hashes, зависимости,
   актуальные scope/generation/tab-proof/revocation. Короткая транзакция меняет
   только active snapshot pointer и существующий passport-index. До неё старый
   полный паспорт остаётся активным; candidate не получает признак полноты.
   Заранее спроектировать совместимый reader pointer-формата в CatalogRepository:
   старый v1 JSON продолжает читаться, существующие consumers получают прежний
   DTO только после полной проверки. Нельзя выдать pointer за нынешний full DTO
   или собрать/клонировать неограниченный JSON в финальной транзакции main thread.
6. Scheduler чередует `(product, part)` задачи с существующим aging, не держит
   очередь на одном тяжёлом товаре. Короткие вычислительные шаги тоже уступают
   реальной активности. Bounded retries/backoff/quota pause сохраняются.
   Актуальные chunk hashes + checkpoint исключают повторную загрузку; новая
   версия использует прежние части только при совпадении их content hashes и
   явном разрешении sealed manifest, не по старому timestamp.
7. Срок жизни/GC immutable артефактов, несколько Node workers и endpoint mapping
   согласуются ДО реализации. Никакие миграции, новые endpoints, workers или
   изменения passport/outbox-протокола этим документом не включены.

Обязательный отложенный кейс A5: ДТП/повреждение заказа и противоречащие статусы
курьера и администратора. Не применять автоматический last-write-wins, не
добавлять сейчас offline-запись статусов или финансовые корректировки.

## Порядок следующих небольших подэтапов

1. Активировать и принять в браузере этот safe-profile срез после отдельно
   разрешённого перезапуска Node.js. Пока сервер не перезапущен, новый route
   нельзя считать активным; клиентский 404 не означает успешную подготовку.
2. Ограниченные справочники нового заказа / категорий / units с whitelisted DTO,
   отдельными scope и checkpoint; не использовать целый bootstrap ради 25 строк.
3. Спроектировать и согласовать источник immutable паспорта A4.3; затем первый
   core-part вертикально server → idle → candidate chunk → activation.
4. Ограниченный employee DTO с существующими разрешениями, затем clients и
   активные orders/courier. Не менять протокол outbox и не переносить snapshot
   между consumers ради общего списка.
5. Касса и ограниченная история чатов; затем расширение настроек только по
   whitelists. Строгая полнота/удаления — только после snapshot protocol.

## Проверки и приёмка

Разрешены синтаксис и diff; проектные тесты запрещены правилом 27 AGENTS.md.
Браузерную приёмку нового среза нельзя объявлять пройденной до активации route.
Запуск/перезапуск сервера и миграции автоматически не выполняются.

Для последующей проверки сохранить текущий профиль, cookies, IndexedDB и SW:

1. Авторизоваться, не открывать settings, работать в другом разделе >60 с:
   `/tenant/offline-profile` не вызывается во время активности.
2. Простой во всех вкладках ≥60 с, включая скрытые/свёрнутые: одна выдача
   разрешённой проекции, затем commit двух записей с matching hash/checkpoint.
3. Другая вкладка видит свежий checkpoint и не скачивает singleton повторно.
4. Активность до ответа и до commit: отмена, старые записи/checkpoint неизменны;
   следующий idle возобновляет ту же задачу. Отдельно проверить quota.
5. Foreground settings response с новой buffer sequence побеждает старую
   гидратацию; пропущенная порция не меняет checkpoint и не публикует runtime.
6. Отключить сеть, впервые открыть settings: настоящий UI читает именно этот
   scoped safe-profile; прочие поля/сохранение не имитируются.
7. Проверить all/stores и отсутствие company/site read; 401/403 не дают fallback
   из новой запрещённой области. Owner → Courier, role/accessView/store/logout
   и независимая вкладка без tab-proof не показывают старые данные.
8. Восстановить сеть: только постановка в idle, не массовое скачивание.
9. Принимать остальные восемь модулей и parts только после их реализации:
   непросмотренный раздел, локальные поиск/карточка, неполный набор, удаления,
   смена scope, ошибка объекта, продолжение частей и атомарная активация.

Офлайн-lease не способен мгновенно узнать серверный отзыв без связи. Сохраняются
существующие срок действия/tab-proof/revocation checks; новая самостоятельная
офлайн-аутентификация не добавляется. Отсутствие лагов без измерений не заявлено.

## A4.2.3: координация только catalog SSE (21 октября 2026)

### Аудит и границы

- `CatalogRepository.startSync()` использует `fetch` + streaming reader, НЕ
  `EventSource`: `GET /api/admin/catalog/stream?store_id=…`, Bearer,
  `x-store-id`, `x-rbac-context: products|new-order`. Его вызывают товары и новый
  заказ, а после первого подключения — прежние online/pageshow/reconnect paths.
- Серверный handler в `api/admin/products.js` проверяет tenant/store/RBAC,
  присылает `snapshot` и `change` с revision, проверяет сессию при отправке и
  keepalive. Клиентский reconnect остаётся прежним: backoff 1,5–30 секунд,
  без автоматического reconnect после 401/403. Серверный код SSE не изменён.
- Revision запускает прежний working-set reconcile каждой вкладки. Ни SSE,
  ни `/changes`, ни `/changes/wait`, чат и courier outbox не ждут idle.
  Scheduler, восьмисекундный дедлайн, паспорта и бизнес-вычисления не изменены.

### Протокол и жизненный цикл

`admin-catalog-stream.js` — узкий helper существующего каталога, не общий новый
realtime-слой. Подключается layout перед `admin-catalog.js`.

1. Только после подтверждения `AdminLocalRepository` вычисляется SHA-256 ключ
   из полного repository namespace, permission context и точного token-context.
   Namespace уже содержит tenant, principal, activeRoleId, accessViewId,
   revocation epoch и магазин. В BC не передаются исходные значения или токен.
2. Exclusive Web Lock `admin:catalog-sse:v1:<hash>` удерживается весь срок stream.
   Одна очередь lock без polling: лидер читает SSE, followers не открывают его.
3. BC передаёт только hello/lease/bye и revision-hint: UUID отправителя/терма,
   sequence, expiresAt, revision и тип snapshot/change. Есть проверка схемы,
   срока, терма и порядка. Никаких DTO, JWT или решений о доступе через BC.
4. Heartbeat 15 секунд, lease 150 секунд учитывает throttling скрытого Chrome.
   Скрытие/сворачивание не снимает лидерство. Новый follower получает последнюю
   реальную revision как snapshot-hint и запрашивает данные своими API/правами.
5. Закрытие/pagehide/freeze/offline и смена access/store/token-generation
   отменяют старый транспорт. Lock освобождается после завершения abort/reader,
   а не перед ним. Resume/online возвращают штатный немедленный reconcile.
6. Отсутствие crypto/Web Locks/BC или невозможность получить lease означает
   прежний независимый SSE, а НЕ выключение realtime. При временной потере lease
   queued lock сохраняется; валидный lease останавливает независимый transport.

Граница гарантии: нельзя безопасно принудительно отобрать Web Lock у навсегда
зависшего JS, одновременно гарантируя закрытие его сетевого SSE. Lock НЕ крадётся.
При таком отказе heartbeat/lease приводит к independent fallback; временно может
быть больше одного SSE. Строгое server-enforced fencing при hard hang требует
отдельного серверного протокола. Нормальные freeze/close обрабатываются клиентом.

### Фактические ограниченные замеры

В существующем авторизованном Chrome/CDP, сервер PID 9876 без перезапуска:

| Активных вкладок одинакового scope | SSE | Idle-порции заказов, мс |
| --- | --- | --- |
| 1 | 1 лидер | 1289,5 / 713,7 |
| 2 | 1 лидер + 1 follower | 1278,1 / 831,9 |
| 3 | 1 лидер + 2 follower | 887,3 / 1046,9 / 1269,7 |

Это дополнительные диагностические **read-only** порции через настоящий
`AdminIdleHydration`, после обычного общего idle, без обхода guards/дедлайна и
без записи диагностического результата в IndexedDB. Каждый ответ: 20 сводок,
8535 байт, complete/moduleComplete false. При трёх вкладках CDP pre-send:
3,07 / 2,20 / 3,45 мс; Server-Timing app: 879,1 / 1039,4 / 1261,4 мс.
Второй пассивный CDP observer измерял timing, не меняя ответы или запросы.
Web Locks.query показал ровно один удерживаемый catalog lock. Network показал
один HTTP 200 stream лидера; добавление followers не создавало новых stream.

NetLog текущего трёхвкладочного окна: 6881 событий, 2
`SOCKET_POOL_STALLED_MAX_SOCKETS_PER_GROUP`. Ранее было 46, но окна/нагрузка
отличаются: это НЕ доказанный сравнительный benchmark и НЕ гарантия отсутствия
очереди при любой комбинации разделов. Дедлайн не увеличен.

BC наблюдался пассивно: только ожидаемые поля/opaque group key, никаких токенов
или приватных DTO. Реальное создание заказа/сообщения не выполнялось.

Офлайн-регрессия заказов: HTTP 200 настоящего shell, активный offline-context,
три реальные строки за 18 октября с совпадающими ID/сохранёнными значениями,
корректное указание частичного набора. Все 20 сохранённых сводок и checkpoint
не изменились (SHA-256 данных до/после
`b0fc3e6c5c05c543c5f618ae684b1a95cc0e411acb742c0ffe917a38ce7784ff`).
Свежий checkpoint повторно не скачивался штатной подготовкой ради этой проверки.

Активный SW пока `2-1792553960461`: ранее сохранённые offline shells ещё без
нового helper. Онлайн EJS уже подключает его, а `X-PWA-Resources` нового shell
автоматически включает зависимость для следующей штатной подготовки/версии SW.
Кеши не очищались, SW/сервер не переписывались и не перезапускались. При смешанных
старых/новых документах старые вкладки не участвуют в новой координации до
обновления документа; полную активацию offline-зависимости принимать отдельно.

Дополнительная браузерная приёмка takeover:

- Chrome действительно `windowState: minimized`, все три документа `hidden`
  более 65 секунд: остались один лидер и два follower, новых stream не было.
  Видимость не подменялась; переключение вкладок не переизбирает лидера.
- Закрыта только созданная для проверки временная вкладка-лидер. Новый stream
  начался через 49 мс, HTTP 200 — через 1396 мс от начала закрытия. Остались
  один лидер и один follower без ожидания idle.
- Нативный `Page.setWebLifecycleState(frozen)`, не синтетический JS event:
  stream старого лидера получил `net::ERR_ABORTED` через 8 мс, peer начал новый
  stream в тот же момент; HTTP 200 через 709 мс. После `active` прежний лидер
  вернулся follower, не открыл конкурирующий stream.
- Все три исходные авторизованные вкладки восстановлены на `/dashboard/products`,
  временная вкладка закрыта, диагностические preload/BC observers отключены.
  Сеть возвращена online, SW прежний, бизнес-данные/браузерные хранилища не очищены.
- `node --check` двух JS, компиляция layout EJS и `git diff --check` прошли.
  Проектные тестовые наборы не запускались (правило 27).

NOT TESTED: смена реальных tenant/role/store/token, серверный бизнес-event нового
заказа/сообщения, бесконечно зависший renderer без freeze-event, отсутствие
Web Locks/BC в другом браузере, offline rollout новой зависимости после смены
версии SW. Реальные данные/права для этих сценариев не изменялись. Отсутствие
всякой HTTP-очереди при произвольной нагрузке не доказано.

## A4.2.4: первый staging-срез core-texts (код; приёмка NOT TESTED)

### Подтверждённая причина и выбранная граница

Монолитный builder читает p.*, stock и зависимые таблицы, затем выполняет
availability/blocks/nutrition/prices/discounts/categories/details/support/stock.
Ранее обычная foreground-порция из 25 товаров занимала 38,8–41,7 секунды,
преимущественно на сервере. Это не та же проблема, что HTTP socket-pool очередь.
Builder, SSE-coordinator, рабочие паспорта и deadline 8 секунд здесь не меняются.

Первая часть: id, name, sku, description_short, description, is_active,
site_visibility — только исходные поля одной prod_products строки. Нет цен,
расчётов наличия, зависимых справочников, секретов и вызова full builder.

### API и версия

- `GET /api/admin/catalog/product-passport-core?cursor=...` возвращает максимум
  ОДИН товар за HTTP. Отсутствие строки — отдельная пустая завершающая порция.
  Явный granular mapping: products.catalog.read либо new_order.create с
  x-rbac-context:new-order. Только существующие all/stores; assigned/own не
  расширяются. Bearer middleware и проверка магазинов остаются прежними.
- Обязательный x-store-id: канонический positive safe integer; конфликт с
  установленным store scope — отказ, никакого fallback на магазин 1. Tenant
  берётся из авторизованного контекста. На каждой странице проверяется
  существование магазина в tenant, а RBAC stores проверяется middleware.
- Cursor — canonical base64url JSON [schema, part, tenant, store, afterId].
  Проверяются тип, длина, canonical encoding, tenant/store/part и safe ID.
  Это НЕ доказательство доступа и НЕ immutable manifest. Keyset id ASC, без
  OFFSET, MAX(id), COUNT и чтения полного массива ради первой записи.
- Два SQL-вызова непосредственно handler: проверка магазина + LIMIT 1 проекции.
  Число SQL авторизации/RBAC в эти два не входит. Число/время реальных запросов,
  индексы/EXPLAIN ещё не измерены; SQL hint не объявляется доказанным бюджетом.
- До передачи текста из MySQL ставится предел 8192 байта текстовых колонок.
  При превышении CASE не пересылает длинные поля в Node; endpoint возвращает
  413 без кандидата. Значения НЕ обрезаются и не подменяются в успешном DTO.
  В Node дополнительно ограничен JSON до 64 KiB; клиент проверяет UTF-8 объём.
  Большие описания требуют следующего протокола текстовых chunk, не увеличения
  deadline. 413 останавливает текущий проход без продвижения checkpoint; ранее
  сохранённые части остаются. Автоматических бесконечных retries нет.
- sourceVersion = SHA-256 [schema, part, tenant, store, canonical DTO].
  candidateVersion = core-texts:<hash>. Это точная идентичность ТОЛЬКО этой
  проекции, не монотонная версия и не общая версия будущих частей паспорта.
  snapshotId:null, snapshotConsistent:false, passportComplete:false явно.
  Cache-Control:private,no-store; приватный API не входит в публичный SW cache.

### Staging и отмена

`admin-catalog-parts.js` — доменный модуль существующего AdminLocalRepository,
НЕ второй каталог/IndexedDB/scheduler. Общий layout подключает его на девяти
страницах. Namespace catalog:passport-staging v1 содержит штатную identity,
роль/accessViewId/revocation epoch и dimensions store + products/new-order.

В существующем entries хранятся:

- staging:core-texts:<productId>: точные данные, scope, part-scoped candidate /
  sourceVersion, state:staging, отсутствие общего snapshot/готового паспорта;
- checkpoint:core-texts:<productId>: matching version, chunk 0, cursor:null,
  partComplete:true только для этого документа, passportComplete:false;
- meta:core-texts: runId, afterId/следующий cursor, последняя подтверждённая
  порция, scanExhausted и complete:false. runId — ID обхода, НЕ версия данных.

Все три записи фиксируются одним idle.commit()/setMany() readwrite transaction.
Перед HTTP, после ответа/hash и внутри IDB guard проверяется существующее idle
разрешение, AbortSignal, актуальный scope/generation/access-context. Возобновление
активности отменяет незавершённую работу; до commit транзакция abort. Уже успешно
завершённый commit нельзя откатить последующим сигналом — это не обещается.
Ничего не попадает в CatalogRepository runtime, dirty-наборы, passport-index или
flushPersistence. Ни старая, ни новая часть не заменяют рабочий полный паспорт.

Один ход общего scheduler = один HTTP / один товар. После перерыва продолжается
с последнего commit, остальные сохранённые части не очищаются. Внутри глобального
хода перечитывается checkpoint: другая вкладка не повторяет уже выполненную порцию.
После исчерпания прохода повторная загрузка пропускается 15 минут; TTL является
только политикой свежести, не серверной версией. Части сохраняются 30 дней штатной
retain-stale политикой. Держится максимум одна последняя staging-версия core-texts
на товар (новая наблюдённая версия заменяет только прежний staging, не full DTO).

Первый срез ограничен 100 ходами на lifecycle trigger; больший каталог остаётся
частичным, следующий trigger продолжает cursor. Незавершённый запрос сохраняется
в общей очереди при активности и повторяется после следующего idle. Завершение
live keyset обхода не доказывает полноту/удаления при конкурентных изменениях,
поэтому complete:false остаётся всегда, отсутствующие записи не удаляются.

readStagedPart(id) — отдельный диагностический reader с проверкой DTO/hash и
checkpoint; обычные getProductPassport/products/new-order его не используют.
Нового UI, кнопок, уведомлений, polling и дополнительных foreground-запросов нет.

### Проверки и следующий шаг

Синтаксис JS/EJS и git diff --check проверены. Тестовые наборы не запускались.
Существующий PID 14100 не перезапускался: новый URL сейчас возвращает 404,
а открытые вкладки ещё без AdminCatalogParts. Это НЕ проверка нового handler.
Auth остаётся активной в трёх вкладках, один SSE leader / два follower,
20 сохранённых сводок заказов доступны. Эти наблюдения относятся к старому
активному коду, не к доказанному поведению нового staging-среза.

После отдельно разрешённой активации проверить 200/401, store/cursor/RBAC
матрицу, размер/SQL/time, автоматическую очередь с другой страницы, одну IDB
транзакцию части+checkpoints, trusted межвкладочную отмену до ответа/commit,
отсутствие поздней записи после flushPersistence, продолжение и отсутствие
повторного HTTP для свежего завершённого прохода. Всё это пока NOT TESTED.

До следующих частей нужен согласованный immutable источник ВСЕГО raw dependency
graph, проверка engines/индексов, sealed manifest и общий snapshotId. Большие
тексты/коллекции — bounded chunks с отдельными checkpoint. Активировать полный
паспорт можно только одной финальной транзакцией из частей одной согласованной
версии; обычный timestamp/SSE revision/MAX(id) эту гарантию не заменяют.

## A4.2.4: комплексное продолжение (код, до итоговой активации)

### Граница результата

Это НЕ завершённый офлайн-каталог. Добавлены независимые безопасные исходные
проекции и устранение head-of-line блокировки большого core-texts. Полные
паспорта из них не активируются и не подаются в products/new-order. Все новые
ответы/кандидаты имеют snapshotId:null, snapshotConsistent:false,
passportComplete:false; source manifest дополнительно sealed:false.

Фактический full-product-passport-v1 собирается в api/public/shop.js:

- product/core/texts/visibility/categories/photos и blocks config;
- units, conversions, productUnitLinks, relatedProductUnitLinks;
- variants (assignments, group JSON values, exclusions, discount tiers);
- options (assignments, groups/items, target products, their variants/exclusions);
- ingredients и nestedIngredients с units, photos, nutrition и store stock;
- defaultConfig, derived display prices/discounts/benefits, nutrition;
- stock/availability/requirements, comboRefs, editor categories/discounts.

Новая live-source проекция НЕ заменяет соответствующее вычисленное поле.

| API source part | Реально сохраняемые исходные поля | Чего не доказывает |
|---|---|---|
| units | id/code/title/short_title | Полноту общего паспорта |
| conversions | from/to/factor/is_active | Согласованность с units/ценами |
| unit-links | product/unit/base_unit/factor | Полноту связанных зависимостей |
| ingredient-links | Исходные рёбра, quantity/ranges/unit/price_override/sort | Раскрытый граф, nutrition/availability |
| variant-links | Assignment/group/default index/sort/active | Group JSON values, tiers/exclusions и готовые variants |
| option-groups | Scalar-настройки группы | Состав/доступность items |
| option-links | Assignment/type/target/selection bounds/order/active | Итоговые разрешённые опции товара |
| option-items | Scalar target/price mode/quantity/default variant refs | Цены, target DTO, связанные variants |
| stock | product_id/store_id/qty текущего магазина | Вычисленное availability/requirements |

### Ограниченный сетевой протокол

GET /api/admin/catalog/product-passport-source/:part зарегистрирован отдельным
API-модулем api/admin/catalog-source-parts.js в существующем products router.
Это самостоятельная ответственность порционного чтения, не второй repository,
builder, exporter или универсальный журнал.

- Только products.catalog.read с all/stores. new_order.create сам по себе НЕ
  даёт эти дополнительные raw/editor проекции. Старый core-texts контракт для
  new-order сохранён.
- Bearer/RBAC остаются в действующем middleware. Canonical positive x-store-id
  обязателен; конфликт с helpers.getStoreId отклоняется. Каждая страница снова
  проверяет tenant/store через действующий hasCatalogStoreScope.
- Cursor = canonical base64url([1,live-source,part,tenant,store,lastRowId]);
  чужой scope/part, несовместимый cursor и неизвестные query keys отклоняются.
  retry_id адресует одну запись, несовместим с cursor.
- Один source запрос читает максимум 4 строки, не 25 строк с огромными вложенными
  массивами. Вложенные JSON-коллекции не выбираются. Используется id keyset;
  stock использует product_id keyset при фиксированных tenant/store. OFFSET нет.
- Один SQL scope-check + один SELECT с LIMIT 4 (retry LIMIT 1), без N+1, joins,
  рекурсии, full builder и вычисления цен. SQL identifiers только из whitelist.
- Строковые поля подавляются CASE ещё на стороне SQL при сумме >2048 байт.
  Такая строка выдаётся как явная issue с id, не как успешный урезанный DTO.
  Дополнительный предел готового row DTO — 12 KiB; HTTP JSON — 64 KiB.
- private,no-store; приватные API по существующим правилам SW не precache-ятся.
- X-Catalog-Part-Queries=2 считает только handler; Server-Timing, если доступен,
  включает middleware. MAX_EXECUTION_TIME — дополнительный SQL hint, НЕ замена
  проверке существующих индексов/плана/engine при приёмке. Схема не менялась.

### Большие core-texts и retry

Без opt-in старый core API продолжает возвращать 413 на >8192 байт. Новый клиент
использует defer_large=1. При превышении сервер возвращает id/размер/причину и
следующий scope-cursor, data:null, sourceVersion:null, scanExhausted:false.
Текст не передаётся в Node, не обрезается и не сохраняется как нормальная часть.

Одной guarded-транзакцией сохраняются walk-checkpoint, issue и bounded индекс
очереди. Поэтому обход следующих товаров продолжается ТОЛЬКО после durable
фиксации проблемы. Каждая очередь части ограничена 128 issue; при переполнении
порция не сохраняется и checkpoint не продвигается. Это явный ресурсный стоп,
не молчаливое удаление проблем.

retry_id через тот же scheduler повторно читает ровно проблемную запись.
Backoff: 15 минут с удвоением до 16 часов. Перебор ограничен, собственного
таймера/polling нет: будущие lifecycle-триггеры возобновляют due-задачи.
Отсутствующая запись остаётся SOURCE_NOT_AVAILABLE, не объявляется удалённой.
Успех разрешает issue и записывает кандидат+checkpoint одной транзакцией.
Аналогичные source issue обрабатываются при due-повторе/следующем проходе.

Большое описание пока НЕ может стать полным паспортом: chunked UTF-8 чтение
само по себе без неизменяемого источника не гарантирует отсутствие смешивания
частей текста. Оно оставлено в явной retry-очереди, а не скрыто fallback-ом.

### Локальное хранение и отмена

Используется прежний catalog:passport-staging v1 в admin_persistent_cache.entries,
без новой IndexedDB/миграции/очистки. Добавлены source:<part>:<rowId>,
meta:source:<part>, issue:<part>:<id>, meta:issues:<part> и
meta:preparation-budget. Прежние core-кандидаты/паспортные записи сохранены.
sourceVersion — hash только одной исходной строки, НЕ общая версия частей.

Общий AdminIdleHydration исполняет core, source и retry задачи. Source-части
чередуются round-robin, максимум 100 раундов на lifecycle-триггер, общий aging
остаётся действующим. Один turn имеет максимум один HTTP-запрос, idle>=60s,
дедлайн 8s и штатную отмену trusted-активностью в любой вкладке. Видимость окна
не является veto. Realtime/outbox вообще не изменялись.

AdminLocalRepository/AdminPersistentCache расширены только scoped scanEntries:
readonly keyset-страницы до 25 записей с guard/AbortSignal. Initial baseline
логического бюджета учитывает и старые core-кандидаты; данные не удаляются.
Страница/часть/очередь/новый бюджет сохраняются одной setMany-транзакцией.
Пределы staging: 4096 записей и 8 MiB логического размера с запасом на ключи;
это НЕ измерение физического объёма диска. После cap/quota подготовка замирает,
но рабочие паспорта/outbox/drafts не чистятся. При активации необходимо обновить
все вкладки: прежний клиент не ведёт новый бюджет. Обновления старого клиента
или внешняя очистка могут сделать счётчик консервативно неточным.

Guard проверяется при scoped-чтении, после HTTP/hash, перед setMany и внутри
штатной IDB-транзакции. Отмена до завершения вызывает abort. Runtime/dirty
наборы CatalogRepository не используются: flushPersistence не получает новых
source/core кандидатов. Уже завершившуюся транзакцию поздняя отмена не откатит.
Неполный кандидат не пишет рабочий passport/index и не может затереть его.

readStagedPart/readSourcePart/readPreparationState — только внутренние readers
с действующим local-context/tab-proof/scope. Нового UI и уведомлений нет.

### Почему sealed manifest и активация заблокированы

services/product-passport-snapshots.js перезаписывает единственный passport_json
по (tenant,store,product), статусы ready/dirty/building и generated_at не дают
неизменяемую read-view. Full builder вызывает db.query через разные helpers,
а не один snapshot-aware executor. Кеш/независимые hashes/revision не исправят
это. Нельзя читать части из разных поколений этого mutable JSON и ставить sealed.

Минимальный серверный вариант для отдельного согласования:

1. Catalog-only immutable export с идентификатором, schema/projection/tenant/store,
   статусами capturing/sealed/expired и bounded TTL; отдельные immutable chunks
   с уникальным (export_id,part,chunk), payload<=64KiB, row count и content hash.
   Нужны новые таблицы/ограничения, а не использование mutable ready-строки.
2. Согласованное чтение ВСЕГО графа на одном read-only MVCC executor при проверенных
   transactional engines. Helpers должны принимать executor, не обращаться
   скрыто к общему pool. Если capture большого графа не удаётся ограничить,
   нужны persisted версии исходных данных/другой versioned exporter; одна лишь
   миграция chunk-таблиц не решает вопрос. Держать MySQL transaction между HTTP
   запросами браузера или собирать старый full builder в маленьком endpoint нельзя.
3. Только после coherent capture запечатывается manifest всех required частей,
   количеств и hashes. Manifest неизменяем; доступ проверяется при каждой выдаче.
4. Клиент сверяет все chunks/manifest/scope и freshness рабочего паспорта. Одна
   короткая транзакция меняет active pointer + существующий index. Чтение остаётся
   совместимым со старым полным DTO. До этого activation запрещена.

Ни таблицы, ни exporter, ни фиктивный manifest/activation в этом срезе не добавлены.
Derived prices/nutrition/defaultConfig/availability, group JSON values, exclusions,
tiers и окончательная сборка зависимостей остаются заблокированной частью этапа.
Полный builder/бизнес-расчёты не изменялись; ускорение старого запроса 25 паспортов
не заявляется. Новые source endpoints обходят эти вычисления, но их время/SQL и
выходные DTO ещё требуют измерений после активации.

### Приёмка до активации

Новые server/client пути: NOT TESTED в браузере до отдельно разрешённого restart.
Синтаксис изменённых JS и git diff --check проверяются без тестовых наборов.
Предыдущая приёмка 99 core частей, 20 orders, девяти shells и одного SSE не является
доказательством приёмки новой реализации. После единой активации проверить все
source части/byte caps/store/cursor/RBAC, deferred/retry, baseline budget,
атомарные part+cursor+issue+budget, trusted отмену, отсутствие поздней записи,
resume/reload/freshness и сохранность действующих данных. Sealed activation
остаётся BLOCKED отдельно от проверки этих независимых staging-функций.

Фактическая дополнительная проверка прежнего активного кода на PID 10984:
новый readSourcePart в открытых вкладках отсутствовал, новый сервер не активирован.
После истечения старого TTL штатная core-подготовка была запущена native
offline/online lifecycle без навигации/очистки. DevTools задержал реальный ответ
на response-stage (диагностическая задержка, бизнес-данные не подменялись).
Trusted keydown Shift в третьей вкладке зарегистрирован в 1792584696209;
Network.loadingFailed net::ERR_ABORTED — 1792584696211. Все 199 scoped staging
записей, их hash и walk checkpoint afterId=62/confirmedAt=1792584625754
не изменились после отмены и штатного flush через ensureCombos([], definition,
awaitPersistence). В следующие 60 секунд новых core-запросов не зарегистрировано.
После следующего idle ответ завершился за 1230ms (Server-Timing app=1202.2ms,
9 SQL с middleware), checkpoint продвинулся на afterId=63. Максимум один
наблюдаемый core HTTP одновременно. Сессии сохранены, один leader/два follower,
20 orders подтверждены перед проверкой. Это PASS отмены/late-write/resume старого
core-пути, НЕ доказательство работы нового budget/source/deferred/retry кода.

## A4.2.4: активация staging и проект immutable snapshot (21.10.2026)

### Что активировано и действительно наблюдалось

Одно разрешённое переключение: подтверждённый CRM PID 10984 -> 8184,
тот же node.exe server.js, cwd проекта, прежнее окружение (102 ключа; значения
не выводились). Второго перезапуска не было. Авторизация трёх вкладок сохранена.
Контролирующий SW обновился с 2-1792580241632 до 2-1792584892083 штатным механизмом.

Все девять live-source API вернули 200 в существующем Owner/store-контексте.
Ни один ответ не объявляет snapshot согласованным или паспорт готовым.
Первое чтение каждой проекции, миллисекунды; Server-Timing SQL включает middleware:

| Проекция | HTTP | app / handler | SQL всего / handler | Строк | JSON, байт |
|---|---:|---:|---:|---:|---:|
| units | 1358 | 1345.8 / 262.8 | 5 / 2 | 4 | 970 |
| conversions | 1376 | 1367.3 / 307.4 | 5 / 2 | 4 | 1037 |
| unit-links | 779 | 770.0 / 297.9 | 5 / 2 | 3 | 842 |
| ingredient-links | 725 | 717.1 / 298.4 | 5 / 2 | 4 | 1515 |
| variant-links | 842 | 835.3 / 357.2 | 5 / 2 | 4 | 1147 |
| option-groups | 812 | 802.1 / 407.4 | 5 / 2 | 4 | 1514 |
| option-links | 914 | 904.2 / 513.1 | 5 / 2 | 4 | 1532 |
| option-items | 902 | 886.8 / 494.2 | 5 / 2 | 4 | 1757 |
| stock | 865 | 856.5 / 369.1 | 5 / 2 | 4 | 881 |

Это разные исходные проекции, не эквивалент прежней foreground-порции 25 полных
паспортов за 38.8-41.7 s. Ускорение полного builder не заявляется. В штатном
idle наблюдались source-ответы примерно 0.66-1.20 s, до отправки около 2-7 ms;
SQL с middleware 5-9. Массового нагрузочного испытания не было.

Проверены 401 без токена; 400 для store -1, 0, 01, 1e0, 1.0, text;
404 для отсутствующего магазина (без fallback на текущий); 400 для чужих
tenant/store/part cursor и malformed cursor/retry_id. Повтор cursor units дал
одинаковую следующую страницу [5,6], после [1,2,3,4]. Проверка реального другого
tenant, закреплённого store-conflict и 403 другой роли NOT TESTED: подходящего
контекста нет, роли/права не менялись. Статический tenant/store/RBAC аудит выполнен.

Подготовка стартовала с «Команды» без посещения товаров в этом сценарии,
после общего idle >=60 s. Пассивно наблюдалась одна завершившаяся IDB-транзакция:
4 source:units:* + meta:issues:source:units + meta:source:units + meta:preparation-budget.
Создание/complete заняли около 3 ms. Максимум один source HTTP одновременно
на три вкладки. Приватных API-ответов в публичном CacheStorage не найдено.

Завершён первый live-обход девяти проекций: 6 units, 4 conversions, 3 unit-links,
53 ingredient-links, 37 variant-links, 8 option-groups, 65 option-links,
32 option-items, 99 stock = 307 исходных записей. Все 307 content hashes проверены.
Это scanExhausted, НЕ complete: checkpoint сохраняет complete:false,
snapshotConsistent:false, а данные — snapshotId:null/passportComplete:false.
Состав staging на момент сверки: 525 ключей, включая старые core-кандидаты и meta.
Бюджет без самого meta:preparation-budget — 524 записи / 703941 байт;
независимый пересчёт совпал. Следующие обычные обновления могут менять эти числа.

Хеш рабочего каталога (605 записей) и 20 сводок заказов совпал с baseline.
Все девять маршрутов cash/products/orders/courier-screen/new-order/clients/chat/
team/settings открылись офлайн: 200 от SW, настоящий layout/sidebar,
admin-catalog-stream.js и admin-catalog-parts.js доступны, нейтрального fallback нет.
Ошибок обязательных ресурсов не зарегистрировано. После возврата сети один SSE
leader / два follower, одна удерживаемая stream Web Lock; авторизация сохранилась.
Открытие shell НЕ доказывает полноту локальных данных каждого раздела.

Отдельная проверка НОВОГО source-пути с диагностической задержкой реального ответа
в DevTools (Response-stage, без подмены payload/clock/checkpoint): native trusted
Shift в третьей вкладке в 1792586558226; units первой вкладки получил ERR_ABORTED
в 1792586558228. До и после отмены, затем штатного flushPersistence через
ensureCombos([], definition, awaitPersistence), все 525 staging ключей имели
одинаковый hash e29042e42654565893359fae9f14bad215db628c14e413fbbc6eb16097e4eaf7.
Checkpoints и бюджет не изменились. Invalid InterceptionId при попытке отпустить
ответ возник уже после native abort, это не успешный поздний ответ/commit.
Это проверка отмены на response-stage, не искусственный abort внутри IDB commit.

В первые 60 s после trusted-ввода source-запросов не было во всех трёх вкладках.
Первый следующий source HTTP — через 77223 ms; повтор units — через 81223 ms,
успешные 656.6 ms и checkpoint units afterId=4 / confirmedAt=1792586640107.
Таким образом отмена/late-write/flush/resume нового пути подтверждены браузером.
Изначальное окно диагностического наблюдения завершилось раньше resume;
продолжение подтверждено отдельным чтением Resource Timing и реального IDB,
а не ошибочно объявлено по результату окончившегося diagnostic script.

Финальное независимое чтение: 605 рабочих ключей, 179 паспортов с product.id,
ни одного staging/live-source DTO среди рабочих паспортов; 20 orders и их hash
сохранились. После baseline штатные foreground/realtime/offline-extra механизмы
обновляли рабочий кеш: полное равенство его хеша за ВЕСЬ интервал не заявляется.
Первоначальное равенство выше относится к моменту завершения первого source-прохода.
Последняя проверка бюджета: 704177 байт / 524 записи, независимо пересчитаны точно;
все 307 source hashes по-прежнему валидны. Числа меняются при штатном refresh.

Границы 8 MiB/4096, переполнение issue-очереди и backoff реальной проблемной строки
NOT TESTED: текущий набор существенно меньше, специально заполнять пользовательский
IDB или менять товар запрещено. Код ограничений проверен статически; обычный учёт
бюджета проверен браузером. Квота — не физическое измерение занятого диска.

### Реальные препятствия для immutable capture

Read-only metadata: Percona Server 8.0.37-29, REPEATABLE-READ; все 28 проверенных
таблиц зависимостей — InnoDB. Это позволяет один согласованный MVCC read-view,
но НЕ делает существующий builder согласованным автоматически.

1. services/product-passport-snapshots.js делает ON DUPLICATE KEY UPDATE
   passport_json по (tenant,store,product). generated_at/source_revision/status
   не фиксируют неизменяемое поколение. Старый snapshot builder в api/public/shop.js
   buildProductPassportSnapshotPayloads отличается по форме от полного admin DTO.
   Эту таблицу оставляем действующему кешу, не используем как immutable chunks.
2. buildFullProductPassportsPayload в api/public/shop.js последовательно вызывает
   product/availability/blocks/nutrition/prices/discounts/categories/details/support/
   stock helpers через pool, без общего executor/read-view. В частности,
   buildPublicFullProductAvailabilityMap считает stock по продуктам отдельно.
   Оборачивать старый builder в endpoint с названием chunk — не решение.
3. ensureDiscountDeletedColumns может делать SHOW/ALTER из read-path. Любые lazy DDL,
   DML, внешние кеши и pool-запросы запрещаются внутри будущего capture: schema
   capabilities проверяются отдельно, неподходящая схема — явный отказ capture.
4. Прямой product INSERT/UPDATE и отдельные категории/остатки не везде находятся
   в одном бизнес-Tx. MVCC может законно увидеть промежуточное состояние такого
   многошагового сохранения. Для бизнес-атомарного snapshot нужно сначала охватить
   эти writer-пути общей транзакцией, не меняя формулы/правила сохранения.
5. Есть корректные примеры: stock adjustment пишет документ, qty и deferred catalog
   events на одном conn, commit, затем activatePreparedDirty. Но общий route-wrapper
   инвалидирует snapshots после ответа через pool, не атомарно с каждым изменением.
6. catalog_changes и MAX(id) — realtime hints, не commit clock. AUTO_INCREMENT может
   выделиться до другой транзакции и commit произойти позже; retention 30 дней и
   in-memory listeners также не являются доказательством строгих удалений.
7. Скидки зависят от new Date(), starts/ends, weekdays/time. Нужен один valuationAt
   для derivation и прежняя политика часового пояса. Время — параметр вычисления,
   не доказательство согласованности источника; validUntil ограничен ближайшей
   границей расписания даже при неизменных таблицах.

### Замыкание зависимостей

Захват касается одного root-product и ограниченного транзитивного графа, НЕ копии БД.
Нужны реальные строки, читаемые full builder и orderStock helpers:

- prod_products, prod_categories, prod_product_categories (включая title категорий
  для действующих discount/editor DTO); product JSON/text/config/photos/nutrition.
- prod_units, prod_unit_conversions, prod_product_unit_links.
- prod_product_ingredients и вложенный ingredient graph с исходными product rows.
- prod_variant_assignments, prod_variant_groups (включая values JSON),
  prod_variant_value_exclusions, prod_variant_discount_tiers.
- prod_option_assignments, prod_option_groups, prod_option_items,
  prod_option_item_exclusions, prod_option_item_product_settings, target products
  и нужные им variants/unit-links/categories.
- prod_combos, prod_combo_blocks, prod_combo_block_products, prod_combo_set_blocks.
- prod_product_stocks только выбранного store и всех действительно зависимых products.
- mkt_discounts, mkt_discount_products и только необходимые публичному admin DTO
  поля правил; ten_tenants — whitelist rounding/timezone/нужных параметров расчётов.

mkt_discount_customers/usage встречаются в общих discount helpers, но клиентские
списки/история использования НЕ включаются в экспорт каталога. Если выяснится,
что конкретное вычисляемое поле действительно требует их, сначала определить
разрешённую минимальную агрегированную проекцию и право; не копировать PII.
Auth/RBAC/store-access остаются живой проверкой каждого API, а не частью клиентского
raw bundle. Каждый capture валидирует whitelist schema и граф; недостающая зависимость,
SQL-ошибка/availability fallback/cycle-overflow — отказ, а не sealed неполный DTO.

### Предлагаемые таблицы: только проект, миграций нет

Существующие source-таблицы, legacy snapshot cache и catalog_changes остаются.
Минимальное дополнение — три catalog-specific таблицы, без универсального event log:

| Таблица | Ключи и данные | Назначение |
|---|---|---|
| prod_catalog_snapshot_revisions | PK(tenant_id, scope_store_id), revision BIGINT UNSIGNED, writer_coverage_version; scope_store_id=0 для общего каталога | Транзакционный clock каталога / конкретного магазина |
| prod_product_passport_exports | PK(snapshot_id BINARY(16)), tenant/store/product, projection/schema/builder_version, authorization_scope_hash BINARY(32), catalog/store_revision, valuation_at/valid_until, input_root_hash/manifest_root_hash, status, bytes/chunks, lease_until/expires_at | Immutable generation, состояние capture/seal и ограниченная аренда |
| prod_product_passport_export_chunks | PK(snapshot_id, kind, part, chunk_no), payload MEDIUMBLOB, sha256 BINARY(32), byte_length/record_count | kind=raw/output/descriptor; insert-only bytes конкретного поколения |

Индексы exports: (tenant_id,store_id,product_id,authorization_scope_hash,status,created_at),
(status,expires_at,snapshot_id). Индекс для lookup должен учитывать projection/schema;
точный DDL и длины строк уточняются перед миграцией по EXPLAIN/размерам.
Не нужен отдельный mutable head на первом этапе: поиск подходящего sealed generation
по индексу, активный client pointer хранится в прежнем IDB. Нет FK CASCADE от product:
удаление товара не должно разрушать уже опубликованное поколение/manifest.

Обнаруженные индексы: products/categories имеют (tenant_id,id), stock имеет
(tenant_id,store_id,product_id). У prod_product_unit_links вообще нет tenant-leading
индекса. У ряда source-таблиц есть (tenant_id,product/group/active...), но не точный
(tenant_id,id); LIMIT 4 сам по себе не гарантирует короткий scan между tenant.
Перед rollout нужны read-only EXPLAIN конкретных source и capture выборок, затем
отдельно согласованные адресные индексы: как минимум оценить unit_links
(tenant_id,id) и (tenant_id,product_id,id), а не добавлять все индексы вслепую.
InnoDB включает PK в secondary indexes: например conversions(tenant_id) может
уже покрывать нужный keyset. Не дублировать его без EXPLAIN.

### Точная граница захвата C1 и неизменяемость

1. Проверить действующий доступ/scope, engines/schema и лимиты до capture. Один
   bounded capture за HTTP turn, на одной выделенной connection из существующего
   pool. Запуск только по idle-команде клиента; автономного массового backfill нет.
2. На этой connection выполнить SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
   START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY. Все исходные строки и
   clocks читать обычными SELECT именно на ней. Никаких locking reads/FOR UPDATE,
   pool-query из helpers, внешнего кеша, DDL/DML или продолжения Tx между HTTP.
3. Замкнуть весь нужный граф в этом read-view. Большие text/JSON можно читать
   байтовыми SQL-частями на той же connection и в том же Tx. Нельзя получить
   следующую часть текста из новой live-транзакции и считать это тем же snapshot.
   Сохранять decimal/string/null/JSON order и кодировку без потери точности.
4. Начальные ПРЕДЛАГАЕМЫЕ, не измеренные capture caps: 3 s source read-view,
   2 MiB raw bundle, 5000 nodes/10000 edges, один capture одновременно на процесс
   с общим ограничением deployment. Проверять общий deadline между SQL + query
   timeout. При превышении — rollback/явный CAPTURE_CAPACITY_EXCEEDED, без усечения.
   Числа требуют измерений и отдельного согласования; HTTP deadline остаётся 8 s.
   Остановка HTTP не гарантирует мгновенную остановку SQL: стоимость ограничена сама.
5. Закрыть C1 commit/release сразу после bounded raw capture. Это точка завершения
   read-view. Никаких дальнейших чтений живых таблиц для этого поколения.
   В пределах capped bundle до durable записи допускается ограниченная память;
   crash в этом окне означает новый capture, не восстановление по timestamp.
6. Короткой write-Tx сохранить все raw chunks/хеши + captured header атомарно.
   Полностью captured можно поставить только после всех raw bytes. После commit
   источник — durable insert-only raw, а не изменяемая prod_products/passport_json.
7. Derivation использует только frozen raw + pinned valuationAt и существующие
   формулы, выделенные из текущих helpers с явным executor/input/clock-контрактом.
   Нельзя объявлять fake db.query adapter заменой бизнес-эквивалентности.
   Для дорогой обработки — измеряемые bounded этапы вне C1 (при необходимости worker
   thread), каждый инициируется отдельным idle HTTP; не держать MySQL read-view,
   не запускать автономный job после ухода пользователя в активную работу.
8. Output/descriptor chunks insert-only. Повтор шага сравнивает уже существующий
   hash, не перезаписывает bytes. Последняя короткая publisher-Tx проверяет required
   parts/counts/root hashes и CAS captured -> sealed. Только её commit публикует
   snapshot. Неполный/failed/capturing никогда не выдаётся как sealed.

После capture неизменяемость обеспечивается immutable storage + write-once API,
PK/CAS, а не надеждой, что source не поменяется. Для защиты от ошибочного UPDATE
нужны отдельные права export writer/GC и/или DB triggers, запрещающие UPDATE chunks
и sealed manifest; их DDL/привилегии требуют разрешения. Privileged DBA не входит
в гарантию. Метаданные аренды/retention могут меняться, bytes/hash sealed — нет.
Если граф не помещается в короткий C1, следующий вариант — versioned source/export,
с отдельным согласованием. Независимые live hashes не являются альтернативой C1.

### Commit-ordered revisions и инвалидация

Для проверки свежести, а не для самой MVCC-согласованности, нужны два clocks:
global catalog epoch и store stock epoch. Любой охваченный writer блокирует и
увеличивает нужную revision-строку В ТОЙ ЖЕ бизнес-Tx, что меняет исходные данные.
Блокировки берутся в фиксированном порядке: catalog, затем store по id. Строковая
блокировка удерживается до commit: следующий writer не может опубликовать более
новый epoch раньше предыдущего. Это не AUTO_INCREMENT/event id/MAX(id).

Охватить product/category/unit/ingredient/variant/options/combo/discount/import
writers, настройки расчётов tenant и ВСЕ stock writers (stock posting, orders,
public-order stock effects). Пути многошагового pool.save сначала переводятся на
существующий transaction pattern без изменения бизнес-правил. Текущие корректные
stock Tx расширяются clock increment; courier outbox/порядок операций не меняются.
Прямые внешние SQL-писатели требуют контракта или DB-защиты. До полного coverage
нельзя включать флаг строгой freshness/deletion reconciliation.

Snapshot читает epochs обычными SELECT внутри C1. Когда все writers охвачены,
это осмысленная версия того же read-view. Source изменения после C1 не меняют
старый export: hints лишь помечают его stale; проверка epochs допускается в idle
или как необходимый foreground. Активность не запускает дополнительный prefetch.

Разделять coherent-as-of и latest: validation API не устраняет последующий TOCTOU.
Строгая promotion-политика отвергает candidate с изменившимися epochs/более новым
working sequence. Частые stock commits могут вызвать starvation. Альтернатива —
разрешённый coherent-as-of offline base с явно заданной TTL и отдельным обычным
realtime overlay, не переписывающим immutable base. Выбор этой продуктовой политики
нужен до внедрения, нельзя молча назвать старые остатки актуальными.

### Sealed manifest и HTTP

Предлагаемый корневой DTO (сокращённо; не существующий API):

```json
{
  "formatVersion": 1,
  "snapshotId": "uuid",
  "schema": "full-product-passport-v1",
  "builderVersion": "catalog-export-v1",
  "scopeHash": "sha256",
  "productId": 123,
  "sourceEpochs": { "catalog": "41", "stock": "80" },
  "valuationAt": "ISO-8601",
  "validUntil": "ISO-8601",
  "sealed": true,
  "requiredParts": ["core-texts", "units", "variants", "options", "ingredients", "prices", "availability"],
  "parts": [{ "part": "core-texts", "bytes": 1200, "chunks": 1, "sha256": "..." }],
  "descriptorPages": [{ "page": 0, "count": 1, "sha256": "..." }],
  "manifestRootHash": "sha256"
}
```

Полный whitelist requiredParts берётся из существующего full DTO, не из этого
сокращённого примера. Root подписывает состав/порядок descriptor pages и parts;
страница <=25 descriptors: part/chunk/byteOffset/length/recordCount/hash. Хешируется
детерминированная сериализация root без собственного hash и точные payload bytes.
Общий graph descriptor ограничен capture caps, root/page/HTTP <=64 KiB.
Raw binary slices, например <=24 KiB до base64, учитывают JSON escaping/envelope;
лимит считается по окончательному HTTP, а не только payload. Arrays сохраняют порядок,
UTF-8 собирается по offsets перед decode; описания не обрезаются. Все chunks одной
sealed generation. Независимые hashes без общего capture/manifest недостаточны.

Предлагаемые совместимые catalog API, ещё не реализованы:

- POST /api/admin/catalog/passport-exports: bounded capture одного product, либо
  возврат уже готового подходящего generation. Никакой сборки всего магазина.
- POST /api/admin/catalog/passport-exports/:id/advance: один bounded derive/seal step
  из durable raw, только idle; при недостижимом 8 s — отказ/дальнейшее разбиение,
  не невидимый вечный background job и не увеличение deadline.
- GET .../:id/manifest и .../:id/manifest-pages/:page — только sealed graph.
- GET .../:id/chunks/:part/:chunk — один bounded immutable ресурс.
- POST .../:id/validate — current access, product-existence, epochs и expiry;
  нельзя активировать по одному успешному старому GET.

Каждый API заново проверяет tenant/principal/activeRoleId/accessViewId/revocation,
store и granular RBAC, projection/schema и token-context. Scope hash формируется
на сервере из полного разрешённого контекста; сырые JWT/секреты в ключах, manifest,
chunks, BroadcastChannel и логах запрещены. Новый token-context требует подтверждения
совместимости, не простого повторного использования URL. 401/403 не открывает offline.
Cache-Control: private,no-store; приватный export не входит в публичный SW cache.

### Удаления, checkpoint, активация и GC

Удаления/потеря доступа: validate/chunk выдача проверяет существование и право,
ответ 403/404/410 прекращает candidate. Полный набор каталога сверяется отдельным
bounded immutable membership manifest из ОДНОГО coherent capture разрешённых ids.
Он может использовать те же exports/chunks с иной projection. Только после проверки
всего sealed membership можно помечать отсутствующие local rows недоступными;
одна пустая страница, SSE, MAX(id), истёкшая event retention — не доказательство.
Большой membership, не помещающийся в capture caps, остаётся partial и требует
отдельного решения; никакой вероятностной полноты. Пользовательские drafts/outbox
при этом не удаляются. Явные tombstone поколения относятся к проверенному scope.

Клиент использует прежние AdminLocalRepository/AdminPersistentCache и scope/tab-proof.
Каждый chunk + receipt + checkpoint пишутся одной guarded setMany-Tx. Checkpoint:
scope/schema/snapshotId/manifestHash/part/chunk/bytes/hash/confirmedAt. Resume только
того же immutable id; 410 не смешивается с новым поколением. Перед каждой записью
проверяются guard/signal/scope. Никакого runtime/dirty publication для candidate.

В bounded обработчике/worker вне IDB write-Tx собрать полный DTO, проверить все
receipts/manifest/хеши и прежнюю бизнес-форму. Активация — одна короткая Tx на прежнем
store: проверить durable working sequence и complete receipt, CAS active pointer +
существующий passport index. Нужен durable per-product sequence: все foreground/
realtime writers резервируют/проверяют его и используют существующий catalog-write
Web Lock, иначе candidate может затереть свежий рабочий ответ. Scope guard повторяется
до commit; успешный commit нельзя обещать откатить последующим AbortSignal.
Readers расширяются совместимо: active immutable pointer либо старый полный v1 DTO,
а не второй repository. Большой JSON не сериализуется внутри write-Tx; стоимость
structured clone и pointer/index update измеряется до включения feature.

Client GC согласован с activation lock и активным pointer; сохраняет активное
поколение и безопасно ограниченное предыдущее. Кандидат не вытесняет активный DTO,
drafts/outbox; при quota — пауза. Server GC: caps per tenant/store/product, leases
активных downloads, TTL и удаление failed/expired небольшими порциями. До GC нельзя
удалять sealed chunks отдельно от manifest. Offline клиент не может бесконечно
пиновать сервер: после expiry resume получает 410, но локально завершённый активный
паспорт не теряется. Дополнительные поколения ограничиваются; при исчерпании бюджета
новый capture отклоняется, а не удаляет активный generation за спиной клиента.

### Внедрение и откат: следующий отдельно согласуемый этап

1. Согласовать scope/TTL/as-of policy, capture caps, перечисленные таблицы/индексы,
   экспортные DB-права/immutability guards, coverage всех writers. Подготовить
   additive migrations с feature flags OFF, НЕ запускать их в рамках A4.2.4.
2. Применить после отдельного разрешения в безопасной среде, без тяжёлого backfill;
   заранее оценить online DDL/metadata locks/диск и резервную копию. Не обещать нулевую
   блокировку ALTER TABLE только по слову online.
3. Явный snapshot executor/raw graph capture и pure derivation из существующих
   формул. Сверять полный JSON простого/сложного товара без изменения бизнес-значений.
   Выделение этой ответственности — существенная правка, требует согласования.
4. Поочерёдно охватить writer-Tx и epochs, в фиксированном порядке блокировок;
   сначала shadow export без client activation и без заявления о strict freshness.
5. Canary одного разрешённого scope: latency/SQL/pool waits/undo/history length,
   lock waits, bytes/chunks/GC, JSON equivalence, отмена до/на границе IDB commit.
   Ни одного долгоживущего read-view между HTTP. Не увеличивать параллелизм/8 s.
6. Включить sealed reads/resume, затем совместимые local readers; активацию последней,
   только после writer coverage, equality и browser acceptance. Realtime и outbox
   остаются независимыми, live staging не объявляется новым sealed поколением.

Rollback: выключить export/activation flags, отменить candidate work, оставить старый
v1/последний полный active DTO; не очищать IDB/SW или новые таблицы. Сначала запретить
строгую promotion, потом можно откатывать writer coverage. Приостановить GC/новые
leases, дождаться bounded capture; схему не drop в экстренном rollback. Отдельное
разрешение на production rollout/миграции/DB-права/перезапуск обязательно.

Риски: MVCC undo retention, shared pool pressure, сериализация global epoch writers,
частые stock invalidations/starvation, рост raw+derived storage и hash CPU,
неохваченные import/direct-SQL writers, time-based скидки, ошибки graph closure,
совместимость старых вкладок. До измерений capture caps не гарантируют скорость.

Семантика read-view сверена с MySQL 8.0 manual:
https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html
https://dev.mysql.com/doc/refman/8.0/en/commit.html
https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html

В этом проходе immutable schema/exporter/activation НЕ реализованы. Изменён только
этот документ; рабочие staging API/builder/SSE/outbox и схема БД не менялись.
node --check шести затронутых staging-зависимостей и git diff --check успешны.
Тестовые наборы не запускались. Текущий срез: staging активирован и его основные
пути приняты; общий A4.2.4 PARTIAL из-за непроверенных граничных/чужих access-context
сценариев. Immutable snapshot здесь является конкретным проектом следующего этапа,
не существующей гарантией согласованности live-source данных.

## A4.2.5: реализация независимой immutable-инфраструктуры (не полный паспорт)

### Статус и жёсткая граница

Общий статус A4.2.5: PARTIAL, НЕ PASS. Реализована настоящая immutable generation
для catalog-membership-v1, а не full-product-passport-v1. Дополнительно реализован
bounded loader исходного паспортного графа (plan v1), но его полнота относительно
всех условий legacy builder и JSON/type parity ещё не подтверждена. Pure derivation
полного admin DTO, подключение всех writer-транзакций и атомарная
активация рабочего паспорта НЕ реализованы. Они не становятся готовыми после одной
миграции или включения env. Новые HTTP/IDB/GC пути NOT TESTED в runtime: миграция
не применяется, сервер не перезапускается, flags остаются OFF. Доказательства браузерной
приёмки A4.2.4 выше не переносятся автоматически на этот код.

| Ответственность | Код | Проверка / ограничение |
|---|---|---|
| Additive schema, guards, FK, hashes | migrations/012-add-immutable-catalog-exports.sql | PREPARED ONLY; не применена/не скомпилирована MySQL |
| Один bounded MVCC executor | services/catalog-snapshot-capture.js | STATICALLY CHECKED; engine/column preflight для выбранного trusted capture plan |
| Coherent membership capture | тот же модуль | IMPLEMENTED, NOT TESTED; epochs должны быть инициализированы отдельно |
| Passport raw dependency graph, plan v1 | services/catalog-passport-raw.js | IMPLEMENTED bounded traversal; NOT TESTED, полная DTO parity не доказана |
| Pure full DTO assembler | services/product-passport-dto.js | MOVED VERBATIM из public/shop.js; старый builder использует тот же модуль |
| Durable raw/output/descriptor + sealing | services/catalog-passport-exports.js | IMPLEMENTED для membership, NOT TESTED |
| Full DTO derivation / activation | не реализованы | BLOCKED; нет выдачи сокращённого DTO под видом полного |
| Writer boundary + revisions | versionedMutation в capture module | PREPARED, НЕ подключена к business routes |
| Download/hash/checkpoint/resume | static/js/admin-catalog-parts.js | IMPLEMENTED для membership, NOT TESTED |
| Strict deletion side effects | не включены | validation сообщает prerequisites; local rows не удаляются |
| Shadow JSON comparator | scripts/compare-catalog-passport-exports.js | PREPARED; только node --check, не запускался |

### Схема и реальные типы

Одним read-only запросом information_schema.COLUMNS подтверждено:
ten_tenants.id и ten_stores.id/tenant_id — signed INT; prod_products.id/tenant_id —
BIGINT UNSIGNED. Legacy passport snapshot содержит tenant_id BIGINT UNSIGNED,
store_id INT, product_id BIGINT UNSIGNED. Поэтому новые tenant/store FK — INT,
product_id — BIGINT UNSIGNED NULL (NULL обозначает membership). От product FK нет:
удаление товара не уничтожает immutable поколения. От tenant/store FK RESTRICT,
не CASCADE; insert guard дополнительно проверяет принадлежность store tenant.

Три новые таблицы — revisions, exports, chunks. Header содержит authorization hash,
epochs, builder/schema, bounded expiry/lease, state capturing/captured/building/sealed/
invalid, raw-root/manifest hashes, bytes/chunk counts. Composite FK chunks -> header
проверяет tenant/store/id. Состояния переходят только вперёд или в invalid.
Chunks insert-only; UPDATE запрещён триггером. Вставка raw разрешена только при
capturing, output/descriptor — при building. Trigger проверяет SHA-256 payload.
После sealed core поля и manifest/hash/bytes/counts менять нельзя; GC может менять
состояние на invalid, но не bytes. DELETE требует invalid + истёкшую аренду.
SQL использует DELIMITER и требует соответствующего migration client/прав CREATE
TRIGGER; application startup НЕ выполняет DDL. Миграция не содержит destructive DOWN.

Файл 012 выбран после существующих 009/010 employee и 011 payment миграций.
Он сейчас игнорируется существующим migrations/* в .gitignore. Файл физически
подготовлен; git add -f/config/gitignore не менялись. При будущем ревью/коммите
миграцию потребуется явно включить, иначе она не попадёт в tracked diff/stat.

### Capture и публикация membership

Pool acquisition <=500 ms; поздно полученная connection освобождается. На одной
connection: advisory GET_LOCK (общий между Node workers), engine preflight InnoDB,
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, START TRANSACTION WITH CONSISTENT
SNAPSHOT, READ ONLY. Store, два epochs и ВСЕ membership id-pages читаются через
этот executor в одном view. query API не выдаёт pool и запрещает не-whitelist
таблицы, locking reads, DML, OUTFILE и запросы без явного LIMIT. Keyset по id,
25 id/SQL, без OFFSET. Полный builder внутри Tx не вызывается.

Caps: read-view 3 s, 2 MiB возвращённых source-данных, 4096 суммарно прочитанных
строк (включая store/epochs), 180 SELECT. Deadline/AbortSignal уничтожает connection;
обычный путь commit/release. Превышение -> NEEDS_PARTITIONING, без частичного
membership. Для passport mode engine/column preflight покрывает таблицы raw graph
plan v1, а не только membership. Таблица вне выбранного trusted plan отклоняется.

Passport raw plan v1 теперь реализован отдельно в services/catalog-passport-raw.js:
24 source tables плюс store/revision preflight. Root читается до общих справочников,
чтобы отсутствующий product не запускал обход. Дальше — BFS ingredient/option-target
closure, variant groups/tiers/exclusions/default refs, product/category/unit links,
stock только выбранного store, discount rules/targets, combo refs и необходимые
глобальные units/conversions/categories. Category option-targets раскрываются в
ограниченный набор products. Все source SELECT остаются в одном C1.

Не более 256 products / 16 BFS levels / общих capture caps. Page keyset строится
по всем PK columns; unsafe numeric IDs и потеря cursor отклоняются. Metadata/columns
берутся из выбранного private plan, identifiers валидируются/кавычатся. Большие row
типы читаются по одной строке, остальные <=25; SQL CASE не передаёт row за byte cap
в Node как успешный урезанный объект. Cap 128 KiB для product/variant/discount rows,
8 KiB для остальных; oversize -> NEEDS_PARTITIONING всей попытки.
ten_tenants — только id/rounding/timezone, без password/integration данных. Поля с
именами password/secret/token/credential в других проекциях — schema unsupported,
не молчаливое удаление поля. Metadata actual JSON columns сохраняется; type/Date/
decimal parity относительно mysql2/legacy DTO требует отдельной проверки.

Raw bundle содержит typed schema fingerprint, rows и valuationAt, закреплённый
перед началом read-view, а не при последующей публикации. Он сохраняется insert-only
как raw/dependency-graph и НЕ отдаётся по chunks API. Бюджет памяти — bounded source
payload с ограниченными временными копиями, НЕ обещание 2 MiB всего Node heap.
SQL metrics capture считают source SELECT, не middleware/preflight/Tx/persistence.

declaredGraphClosed:true означает завершение именно объявленного traversal plan,
не доказанную эквивалентность всем веткам legacy full builder. У raw остаются
fullDtoParityVerified:false/passportComplete:false и publishingBlocked. Вызов
publish для raw-поколения отклоняется; никакой части raw не присваивается full DTO
schema. Фактическое время такого capture пока NOT TESTED. Сетевые round-trips и
число источников могут исчерпать 3 s даже у небольшого графа; это явный stop,
не повод расширять deadline или склеивать несколько live read-view.

Дополнительно выделен services/product-passport-dto.js: финальный pure assembler
buildPublicFullProductPassport перенесён из public/shop.js без изменения тела,
поля/формулы/fallback сохранены. Прежний builder использует import той же функции;
дубликата бизнес-логики нет. SHA-256 нормализованного по отступам исходного текста
до/после одинаковый: b08108357d5607400da082e75f540d7c54eec811f71861a2978312b3a29bee4e.
Это статическая проверка переноса, НЕ runtime JSON equality и НЕ завершённая
derivation: details/support/prices/discounts/nutrition/defaultConfig/availability
по-прежнему требуют переноса чтения/вычислений на frozen raw. Их тяжёлые legacy
вычисления в этом проходе не переписывались.

После C1 закрытия durable raw + captured header пишутся одной отдельной write-Tx.
Повтор после потерянного HTTP acknowledgement ищет существующее поколение scope,
а не обязательно создаёт второе. Публикация читает только durable raw, проверяет
raw hash и scope, строит output pages <=25 ID, максимум четыре output inserts за
publish HTTP. Состояние building и подтверждённые chunks durable; повтор сверяет
их hashes и продолжает. Никакого продолжения source read-view между HTTP.

Последний publish turn добавляет descriptor pages (<=25 descriptors/page) и root
manifest одной Tx с output хвостом и state=sealed. Частично опубликованное поколение
не читается как sealed. Root связывает snapshot/scope/schema/epochs/rawRootHash,
requiredParts=['membership'], codec=json-array-pages-v1, counts/bytes, hash полного
ordered ID массива, hashes descriptor pages; последние связывают каждый output
chunk. snapshotConsistent:true относится ТОЛЬКО к membership read-view;
passportComplete:false остаётся обязательным.

Чанк <=24 KiB raw, HTTP envelope <=64 KiB (base64 учтён), generation <=4 MiB/256
chunks; store <=128 generations/32 MiB. Capacity reservations сериализованы на
tenant row, включая рост при publishing. Export write-Tx использует bounded acquire,
query timeouts и общий budget 6 s; HTTP handler deadline 7 s, клиентский 8 s не менялся.
Raw inserts идут последовательными пакетами максимум четырёх chunks, без параллелизма;
один SQL packet ограничен примерно 96 KiB payload (до SQL escaping).
Это ограничения кода, НЕ измеренная производительность. Потерянный COMMIT ack не
объявляется гарантированным rollback: durable generation обнаруживается повторно.

### API и scope

Все маршруты в existing products router, granular products.catalog.read all/stores
для чтения и создания export-cache, никогда new_order.create/catalog.create fallback:

- GET /api/admin/catalog/passport-exports/policy
- GET .../latest
- POST ... с projection=catalog-membership-v1
- POST ... с projection=passport-raw-v1, productId: bounded raw shadow capture,
  без выдачи raw chunks и публикации полного паспорта; дополнительно требуется
  products.cost.read all/stores, так как raw rows содержат себестоимость
- POST .../:id/publish (bounded, resumable)
- GET .../:id/manifest
- GET .../:id/chunks/:kind/:part/:chunk (raw НЕ выдаётся)
- POST .../:id/validate
- POST .../gc (одна generation, <=25 chunk deletes)

Полный passport request получает HTTP 409 EXPORT_FULL_CAPTURE_BLOCKED,
state=BLOCKED, reason=RAW_GRAPH_PARITY_AND_PURE_DERIVATION_REQUIRED, а не успешный
сокращённый паспорт. Невалидный request body — 400. Policy не обещает full readiness.

Каждый запрос проходит действующие auth/permission middleware, canonical positive
x-store-id, hasCatalogStoreScope, повторный loadAccessContext из verified identity.
accessViewId сверяется с серверным. Hash включает tenant/principal/role/accessViewId/
authVersion/store/local epoch/token-context/products projection. x-offline-epoch —
только дополнительная изоляция, НЕ доказательство права. Сырые tokens и персональные
DTO не логируются/не передаются между вкладками. Scope hash не равен JWT.
Headers/chunks ищутся по полному scope; другой контекст не получает поколение по URL.
Cache-Control private,no-store, публичный SW cache не расширялся.

validate сверяет commit-ordered epochs и writer coverage. Coverage 0 по умолчанию;
нехватка revision rows -> WRITER_REVISIONS_NOT_INITIALIZED. fresh/deletionAllowed
не становятся true просто из-за совпадения timestamp/hash/MAX(id). При coverage=0
доступен только coherent-as-of membership, без строгой актуальности/удаления.

### Клиент и GC

В existing AdminCatalogParts добавлен flag-gated membership pipeline без нового
scheduler/repository/IndexedDB. Boot flag OFF -> ноль новых discovery HTTP.
Все фазы (latest/gc/capture/publish/manifest/descriptor/output/validate) выполняются
через AdminIdleHydration: >=60 s глобального простоя, <=1 HTTP/turn, текущие signal/
scope/epoch guards, существующие pause/retry. Видимость окна не является veto.

Прежний catalog:passport-staging namespace, immutable:<id>:<kind>:<n> и
meta:immutable:membership. Chunk + checkpoint + budget — одна guarded setMany-Tx;
проверяются root/hash/descriptor/part/ordering/bytes/counts. Перед финальным verified
все durable chunks проверяются заново. Checkpoint state=verified — НЕ active passport:
passportComplete:false, deletionsApplied:false. Runtime/dirty рабочей модели не
используются; старый working DTO не затирается. На 410 отдельный idle turn сбрасывает
только download checkpoint, не очищает данные. Cancel/reload продолжают durable phase.
Предел 100 turns/lifecycle предотвращает бесконечный обход, дальнейший lifecycle
продолжает checkpoint. Для большого membership одного lifecycle может не хватить.

Server GC берёт истёкшую generation с истёкшей lease, invalidates, удаляет <=25 chunks.
Текущий последний sealed head scope сохраняется до нового sealed поколения. Истёкшие
heads старых auth scopes могут очищаться без выдачи их данных новому scope; GC всё
равно ограничен разрешённым tenant/store. Активные leases защищены. Offline клиент
не пинует сервер вечно: удалённое поколение может истечь, локальный рабочий DTO не
удаляется. Client GC immutable кандидатов в этом проходе НЕ реализован: старые
кандидаты сохраняются до ограниченного budget stop, не вытесняют outbox/drafts.

### Writer coverage: подготовлено, но не переключено

versionedMutation — opt-in helper на выделенной connection: begin, lock clock rows
в порядке catalog(0)/store(id), increment revision, work(conn), commit/rollback.
Он НЕ вызывает existing business routes и НЕ подключён к ним. Никакой автоматической
установки writer_coverage_version=1 и никакого claim полного охвата.

| Writer group | Найденные действующие точки | Что остаётся перед coverage |
|---|---|---|
| Product/category | products.js POST/PUT/PATCH/DELETE prod_products, prod_categories, sort, recalculate-dependents | INSERT product -> categories -> stock сейчас отдельные pool writes; перенести всю logical save и clock на один conn |
| Options | products.js group-bundle/groups/items/assignments, exclusions/settings | Включить все связующие строки, defaults/order и clock в существующие/новые Tx |
| Variants | group-bundle/defaultIndex/groups/tiers/assignments/value-exclusions | Охватить изменение JSON values и tiers вместе с assignments/clock |
| Units/conversions/links | products.js units, unit-conversions, product unit-links | Не оставлять отдельные pool updates рядом с clock другой Tx |
| Ingredients | products.js product ingredients CRUD | Graph dependency invalidation и clock в том же Tx |
| Combo | products.js combo-blocks/combo-set-blocks/combos | Последовательные UPDATE/DELETE/INSERT pool queries пока НЕ атомарны |
| Prices/discounts | product fields + discounts.js create/update/delete/restore/toggle + targets | Create/update с conn и отдельные toggle/delete pool paths должны иметь общий контракт |
| Stock | inline adjustment, stock.js documents/:id/post, orderStock applyStockUpdates, admin/public order effects | Clock increment строго вместе с qty/document/order Tx, не после response/SSE |
| Tenant/store config | tenant.js company/store patch, timezone/rounding/blocks config | Whitelist вычислительных зависимостей, соответствующий catalog/store clock |
| Imports/direct SQL | scripts, внешние DB writers | Инвентаризация и запрет неохваченных writes до strict freshness |

Это точные незавершённые интеграции, не включённые production-изменения. Текущий
route-wrapper dirty invalidation после response не считается достаточной заменой.
catalog_changes остаётся realtime механизмом, не переписывается и не заменяется.

### Flags, shadow и порядок включения

CATALOG_EXPORT_CAPTURE, CATALOG_EXPORT_PUBLISHING, CATALOG_EXPORT_CLIENT_DOWNLOAD,
CATALOG_EXPORT_ACTIVATION: только точное '1', по умолчанию OFF. Policy содержит
requestedActivation, но effective activation всегда false до реализации full graph/
derivation/coverage/CAS activation. Это явная защита незавершённого пути, не рабочая
реализация переключаемой full activation.

Shadow comparator принимает ДВА уже сохранённых full admin passport JSON, сохраняет
array order, сравнивает все поля, не игнорирует timestamp/цены/остатки, выводит только
хеши/размеры/пути различий. Не импортирует db.js, не делает HTTP/DB writes. Новый
full candidate пока получить нельзя: derivation не реализован, поэтому реальное
shadow equality NOT TESTED и не объявляется пройденным.

Безопасное включение:

1. Отдельно резервная копия, проверка восстановления и review миграции/trigger прав.
2. Применение 012 только после явного разрешения, flags OFF. Инициализация двух новых
   revision rows для canary tenant/store с coverage=0 отдельным разрешённым действием,
   без массового backfill и без изменения бизнес-таблиц.
3. Shadow membership capture/publishing: сверить время/pool wait/undo/SQL/GC и hashes.
4. ДО перехода к full паспорту проверить полноту raw graph plan v1 и реализовать pure
   derivation с pinned clock, без pool/lazy DDL/живого кеша. Shadow full JSON equality
   простого/сложного товара — обязательный gate, сейчас BLOCKED.
5. Отдельно разрешённая интеграция writer-Tx, аудит всех зависимостей/imports,
   проверка commit ordering. Только после доказательства — writer coverage version.
6. Canary scope, штатный restart/обновление SW по отдельному разрешению; все вкладки
   должны получить новый код/policy. Включить membership client download, браузерно
   подтвердить cancel/commit-boundary/resume/quota/scope isolation/GC.
7. Реализовать и проверить full DTO CAS activation + durable working sequence и
   client GC с active pointer protection. До этого ACTIVATION не включается.
8. Последовательное расширение scope, наблюдение latency/SQL/lock waits/диска.

Rollback — flags OFF, остановка новых export turns, сохранение старого рабочего
v1 DTO/IDB/outbox и additive таблиц. Не drop таблицы, не очищать browser storage,
не откатывать writer coverage при ещё включённой strict activation.

Для дальнейших действий нужны отдельные разрешения на применение миграции/DB прав,
инициализацию новых revision rows, включение production writer paths и перезапуск.
При этом недостающие full graph/derivation/activation — именно оставшаяся разработка,
а не только вопрос разрешения на деплой. Никаких claims A4.2.5 PASS до её завершения
и настоящей браузерной приёмки. В этом проходе сервер PID 8184 не перезапускался,
бизнес-данные, схема, роли, SSE/chat/courier outbox не изменялись.

Файлы A4.2.5: migrations/012-add-immutable-catalog-exports.sql (ignored),
services/catalog-snapshot-capture.js, services/catalog-passport-raw.js,
services/catalog-passport-exports.js, services/product-passport-dto.js,
api/admin/catalog-passport-exports.js,
scripts/compare-catalog-passport-exports.js; точечные подключения в products router,
navigationRbac, public/shop.js, server.js, layouts/app.ejs, existing admin-catalog-parts.js и этот
документ. Старые правки не откатывались. Никаких browser/storage/migration проверок
нового snapshot-пути в отсутствие применённой схемы не заявляется.

Разрешённые проверки A4.2.5: node --check 11 новых/изменённых JS, компиляция app.ejs,
git diff --check; для новых/untracked/ignored файлов отдельно проверены UTF-8 и
trailing whitespace. Статическая source-hash проверка переноса DTO assembler выше.
SQL не исполнялся/не компилировался MySQL, shadow comparer не запускался, тестовые
наборы не запускались. Tracked diff --stat включает прежние изменения, но исключает
новые untracked файлы и ignored SQL: это не полный размер A4.2.5.

## A4.2.5: повторный аудит масштаба и ограничение admission (2026-10-22)

Эта секция уточняет предыдущий срез. Статус PARTIAL / production activation BLOCKED.
Полный frozen DTO и его клиентская CAS-активация НЕ завершены. Ни schema migration,
ни флаги, ни production writers не включались. Тесты/браузер/нагрузочные запросы не
запускались. Ниже отделены реализованные ограничения от проекта следующих правок.

### Что фактически изменено в этом проходе

- services/catalog-export-queue.js: одна module-singleton admission queue для всех
  tenant/store, а не отдельный generator/timer на тенанта. Её используют capture raw,
  membership и publish membership в существующем exports service. Импорт не создаёт
  timers/jobs. Работает только от явных HTTP-запросов при уже включённых flags.
- server.js: перед auth/parser установлен flag-gated observer/admission только
  export-трафика. Обычные API лишь учитываются счётчиком до finish/close, никогда не
  ожидают очередь. SSE/long-poll stream/events/wait исключены из долгого busy counter.
  Finish и close завершают один lease идемпотентно. Orders/SSE/outbox handlers не менялись.
- Capture/build: максимум 1 одновременно на Node process; до 64 ожидающих + 1 running,
  до 4 ожидающих на tenant. Round-robin tenant; внутри tenant чередуются store. Max
  admission wait 250 ms, пауза между работами >=250 ms. Event-loop turn >50 ms откладывает
  admission, явный pause останавливает новые работы. Активные foreground API запрещают
  новый admission. Уже начавшийся bounded capture не прерывается из-за чужого запроса.
- Дополнительный ранний ingress cap=1 ограничивает даже scope/auth SQL export API.
  При перегрузке — 503 private/no-store + Retry-After с jitter 1–2 s, без SQL/DTO в ошибке.
  Это не авторизация: пропущенный запрос проходит исходные auth/RBAC/store проверки.
  Неизвестный/неавторизованный запрос при свободном admission по-прежнему отклоняется
  auth. При перегрузке допустим 503 до auth, как у обычного rate/admission limiter.
- Одинаковый queued/running scope+resource отклоняется как duplicate, а не получает
  promise чужого запроса с другим AbortSignal. После потери HTTP acknowledgement
  существующий durable generation обнаруживается повторно. Нет autonomous retries:
  существующий AdminIdleHydration ограничивает повторения (maxRetries=2, backoff),
  каждый повтор снова требует idle. Сервер сам не скачивает/не создаёт следующую работу.
- Отменённая ожидающая работа удаляется; начавшаяся держит слот до settlement, даже
  если HTTP уже закрыт. Исходный AbortSignal передаётся в capture/write Tx. Чужой
  запрос не может воспользоваться освобождённым HTTP ingress для второго build,
  пока первый build ещё завершается: running slot остаётся занятым.
- Raw reuse теперь требует совпадения catalog/store revisions и coverage с текущими
  clocks, а не одного TTL. При coverage=0 это всё ещё НЕ доказательство свежести.
- Сериализация cache capacity перенесена с SELECT ten_tenants FOR UPDATE на отдельную
  export-only строку prod_catalog_export_budgets. Ordinary writers не конкурируют
  за бизнес-строку тенанта с export reservation. Все capture/publish/GC используют
  один порядок: budget row -> export header. Ограниченные SUM/COUNT используют store
  индекс; число headers уже ограничено 128.
- Дополнительно cap=3 generations на (tenant,store,product,projection), включая старые
  auth contexts и invalid generations до GC. Новый capture получает явный budget stop,
  а не удаляет активный паспорт/leased generation. Для membership остаётся store cap.
- Подготовленный versionedMutation теперь использует bounded acquire <=500 ms и
  query timeout 1500 ms для locks/increments. Helper по-прежнему НЕ подключён к routes;
  время самих business callbacks не ограничивалось и их семантика не изменялась.

Ограничения очереди: foreground priority — admission, не preemption MySQL query.
Round-robin предотвращает starvation только среди принятых ещё не истёкших jobs.
Ранний HTTP cap намеренно возвращает 503 конкурентам вместо хранения сотен request
closures; между повторяющими запросами разных браузеров строгой bounded-wait fairness
нет. Постоянная foreground нагрузка может бесконечно откладывать подготовку — это
безопаснее конкуренции с рабочими запросами. In-memory очередь не durable; после
crash её восстанавливают клиентские checkpoints/повторы. Это не новый browser scheduler.
Legacy product-passport-snapshots queue не переведена сюда: она остаётся отдельным
существующим источником нагрузки. Общий лимит всех старых и новых builders поэтому
НЕ доказан. Один process singleton не ограничивает cluster workers; существующий
DB advisory lock ограничивает только C1 capture, не все build/publish/legacy работы.
Для разрешённого одного процесса — один export build; multi-process rollout BLOCKED.

### Поколения, копирование и реальные триггеры

Immutable generation создаётся исключительно явным POST capture при capture flag.
Нет старта по тенанту, полного startup backfill или запуска по stock event. Повторный
raw запрос переиспользует captured generation того же authorization hash/product
только при совпадающих epochs и неистёкшем TTL=2 h. Потеря ответа/повтор publish не
перезаписывает chunks. Валидные совпадающие поколения не пересоздаются ради refresh.
После изменения clocks новый явно запрошенный raw capture создаёт поколение, пока
есть budget; сам clock UPDATE ничего не планирует.

Authorization hash включает principal/role/accessView/authVersion/store/local epoch/
token-context. Поэтому одинаковые source rows разных пользователей/ролей/сессий
сейчас НЕ дедуплицируются. Raw включает полные bounded units/conversions/categories,
store discounts и связанный graph; общие справочники повторяются для каждого товара,
поколения и scope. Output и descriptor тоже хранятся отдельно. Это безопасная
изоляция, но НЕ эффективный shared-static export для 100–500 tenants.

Legacy mutable prod_product_passport_snapshots — ещё одна независимая существующая
копия JSON на (tenant,store,product), ON DUPLICATE KEY UPDATE. В services/product-
passport-snapshots.js enqueueBuild/processBuildQueue группируют в memory Map, batch=8,
без общего cap числа jobs; configure запускает scheduleInitialBackfill. Stock
markRelatedProductsDirty/activatePreparedProductsDirty также enqueue legacy
build. То есть stock может пересобирать текущий mutable snapshot, но не новый static
immutable export. Этот старый worker в рамках задания не заменялся/не запускался.

### Static / dynamic: контракт, а не включённая склейка

| Слой | Источник истины / версия | Инвалидирование и согласованность | Свежесть / офлайн |
|---|---|---|---|
| Static | Product/categories/units/links/ingredients/options/variants/combo references/rounding; catalog revision + builder/schema + raw hash | Изменение любой зависимости, включая транзитивную. Один C1 InnoDB view; chunks immutable после capture | Желаемая cache lease 2 h — НЕ гарантия актуальности. Хранить как last-confirmed as-of, не разрешение на операцию |
| Store-state | prod_product_stocks выбранного store + stock recipe/default-selection dependencies; store revision и точный static base id/hash/catalog revision | Stock writer повышает store clock в той же Tx. State выводится только относительно указанного static base. Сам stock не должен создавать static generation | Предлагаемый online revalidate <=30 s/событие, но это ещё не реализованная гарантия. Офлайн явно last-known, не обещание доступности остатка |
| Valuation | Store discounts/schedules/usage limits, rounding policy + store revision + valuationAt + timezone алгоритма legacy | Изменение правила/usage_count И переход временной границы акции. Ревизия без valuationAt недостаточна. Нужен valid-until следующей границы | Не считать истёкшую/исчерпанную скидку актуальной онлайн. Офлайн сохранённое значение не подтверждает цену для server write |
| Legacy full DTO | Все поля, включая availability/stock внутри options/support/product | Пока только unified coherent capture. Нельзя менять stock в static output и выдавать как один исторический snapshot | Активация split legacy DTO запрещена до доказанной composability и shadow parity |

Важная фактическая семантика: discountHelpers.isDiscountActive использует new Date()
и локальные getDay/getHours процесса, а не tenant timezone. Перевод на иной timezone
в frozen builder изменил бы бизнес-правила. Нужен pinned valuation clock с тем же
legacy timezone contract, учёт DST/следующей временной границы; timestamp/hash сам
по себе не даёт согласованности. В этом проходе формулы не менялись.

SQL 012 подготовлен для layer=coherent/static/store-state и точного base_snapshot_id/
base_manifest_hash. Для store-state требуются product, sealed static base того же
tenant/store/product/auth scope/catalog revision, coverage>=1. Поля immutable header
guard не позволяют изменить base/layer после insert. Composite self-FK RESTRICT и
GC исключают удаление base, пока на него ссылается хотя бы один child header. Ни
static, ни store-state не публикуются текущим builder: default layer=coherent.
Это schema support, НЕ существующий динамический export. Повторное использование
static raw между магазинами/principals требует отдельного data-identity + access
binding дизайна: current authorization hash сознательно не ослаблен ради дедупликации.

### Полный DTO: точный оставшийся граф вычислений

| Этап legacy api/public/shop.js | Чтение / зависимости | Frozen статус |
|---|---|---|
| buildFullProductPassportsPayload | products + store stocks; порядок enrichments мутирует product rows | Не переведён на raw; нельзя вызвать после capture с pool и назвать frozen |
| applyPublicProductBlocksToRows / resolveProductBlocksConfigMap | product blocks_config_json, текущие fallback flags | Rows captured, pure projection ещё не подключена |
| buildPublicProductPassportDetails | SQL joins assignments/groups/items/settings/exclusions; variants/tiers; ingredients; conversions/prices/nutrition; выбор defaultConfigs | Raw plan объявлен, но joins/sort/type/branch parity не доказаны; live helper не переиспользуется как pure |
| buildPublicFullProductPassportSupport | Nested ingredients, units/conversions/unit links, stocks, discounts/category targets, combos | Те же raw источники; нет полного frozen support derivation |
| enrichProductsWithDisplayPrice | Rounding policy; variant tier/exclusions; option default variant/target product conversion; default-config | Live conversion resolver; pure price evaluation отсутствует |
| enrichProductsWithDiscounts | Category targets, mkt_discounts/targets/mechanics, active schedule | Lazy ensureDiscountDeletedColumns может выполнять DDL; clock не pinned. В C1/frozen не вызывается |
| applyPublicProductNutrition / buildPublicNutritionResult | Recursive ingredient tree, quantity/unit conversions, products, unit 'g', nutrition cache | Raw graph включает таблицы; pure tree construction/type parity ещё нет |
| buildPublicFullProductAvailabilityMap | buildStockAvailabilityForOrderItems -> buildDeductions -> recursive recipes/options/variant units/conversions -> store stock | Live orderStock reader; формулы не копировались/не менялись. Требуется выделение read-provider без воздействия на order writers |
| buildPublicFullProductPassport | Только сборка product/details/support/availability в legacy DTO | Уже общая pure функция services/product-passport-dto.js, но это не derivation |

Наличие таблиц в raw plan не доказывает полноту всех веток/порядка/дубликатов/типов
legacy queries. Date/DECIMAL/JSON/mysql2 casts и transient error fallback тоже влияют
на exact JSON. Нельзя честно дополнить отсутствующие derived поля null/default.
Full endpoint всё ещё возвращает BLOCKED; activation=false независимо от env.
Shadow-comparer готов для двух полных DTO, сравнивает все поля и array order без
исключений, выводит только hashes/sizes/differing paths. Не запускался: candidate
full DTO ещё не существует, миграция не применена.

### Writer coverage: дополнительные найденные точки и границы

Инвентаризация выше расширена статическим поиском INSERT/UPDATE/DELETE по 24 raw
таблицам в api/services/scripts/data. SQL из динамических identifiers и внешние
writers такой поиск не доказывает; schema changes/default lazy writes также нужны.

| Точка | Что влияет на паспорт | Интеграция, пока НЕ выполнена |
|---|---|---|
| api/helpers.js ensureDefaultCategories (около 282), setProductCategories (около 350) | Вставка default категорий; delete+insert category links | Reader может создавать categories; сначала отделить initial seeding/Txn или учитывать clock атомарно |
| products.js generate-composition 2361, recalculate-dependents 2401, dependent-recalc-values 2492 | client_composition / производные поля товара | Не ограничиваться CRUD: каждая фактическая запись + catalog clock на одном conn |
| products.js CRUD 2884/2972/3097/3227, sort 3287/3315 | Все product fields, membership/order | Product -> categories -> stock проходят через pool; нужен один logical save Tx |
| products.js options 3537–4322, product overrides 5906–6220 | Defaults/exclusions/order/settings и links | Использовать тот же conn и catalog clock; проверить все branch paths |
| products.js variants 4498–4881 | Variant values/defaults/tiers/assignments/exclusions | Clock вместе с JSON/group/tier/link mutation, не after-response |
| products.js combos 5546–5825; units/links/ingredients 6477–6933 | Referenced combo/unit/recipe graph | Несколько pool writes не становятся atomic от отдельного clock update |
| discounts.js create/update 2950/3108; delete/restore/toggle 3321/3352/3387 | Rules/targets/visibility/deletion | Все branches: транзакционные и pool-only |
| api/helpers/discounts.js recordDiscountUsage около 464, вызов orders.js 1454 | UPDATE mkt_discounts.usage_count; не только editor DTO: isDiscountActive проверяет usage_limit, поэтому меняются применимость/цены | Order helper пишет через переданный executor. Нужен store revision в той же order Tx; нельзя объявить stock-only/usage-only нерелевантным |
| orderStock.applyStockUpdates, stock.js documents/:id/post 722, inline adjustment products.js 47 | Qty и зависимая availability | Тот же stock/order conn; не менять бизнес-порядок, post-commit event не clock |
| tenant.js PUT / 3926, POST stores 4450, PATCH stores/:id 4583 | Rounding/timezone/config, появление/удаление store | Только реально используемые columns invalidation, clock init отдельно |
| api/auth.js tenant creation 174+, api/helpers/employeeIdentity.js 157 | Создание tenant; identity-only UPDATE обычно НЕ влияет на выбранный raw DTO | Bootstrap clocks отдельно, не пересобирать static на каждое изменение login_suffix |
| data/tenant-map-config.js 355 | UPDATE ten_tenants map fields | Текущий raw ten_tenants whitelist их НЕ читает; не invalidation всего паспорта без зависимости |
| Lazy ensure* / imports / dynamic SQL / внешний доступ к DB | Schema/time/неохваченные mutations | Устранить lazy DDL из strict path, отдельный review вне текстового поиска |

Новый helper не вызывается ни одним writer. writer_coverage_version=0 не повышается.
Без перехода всех relevant writers на один conn с clock перед business writes strict
freshness/удаления BLOCKED. Существующие Tx сначала проверяют revision boundary,
затем mutation и commit вместе; pool callbacks внутри work недопустимы. Каталожный
clock 0 и store clock берутся в одном фиксированном порядке. Конфликтующие внешние
writers должны быть запрещены политикой или охвачены тем же протоколом.

### CAS-активация: текущее состояние и обязательная следующая граница

Статус НЕ РЕАЛИЗОВАНА для full DTO. Existing guarded setMany даёт atomic chunk+
checkpoint, но это не CAS активного полного паспорта. Membership не активируется.
Сохранены guards против late dirty/flush writes старого offlinePortion, они не
объявляются доказательством нового full pipeline. Старый working DTO не менялся.

Перед реализацией нужен реальный sealed full DTO codec/manifest, а не условный объект
из неизвестного протокола. Следующий минимальный путь в existing CatalogRepository:

1. Durable download всех required parts; каждый descriptor/hash/byte count/scope/
   schema/builder/base id/hash/epochs сверяется. Root sealed + writer coverage.
2. Frozen full derivation + exact shadow comparison; никаких unresolved parts.
3. Сохранить expected durable working sequence ДО download. Все рабочие writers
   должны продвигать этот sequence под тем же catalog-write lock; одного runtime
   counter/localStorage fence недостаточно как durable CAS после restart.
4. Под существующим catalog-write WebLock одна readwrite IDB Tx читает expected
   sequence/current active pointer и candidate receipt; при несовпадении abort.
   В этой же Tx помещает целый full DTO, active pointer/index и activation checkpoint.
   Checks AbortSignal/scope до операций и на request success; abort ДО commit.
5. После commit повторная context проверка, затем publication runtime без dirty.
   Сохранённый до commit старый паспорт остаётся на любой ошибке/quota/cancel.
   Поздняя отмена ПОСЛЕ успешного commit не обещает физический rollback.
6. Не применять stock overlay из stageOfflinePassports к immutable coherent DTO:
   это изменило бы snapshot. Newer working data -> отказ активации, не частичный merge.

Новый placeholder activator не добавлен: без steps 1–3 он создал бы ложную гарантию
и параллельный путь записи. Это оставшаяся разработка, а не вопрос включения флага.

### Модель нагрузки: расчёт, НЕ результаты нагрузочного теста

Известные из предыдущей приёмки размеры HTTP JSON: простой паспорт 4 958 B, сложный
18 094 B. Это не измерения raw graph/новых chunks. Новый full output пока не построен.
Ранее foreground 25 товаров 38.8–41.7 s нельзя считать стоимостью новой queue unit.

Жёсткие текущие limits: raw <=2 MiB/4096 source rows/180 source SELECT/read-view 3 s;
generation <=4 MiB/256 chunks; store <=32 MiB/128 headers; raw product/projection <=3
поколений включая старые scope. Output chunk <=24 KiB; descriptor <=25 entries.
Raw + output + descriptor считаются в bytes_total, manifest/header/index/undo/binlog
overhead в store cap НЕ входят. Per-row bounds и SQL LIMIT ограничивают ответ, но
не доказывают низкую scan cost без EXPLAIN на реальной DB/индексах.

| Сценарий | 100 tenants | 500 tenants |
|---|---:|---:|
| 1 store/tenant, каждый достиг store cap | <=3.125 GiB chunk payload | <=15.625 GiB chunk payload |
| 2 stores/tenant, каждый достиг cap | <=6.25 GiB | <=31.25 GiB |
| 2 stores/tenant: max headers при 128/store | 25 600 | 128 000 |
| Одна raw попытка/tenant при достижении 180 source SELECT | 18 000 суммарных SELECT | 90 000 суммарных SELECT |
| Расчёт 1 job/tenant, unit 2 s + pause .25 s, без foreground/backoff/GC | ~225 s | ~1 125 s |

Последняя строка — ТОЛЬКО сценарное допущение 2 s/unit, не измерение и не SLA.
500 одновременных HTTP не станут 500 MySQL captures: ingress=1, остальные получают
bounded busy и повторяют через свой idle/backoff. Общее время в присутствии рабочих
запросов/503/pool wait/GC не имеет гарантированного upper bound. Дополнительные auth/
metadata/sealing SQL в 180 не входят. Существующий legacy builder тоже вне этого cap.

Гипотетический полный rollout: N=1000 products/tenant, S=2 stores, G=2 generations,
средний output O=8 KiB (допущение в диапазоне прежних DTO), raw R=4*O=32 KiB
(НЕ измерен), descriptor+root H=1 KiB (допущение). Payload=T*N*S*G*(R+O+H):
160.15625 MiB/tenant, ~15.6403 GiB/100 tenants, ~78.2013 GiB/500 tenants до индексов,
MVCC undo, binlog, backup и копирования auth scopes. Три независимых users/token
contexts умножили бы payload на 3 при отсутствии дедупликации. TTL сам не освобождает
диск: нужен реально выполняющийся bounded GC и измеренный disk reserve.

Этот гипотетический N=1000 сейчас НЕ ПОМЕЩАЕТСЯ в 128 headers/32 MiB per store:
сработает явный budget stop. Даже >128 одно-поколенных product exports невозможны
в одном store без GC/изменения модели. Текущие caps не следует повышать ради маскировки:
для полного каталога сначала shared-static/reference content identity + ограниченная
retention активного/предыдущего поколений, отдельный state TTL, измерение raw размеров.
Изменение stock в coarse raw требует новой coherent generation по явному запросу;
без реализованного layering оно всё ещё дорого. Производственная пригодность для
500 tenants НЕ подтверждена этим расчётом.

### Migration 012 и безопасная поставка

Подготовлено теперь ЧЕТЫРЕ таблицы (revisions, export_budgets, exports, chunks).
Added layer/base links + immutability checks и indexes generations/base. Default
coherent совместим с текущими insert statements; store-state без подходящего base
отвергается. GC не удаляет referenced base. Ни одна DDL/DML команда не выполнялась;
SQL triggers/FK пока не проверены самим MySQL, только прочитаны.

git check-ignore -v подтверждает .gitignore:8:migrations/* именно для файла 012.
Без изменения остальных ignore rules будущая поставка после ревью может выполнить
`git add -f -- migrations/012-add-immutable-catalog-exports.sql`, затем проверить
`git diff --cached -- migrations/012-add-immutable-catalog-exports.sql`. Это только
рекомендация будущего действия; сейчас git add/commit/ignore edits НЕ выполнялись.
Если предыдущая редакция 012 уже применена где-либо — НЕ переисполнять файл: понадобится
отдельная forward migration. В этой среде применение пользователем не подтверждалось.

### Gates перед production

1. Full raw graph/type/clock parity; реальные frozen details/support/prices/discounts/
   nutrition/defaultConfig/availability и прочие поля, строгий shadow comparer.
2. Writer coverage всех перечисленных branch paths, imports и lazy writes. Сначала
   согласовать транзакционные переделки pool-only writers; не поднимать coverage flag.
3. Реальная full CAS + durable working sequence + client GC active-generation pin.
4. Retention/shared-reference design, чтобы полный store catalog не упирался в128
   headers; измеренные raw/output/descriptor/disk sizes, EXPLAIN и canary нагрузка.
5. Для нескольких Node workers — глобальный build limiter/очередь; для старого builder
   отдельно согласованная интеграция общего admission. Не заявлять общий cap сейчас.
6. Review/отдельное разрешение на migration 012, clocks initialization, затем rollout
   flags OFF -> shadow -> canary -> browser cancellation/CAS/quota/scope acceptance.

Откат: flags OFF, не трогать старый DTO/outbox/drafts/IDB; оставить additive tables.
Ни перезапуск, ни миграция не исправят незавершённые full derivation/CAS/coverage.
Новые API/immutable snapshots/CAS в браузере: NOT TESTED. Только разрешённая статическая
проверка синтаксиса/diff/UTF-8; shadow equality и load tests не запускались.

Результат этого прохода: node --check прошёл для шести JS (queue, exports service,
capture, exports API, server, shadow comparer); git diff --check прошёл (только
предупреждения существующих LF/CRLF настроек). Восемь затронутых файлов проверены
на строгий UTF-8 и trailing whitespace, ошибок нет. EJS в этом проходе не менялись.
Read-only TCP/CIM подтвердили listener 3000 PID 8184, node.exe server.js; процесс
не останавливался/не перезапускался, авторизация и браузерные хранилища не трогались.

## A4.2.5: облегчённый hybrid-transfer-v1 (актуальный выбор)

Эта секция заменяет выбор MySQL export storage как основного пути. Старый код/SQL
не удалены. Новый путь реализован за выключенными флагами; статус PARTIAL, не
production-ready и не браузерный PASS. В отличие от membership-only среза здесь
реализован путь полного legacy DTO до guarded IDB CAS, но writer coverage пока НЕ
включён и потому реальный transfer обязан отказать до начала тяжёлой подготовки.

### A/B/C: сравнение именно существующего кода

| Критерий | A: MySQL raw/output/descriptor | B: live projections + browser derivation | C: выбранный bounded hybrid transfer |
|---|---|---|---|
| SQL | Raw plan до 180 source SELECT + insert raw, build/output/descriptor/GC + derivation; полный derivation отсутствовал | Наименьшая потенциальная стоимость: indexed pages нужных таблиц + clocks. Нынешние 9 проекций НЕ полны | Ровно один проход legacy calculations на candidate, разделённый на 5 stages; дополнительные clocks, без export DML |
| CPU | Capture/serialize/hash + full server derivation + SQL JSON storage | JSON DTO derivation преимущественно в браузере, но сейчас нет общего pure графа расчётов | Legacy formulas только один раз на сервере; browser byte assembly/hash/shape/CAS. Нет новой копии финансовых формул |
| RAM | Raw+builder+output, cap не равен heap; queue/долгие views | Бounded response pages; browser dependency graph | Два временных transfer leases на весь process, один исполняемый stage. После seal остаётся только bounded output, не raw graph |
| MySQL disk | До 32 MiB/store chunk payload, плюс headers/indexes/undo/binlog и legacy cache | Только clocks; browser IDB | Только clocks; временный process-local output, ноль новых MySQL DTO/raw/chunks |
| Первая подготовка | Capture + несколько publish + manifest/descriptors/chunks/validate | Pages всех разрешённых зависимостей + versions; число зависит от graph, пока неизвестно | start + 5 advance + K output chunks + validate; targets 1/25 products, без отдельного descriptor HTTP |
| Изменение товара | Новое raw/output поколение, write amplification | Нужны scopes/версии изменившихся частей и все writers | Нет event-triggered сборки. Следующий явный transfer при новых epochs; старый candidate не активируется |
| Остатки / usage_count | Coarse invalidation старого плана часто заставляет новое full generation | Возможно дешёвое обновление state, но пока нет совместимых версий/coverage | Нет автоматической пересборки по событию. Изменение coarse clock отменяет текущую подготовку; retries ограничены, возможен PARTIAL |
| 100/500 tenants | Рост retained generations пропорционален tenants/stores/products/auth scopes | Низкий серверный диск, но запросы/CPU браузера/несколько профилей всё равно стоят ресурсов | Server RAM/одновременность не растут с числом tenants; при нехватке capacity отказ/backoff, без обещания времени полной подготовки |
| Reuse браузерами | Сейчас exact auth hash сильно ограничивает reuse | Каждый браузер читает pages; safe public refs могут разделяться только при корректной policy | Тот же exact auth hash/product/epochs повторно получает текущую lease; другое local epoch/principal не делят приватный candidate |
| Согласованность / resume | Реальный MVCC raw, но full derivation/CAS отсутствовали | Только при полном transactional writer coverage; независимые хеши недостаточны | Monotone commit-ordered catalog/store clocks до/после КАЖДОГО этапа и одинаковые между этапами, pinned valuation, immutable sealed bytes |
| Эксплуатация | 4 таблицы, triggers, leases/GC, disk/undo/binlog/retention | Минимальные clocks, но большая новая business derivation и raw RBAC surface | Одна clock table, ограниченная память/TTL, потеря process означает restart candidate, не потерю рабочего паспорта |

Выбран C как минимально реализуемый безопасный путь на текущем коде: не хранить
в MySQL несколько больших копий и не воспроизводить вручную тысячи строк legacy
формул в JS клиента. B потенциально дешевле по server CPU, но сейчас не обеспечивает
ту же доказуемую корректность и permission projection: details/support содержат
себестоимости и внутренние rules, helpers смешивают чтения с вычислениями. Сравнение
не является доказательством абсолютного оптимума всех будущих вариантов.

### Реальный функциональный путь

1. policy.strategy по умолчанию hybrid-transfer-v1. MySQL-вариант требует явного
   CATALOG_EXPORT_STRATEGY=mysql и прежних flags; по умолчанию не выполняется.
2. Новые flags CATALOG_EXPORT_LIGHT, CATALOG_EXPORT_LIGHT_DOWNLOAD,
   CATALOG_EXPORT_LIGHT_ACTIVATION по умолчанию OFF. Окружение не изменялось.
3. Из любого app layout существующий AdminCatalogParts запускает новый pipeline
   только для products catalog + cost read. Используется ТОТ ЖЕ AdminIdleHydration,
   60 s общей неактивности, одна HTTP-операция/turn, прежний 8 s timeout/cancel/locks.
4. targets читает indexed keyset по id, <=25 ID, с проверкой clocks. Это live-discovery,
   НЕ согласованный membership и НЕ основание удаления. catalogComplete всегда false.
5. Перед start браузер сохраняет baseline compare tokens текущего product/passport/
   index/active pointer/budget/manifest и localStorage working fence. Baseline durable
   в том же защищённом staging namespace; это не серверная версия и не авторизация.
6. start проверяет coverage и exact scope, создаёт/reuses временную lease без SQL
   записей. При coverage=0 — WRITER_COVERAGE_INCOMPLETE, без запуска builder.
7. advance вызывает ту же prepareFullProductPassports async generator, что foreground:
   products/availability/blocks/nutrition; prices/discounts/categories; details;
   support; stock+assemble. Один advance — один HTTP и одна bounded server job,
   не полный обход каталога/много товаров. Shared nutrition/readCache живут только
   в этой lease и не пересчитываются на каждом chunk.
8. До/после каждого advance проверяются оба clock + coverage, одинаковые с началом.
   После любой ошибки/отмены generator candidate удаляется, не становится sealed.
   Повтор подтверждённого advance с прежним step возвращает progress без replay SQL.
9. После всех расчётов исходный pure assembler создаёт тот же full legacy DTO;
   проверяются все 19 верхних полей. JSON <=256 KiB режется на <=24 KiB chunks,
   root manifest содержит поля/codec/epochs/scope/valuation/bytes/hash и descriptors
   ВСЕХ chunks. Никаких raw source rows браузеру не выдаётся.
10. Каждый chunk + download cursor + staging budget сохраняются одним setMany Tx.
    Далее браузер заново читает ВСЕ durable chunks, проверяет hashes/порядок/сумму
    байт/full hash, JSON/19 fields/schema/product. Неполный DTO не активируется.
11. Непосредственно в activation turn выполняется validate HTTP и затем CAS, без
    переноса freshness-ответа через следующую 60-секундную паузу. Отмена до commit
    прекращает запись; поздняя отмена после фактического commit не обещает rollback.

API в existing exports router, все private,no-store, без public SW cache:

- POST /api/admin/catalog/passport-exports/light/targets {after}
- POST .../light/start {productId}
- POST .../light/:id/advance {step}
- GET .../light/:id/chunks/:chunk
- POST .../light/:id/validate

Каждый запрос повторно проходит auth/granular products.catalog.read/store binding/
loadAccessContext. Требуется дополнительный products.cost.read all/stores (или '*')
на start/targets И при обращении к уже созданной lease. Это намеренно более узкий
vertical slice, не обход read permissions. Роль без cost не получает full admin DTO
или raw cost ради client derivation; для неё сохраняется прежнее безопасное staging.
Authorization hash по-прежнему включает tenant/principal/role/accessView/authVersion/
store/local epoch/token context. Токены не отправляются по BC/в manifests/diagnostics.

### Формулы и полнота 19 полей

prepareFullProductPassports — прежнее тело buildFullProductPassportsPayload с yield
на границах этапов. Обычная функция проходит generator до конца без idle ожиданий;
число/порядок business reads и вызовов формул сохранены. Новая передача использует
тот же generator, а не отдельный calculator. Общий services/product-passport-dto.js
остаётся единственным финальным assembler; он pure и потенциально пригоден браузеру,
но raw dependencies/финансовые вычисления сейчас намеренно НЕ перенесены клиенту.
Браузер собирает и проверяет JSON из частей, не вычисляет цены из закрытых данных.

| Поля DTO | Источник без новых формул |
|---|---|
| product, texts, visibility, nutrition, benefits, revision | Те же product enrichments и pure assembler |
| units, unitConversions, productUnitLinks, stock, ingredients, nestedIngredients, comboRefs | Тот же buildPublicFullProductPassportSupport |
| variants, options, optionAssignments, defaultConfig | Тот же buildPublicProductPassportDetails |
| availability | Тот же buildPublicFullProductAvailabilityMap/orderStock read helper; writers orderStock не менялись |
| editor | Тот же assembler + support categories/discount projection |

isDiscountActive получил необязательный valuationAt. Старые callers без аргумента
сохраняют new Date() и timezone процесса. Передача использует один pinned момент
времени для исходных формул; ни переход на tenant timezone, ни изменение скидок/
usage limits/rounding/default selections не выполнялись. Exact JSON сравнение нужно
делать с legacy при том же valuation/epochs и стабильных media inputs; сравнение
с сегодняшним DTO другого момента акции не эквивалентно. getThumbUrlIfExists остаётся
legacy media dependency; clock contract должен также учитывать неизменяемость media
URL/наличия thumbnail. Бинарные картинки не входят в согласованность business clocks.

Серверный preparation-only AsyncLocalStorage budget действует ТОЛЬКО внутри advance:
read-only SELECT/SHOW COLUMNS, не допускает lazy ALTER/любые DML; без transient retry,
timeout query <=2 s, phase <=4 s, <=64 SQL/phase, <=512 rows/result, <=1024 rows/phase,
<=512 KiB source JSON/phase, cumulative <=512 KiB source JSON/lease. Ошибка DB, даже
если legacy helper её поймал и вернул fallback, делает budget.failed и отменяет lease:
ошибочный fallback не может стать полным паспортом. Обычные запросы имеют прежний
путь, ноль дополнительных SQL на read API; добавлен только проверочный ALS lookup.

Важное ограничение: проверка returned rows/bytes происходит ПОСЛЕ SQL/передачи rows
driver-у. Она не превращает legacy SELECT без LIMIT в дешёвый SQL и не доказывает
отсутствие scan/temporary tables. Deadline клиента не гарантирует остановку MySQL.
Для production необходимы EXPLAIN/метрики конкретных legacy reads и дальнейшее
устранение N+1; слишком большой граф честно останавливается, не обрезается.

### CAS и граница ошибок

Новые compareTokens/compareAndSetMany расширяют существующие AdminPersistentCache и
AdminLocalRepository. Они используют ту же admin_persistent_cache.entries, без новой
IDB/схемы. В ОДНОЙ readwrite Tx сначала читаются/сравниваются baseline tokens, затем
пишутся product, полный self-contained passport, index, manifest, active receipt и
logical budget. WebLock тот же catalog-write. Baseline keys включают durable active
pointer: новый candidate не подменяет более свежую активацию даже при равных DTO.

CAS дополнительно проверяет текущие namespace/fence/scope, локальные dirty/pending
mutation/removal, full/root hashes, sealed/coverage/expiry, fresh validation. Любое
несовпадение -> abort. Нет quota cleanup/retry, нет записи в dirty-наборы. DTO не
проходит stableValue sanitizer (он удаляет data/blob-looking строки и нарушил бы
exact JSON); хранится точный JSON payload. Нет stock overlay/подмешивания mutable
reference:editor, которое могло бы незаметно изменить исходный snapshot.

Runtime публикуется только после commit и нового context guard. Поздний flush не
может подобрать отменённый candidate из dirty-набора. При успешном commit, но потере
checkpoint acknowledgement, следующая попытка сначала проверяет durable active
receipt И хеш фактически сохранённого паспорта. Совпавший commit не пишется повторно;
более свежие рабочие данные не откатываются. Это implemented code, NOT TESTED браузером.

Staging имеет прежний logical limit 8 MiB/4096 records. Новая background-owned active
проекция дополнительно учитывает <=8 MiB/1024 passports; бюджет не равен физическому
диску браузера и не ограничивает прежние пользовательские foreground записи. Старые
candidate chunks не удаляются ради теста/квоты; при заполнении — безопасный stop.
Автоматический bounded GC старых candidate chunks/переиспользование immutable общих
reference blocks в IDB остаются ограничением, не скрытым бесконечным ростом.

Смена scope блокирует старый namespace и ответы, tab-proof не обходится, 401/403 не
включают offline доступ. Предыдущий паспорт остаётся на любой неуспешной Tx.

### Глобальный серверный бюджет и устранённые работы

Существующая catalog-export-queue остаётся единственной общей admission queue:
1 running, <=64 queued, <=4 queued/tenant, wait<=250 ms, pause>=250 ms; ранний HTTP
ingress=1 ограничивает даже auth/scope SQL. Foreground учитывается без DB queries,
никогда не ждёт очередь. Event-loop delay>50 ms/явный pause/foreground -> новый
admission запрещён, 503 с bounded backoff. Это не строгая справедливость между
всеми повторяющими запросами 500 браузеров: принятые jobs round-robin, внешняя
admission может голодать при постоянном foreground, что честно оставляет PARTIAL.

Новые transfer leases: максимум 2 на ВЕСЬ process, TTL=180 s от создания, без renewal
путём polling. Capture/build только по явному idle HTTP, не по событию stock/discount.
Временная память не растёт T*N; при нехватке lease — busy/backoff. Уже запущенная
работа держит running slot до settlement, даже после закрытия HTTP. Cluster workers
не координируют эти leases; single-process rollout only, multi-process NOT SUPPORTED.

При новом LIGHT rollout:

- Не пишутся MySQL raw/output/descriptor поколения/manifest и не запускается их GC.
- Не запускается legacy scheduleInitialBackfill scan при configure. Его публичный
  readPassports/dirty очередь сохраняются: они обслуживают существующий reduced
  public snapshot и не могут быть удалены без изменения потребителей.
- Для разрешённой client light проекции не запускается прежний core/source/membership
  prefetch и дополнительный hydrateOfflineProducts bulk full-builder. Foreground
  загрузка карточек/поиск/new-order и realtime не ждут idle и не отключались.
- Повтор старого advance не повторяет расчёты/SQL; чанки читаются из bounded lease.
- Общие справочники не создаются как raw SQL-копии на каждый товар. Их обязательное
  присутствие в legacy full DTO пока дублируется в client DTO; IDB content-addressed
  references требуют отдельного совместимого materialization, не включены тайком.

Существующий legacy dirty builder всё ещё может пересобирать reduced snapshot при
stock изменениях. Он НЕ является новым полным immutable transfer, но его CPU/SQL
нужно учитывать в общей нагрузке; глобальный cap всех legacy+новых работ не доказан.
Новый code не добавляет rebuild на каждый usage_count; `recordDiscountUsage` writer
не изменялся. Безопасное dynamic-only обновление полного DTO пока не реализовано.

### Частота изменения и разрешённое смешивание

| Слой | Версия/refresh | Offline / условие объединения |
|---|---|---|
| Text/static/category/unit/product graph | catalog revision; по запросу, не startup | Last-confirmed full generation; не произвольные live-source parts |
| Options/variants/ingredients/default config | тот же catalog revision, включая транзитивных dependents | Только та же revision и builder contract |
| Base prices/rounding | catalog revision + builder | Сервер проверяет цену при восстановлении сети/операции; офлайн не подтверждает оплату |
| Store discounts/usage_count | store revision + pinned valuationAt; invalidate также по временному расписанию | Last-known valuation, не обещание актуальной акции/usage_limit |
| Stock/availability | store revision и совместимый catalog/default config | Last-known, без обещания server stock/успеха заказа |

В этом vertical slice слои НЕ активируются независимо: все пять этапов обязаны иметь
одну пару epochs. Изменившаяся пара отменяет candidate. Нельзя присвоить новому stock
старый static DTO и заявить один snapshot. Layer-specific clocks/compatibility могут
уменьшить повторные reads позднее, но требуют writer coverage; этот код их не выдумывает.
При интенсивных stock/discount изменениях возможен честный PARTIAL вместо retry storm.

### Измеримые критерии и модель 100/500

Опорные прежние наблюдения: simple JSON 4 958 B, complex 18 094 B; старые полные
HTTP 5.096 s/41 SQL и 11.061 s/83 SQL; иная foreground порция 25 товаров 38.8–41.7 s.
Это НЕ замеры нового generator/transfer и не эквивалентные cohorts. CPU/heap/индексы
нового пути NOT MEASURED. Нельзя обещать прохождение 8 s по одному дроблению кода.

Пусть Q — число SQL именно legacy builder (старые общие 41/83 могут включать
middleware, поэтому Q из них автоматически не выводим), A — auth/scope SQL на HTTP,
K=ceil(DTO_bytes/24576). На успешную cold подготовку одного товара:

- HTTP = 1 start + 5 advance + K chunks + 1 validate + ~1/25 targets = 7+K+.04.
- Дополнительные revision SQL = 1 start + 10 brackets + 1 validate + 3/25 targets = 12.12.
- SQL всего примерно Q + 12.12 + A*(7+K+.04), без SQL write/chunk GC. На 100 товаров:
  SUM(Q_i) + 1200 + 12 target SQL + A*(700+SUM(K_i)+4). Для обеих прежних DTO K=1,
  получается 804 HTTP, но это расчёт, не измерение throughput.
- Цена повторного same-lease advance: auth/scope, без replay builder SQL. Новый
  товар/новые epochs/утраченная lease требуют расчётов заново. Попытки не бесконечны.

| Ресурс новых exports | 100 tenants | 500 tenants |
|---|---:|---:|
| Дополнительный persistent DTO/chunk payload MySQL (C) | 0 | 0 |
| Clock rows при 1 store/tenant (tenant + store) | 200 | 1000 |
| Одновременно исполняемых новых stages / временных leases | 1 / 2 глобально | 1 / 2 глобально |
| Максимум sealed output payload в двух leases | 512 KiB глобально | 512 KiB глобально |
| SQL источника на один stage | <=64 calls; <=4 s phase budget | тот же глобальный cap, не умножается на tenants |
| A для сравнения: cap chunks при 1 store/tenant | <=3.125 GiB | <=15.625 GiB |

Clock row/index фактический размер не измерен. Две leases учитывают <=1 MiB cumulative
source JSON, но это НЕ hard heap cap: mysql driver rows/derived objects/caches/GC и
временное кодирование имеют overhead, нужна heap-проверка. Не держится полный магазин
в RAM, но один слишком сложный граф может превысить budget и будет отклонён.

Начальная стоимость чтений остаётся O(T*N*Q), а не нулевая: при 1000 products и K=1
это около 804 000 HTTP на 100 tenants / 4 020 000 на 500 для одного браузера/tenant,
распределённых idle/admission/backoff. Это серьёзный аргумент за дальнейшие безопасные
общие refs/client pure functions, но не за ослабление scope/версий. Скорость полной
подготовки/SLA/отсутствие лагов НЕ доказаны. Нагрузка обычных API при canary обязана
измеряться; при ухудшении p95/p99, pool wait, loop lag — flags OFF/pause, не рост limits.

### Retry/resume, границы готовности, разрешения

Staging сохраняет checkpoint даже до первого HTTP. Истёкшая/утраченная lease или
смена версии дают bounded defer/backoff, <=2 повторных перезапуска, затем blocked
PARTIAL без удаления старых данных. maxTurns=100/lifecycle; дальше продолжение по
существующему lifecycle событию. Никакого высокочастотного polling/таймера на tenant.
Resume chunks работает пока lease жива; после crash/TTL надо заново получить candidate.
Хеши старого staging нельзя выдать за новую согласованную версию.

Подготовлена ALTERNATIVE migrations/012-catalog-revisions-only.sql: только та же
prod_catalog_snapshot_revisions с coverage=0. Она ВЗАИМОИСКЛЮЧАЕТ прежнюю 012, а не
выполняется следом за ней. Большая 012 не удалена/не применена. Обе игнорируются
migrations/*; будущий review/staging должен адресно включить ТОЛЬКО выбранный файл
через git add -f -- <точный путь>, без изменений остальных ignore rules. Сейчас
git add/commit/DDL/DML не выполнялись.

Перед включением отдельно нужны:

1. Writer coverage: все DB/category/default seed/discount usage/config/stock/import
   writers должны менять соответствующий monotone clock в той же Tx. Список выше
   остаётся актуальным; их production интеграция запрещена текущим разрешением.
2. Review альтернативы clock-only migration, backup/rollback, явное разрешение DDL
   и initialization clocks. Применение схемы само по себе НЕ даёт coverage=1.
3. Exact shadow сравнение same-epochs/same-valuation full DTO, особенно complex,
   SQL fallback, media, null/date/decimal values; финансовые формулы не подменять.
4. Отдельно разрешённый restart; flags сначала только canary transfer/download,
   затем CAS после браузерной приёмки отмены/commit-boundary/рабочей гонки/квоты/
   scope/offline read. Проверить реальную работу пяти stages <8 s и CPU/heap/SQL.
5. Подтвердить допустимость более узкого cost-read slice; для других ролей нужна
   отдельная безопасная DTO projection, а не скрытая выдача cost.

Код полного пути IMPLEMENTED, runtime NOT TESTED. Writer coverage и production
готовность PARTIAL/BLOCKED. Полная каталожная сверка/удаления, dynamic-only updates,
IDB reference dedup/GC, fairness внешней admission, общий legacy workload и стоимость
для 500 tenants остаются явными ограничениями. Server PID 8184 не перезапускался,
бизнес-данные/roles/SSE/orders/cash/chat/outbox/браузерные хранилища не изменялись.

Уточнения реализации hybrid:

- Перед каждым новым source SQL и после его ответа budget проверяет общий
  queue.allowsPreparation. Начавшийся foreground другого tenant останавливает
  следующие чтения/certification, не только старт нового HTTP. Текущий MySQL запрос
  не обещается остановить мгновенно. Ранний ingress также учитывает ещё исполняемый
  running job после закрытия предыдущего HTTP, не освобождая параллельный source slot.
- Перед JSON.stringify результата проводится bounded обход native JSON (depth<=32,
  <=8192 nodes) и byte accounting, а не создание большого массива для оценки размера.
  И итоговый DTO до serialization проходит node/depth guard и проверку credential
  field names. Найденный password/secret/token/credential/api_key блокирует transfer,
  а не удаляется из DTO ради equality. Cost-read не даёт разрешения на credentials.
- Phase budget identity закреплена за generator; перед каждым measure проверяется
  актуальный ALS context. Бюджет/AbortSignal обновляются только под сериализованным
  advance. Потеря propagation вызывает отказ, а не необусловленный DB path.
- Root содержит builderVersion=legacy-shared-v1 и valuationTimezone; несовместимый
  builder клиент не активирует. Внутренний reference buildAdminFullProductPassports
  допускает тот же необязательный valuationAt для будущего paired shadow. Публичные
  business HTTP routes не принимают этот override и работают с прежним clock.
- Расчёт 804 HTTP/100 products выше относится к первым 100 продуктам без terminal
  empty-page probe. При точном конце набора кратного 25 может понадобиться ещё один
  targets HTTP (3 clock/id SQL + auth). Это не доказательство полной membership.
- scan-finished НЕ запускает периодический полный rebuild и не является строгой
  сверкой удалений. Автоматическое инкрементальное обновление всех активированных
  DTO, независимый refresh динамических частей и GC/dedup остаются следующими gates.

Проверки текущего прохода: node --check 13 JS — PASS; EJS compile app.ejs — PASS;
git diff --check — PASS (существующие LF/CRLF warnings). Строгий UTF-8 всех 15
затронутых файлов — PASS. Полнофайловый whitespace scan нашёл 19 старых trailing
строк products.js; все имеют идентичный текст в HEAD, новые diff их не добавляют,
посторонняя чистка не выполнялась. SQL не применялся/не компилировался MySQL.
Shadow JSON/новые API/IDB CAS/браузерная отмена/нагрузочные показатели — NOT TESTED.
Запрещённые тестовые наборы и приложение не запускались. Текущий tracked diff
содержит также прежние изменения; untracked код/документ и ignored SQL в него не входят.

## A4.2.5 — cost/CAS review, перед разрешением writer rollout

Этот раздел уточняет предыдущую модель hybrid C. Это статический аудит и код под
существующими opt-in flags, НЕ разрешение включать production. Сервер не
перезапускался; migrations/DDL/DML, бизнес-операции и тесты не выполнялись.
Read-only проверка listener: порт 3000 принадлежит PID 8184. Флаги/окружение не менялись.

### Writer coverage: реестр известных путей и необходимые границы

Все строки ниже имеют статус **NOT INTEGRATED / activation BLOCKED**. Поиск
включал явный INSERT/UPDATE/DELETE по таблицам графа во всех backend JS и обход
вызовов helpers. Это полный реестр обнаруженных путей, а не доказательство
отсутствия внешних SQL/import/admin writers. Динамический SQL и внешние инструменты
тоже требуют согласованного запрета или интеграции перед coverage=1.

| Путь | Изменяемая зависимость | Граница / подготовленный способ интеграции |
|---|---|---|
| products.js POST/PUT/PATCH /prod_products, 2884–3226 | prod_products, product_categories, начальный stock | Сейчас pool/autocommit и отдельная inline-stock Tx. Весь product+links должен идти через одну connection; stock-операция сейчас отдельная, атомарность всей HTTP-операции НЕ заявляется |
| products.js DELETE /prod_products/:id, 3227 | product, ingredient/category links, FK cascades | Транзакционный clock tenant+store до удаления; зависимые товары инвалидируются tenant epoch без обхода N DTO |
| products.js generate-composition 2361, recalculate-dependents 2401 | composition, prices/base_qty/nutrition полей products | Pool-записи в цикле; сейчас несколько commit. Либо согласовать одну bounded Tx, либо bump в каждой бизнес-Tx, НЕ один bump после всего цикла |
| products.js dependent-recalc-values 2492 / preview 2520 | read-only вычисление | Не writer; не добавлять clock SQL на чтение |
| products.js category CRUD 2203–2337, sort 3287–3358 | categories, product_categories, FK/checkout links | Часть маршрутов уже имеет conn Tx, часть — pool/циклы. Clock в каждой реальной Tx; не response hook |
| helpers.js ensureDefaultCategories 282, getAllCategoryId 310 | prod_categories | Скрытый INSERT из чтения; вызывается products GET /prod_categories 1911, bootstrap 6328 и setProductCategories. Требует отдельной writer boundary только когда реально создаются missing категории; простое SELECT не должно bump |
| products.js GET /prod_products, 2673 / INSERT 2745 | product_categories | Скрытая допись missing all-category links из списка. Даже GET является writer, пока этот repair остаётся. Нужна отдельная Tx для repair и clock, не глобальная обёртка GET |
| helpers.js setProductCategories 330 | product_categories, возможный seed категории | Получать ту же writer connection, не pool. Сейчас несколько DELETE/INSERT; самостоятельно atomic не является |
| products.js options group-bundle 3537, groups 3711/3824/4021 | option_groups/items/assignments/settings/exclusions | Встроить в существующие conn Tx там, где они есть; pool-пути предварительно объединить. DELETE учитывает каскады и legacy cleanup option_overrides/exclusions |
| products.js option items 4093/4159/4212, assignments 4231/4296/4322 | option_items, option_assignments | Tenant catalog epoch; одинаковый group влияет на множество товаров, без rebuild fan-out |
| products.js product option assignment/order/disable 5906–6037, item-exclusions 6039 | assignments, option_item_exclusions, option_item_product_settings | Clock вместе с reorder/exclusion/settings, не между DELETE и INSERT |
| products.js variant bundle/group/default 4498–4730, tiers 4731, assignments 4791–4899, exclusions 6220 | variant_groups/assignments/discount_tiers/value_exclusions | Tenant clock, включая изменение default index и JSON значений. Использовать исходные транзакционные границы только после проверки всех helper executors |
| products.js combo-blocks 5546–5652, combos/set-blocks 5706–5838 | combo_blocks/block_products/combos/set_blocks | Несколько pool DML в одной HTTP-операции: НЕ атомарны; нужна согласованная Tx, нельзя просто bump в конце |
| products.js units 6477–6552, conversions 6572–6646, unit-links 6668–6737 | units/conversions/product_unit_links | Tenant clock, включая soft delete/is_active и коэффициент; не глобальный кеш между tenant |
| products.js ingredients 6834–конец | product_ingredients и пересчитываемые зависимые поля | Tenant clock; если helper меняет продукты отдельно — это отдельная Tx, пока не объединено |
| discounts.js create/update 2950/3108, target helpers 2090 | mkt_discounts, mkt_discount_products | Есть выделенная conn Tx; все target/discount DML и clock должны быть в ней, вместе с rollback |
| discounts.js delete/restore/toggle 3321/3352/3387 | is_deleted/is_active и прочие поля mkt_discounts | Одно store-clock обновление в той же Tx; сейчас pool-пути ещё НЕ охвачены |
| helpers/discounts.js recordDiscountUsage 416 | mkt_discount_usage, discounts.usage_count, promo usage | usage_count участвует в usage_limit/isDiscountActive. Это НЕ безразличная статистика. orders.js 3576/3816 передают conn, а 5037 передаёт pool после других сохранений: третья ветка НЕ атомарна. В этом задании orders не изменяется, это точный blocker |
| products.js applyInlineStockAdjustment 30–150 | product_stocks + posted stock document | Уже conn Tx. Clock до stock DML на той же conn, не publishStockChanged после commit |
| stock.js POST /documents/:id/post 722 | product_stocks | Уже conn Tx; drafts/items до post не меняют passport stock. Бump один на store/Tx, а не на каждую строку |
| helpers/orderStock.js applyStockUpdates 790 / applyStockDeductionForOrderItems 881 | product_stocks, в том числе транзитивные ингредиенты | Caller owns Tx: admin orders, public shop/payment callbacks. Нельзя начинать nested Tx в helper. Покрытие требует отдельного разрешения на эти writers |
| public/shop.js stock callers 160 и 25890, admin/orders.js 3751 | stock через общий helper | Проверить каждую caller Tx, включая payment/status ветки. Заказы/оплаты текущим заданием НЕ изменяются |
| tenant.js PUT profile 3926 / DML 4277 | price_rounding_mode/precision, timezone; общие settings | Whitelist влияющих на DTO полей, catalog epoch для rounding. Не инвалидировать паспорт из-за bot secrets/map settings/name, не читать секреты в exports |
| tenant.js POST/PATCH stores 4450/4583 | существование/active store, конфигурация доступа | Создание clock вместе со store insert (после отдельного bootstrap approval); store changes в их Tx. Hours/address не считать формулой паспорта без фактической зависимости |
| auth.js tenant creation 174–197 + ensureDefaultCategories | новый tenant/категории | Создать clock rows с coverage=0 в регистрации после отдельного разрешения; не выдавать coverage за факт создания строк |
| employeeIdentity.js 157, tenant-map-config.js 355, tenant.js password/integration/domain writers | tenant identity/map/secret, НЕ whitelist DTO | Не добавлять бесполезный revision/rebuild на эти изменения; права/доступ инвалидирует текущая auth модель |
| products.js upload/deletePhotoFiles 1305–1458, helpers.getThumbUrlIfExists | photos_json + файловый thumb | DB URLs покрываются product Tx; filesystem не входит в MySQL clock. Требуется политика immutable asset URL/публикации и paired shadow; совпадение DB epoch не доказывает неизменность внешних файлов |
| checkout constructor 2134, auto-add 4997–5276, rewards/customer/promo targeting | вне текущего полного passport graph | Не добавлять их без доказанной зависимости в builder. Если graph расширяется — новая coverage версия, не молчаливое включение |

`catalog_changes`, SSE hints, MAX(id), updated_at и response-finish invalidation
не заменяют clock в той же бизнес-Tx. При нескольких транзакциях возможны
промежуточные состояния: clock их обнаружит, но не сделает HTTP-операцию атомарной.

Подготовлен, но не подключён `versionedMutation()` в существующем capture module:
выделенная connection → BEGIN → **один** UPDATE clock rows по PK с ORDER BY →
`work(conn)` → COMMIT. UPDATE получает row locks без лишнего SELECT FOR UPDATE;
affectedRows должен совпасть со всеми ожидаемыми clocks, иначе rollback.
Store mutation передаёт storeId, catalog-only передаёт catalog=true без storeId:
так статичная правка не пишет лишний store clock. Combined mutation передаёт оба;
до 32 дополнительных store IDs, с дедупликацией и сортировкой. Для обычной пары раньше требовались
4 clock SQL, теперь 1. Это стоимость ПОДГОТОВЛЕННОГО helper, не ускорение живых writers.
Callback не должен сам commit/rollback, выполнять DDL, использовать pool или
другую connection. Для уже-owned Tx нельзя вкладывать этот wrapper: при будущем
rollout владелец BEGIN/COMMIT переносится в него целиком либо проектируется
отдельная проверенная интеграция; существующий executor автоматически не усыновляется.
Ошибка rollback уничтожает connection вместо возврата загрязнённой сессии в pool.
На обычный read-path никаких clock SQL этим helper не добавлено.

### Полный DTO и CAS

Оба пути используют тот же generator/legacy pure assembler и те же формулы.
Контракт из 19 верхних полей не сокращён: product, units, unitConversions,
productUnitLinks, stock, availability, ingredients, nestedIngredients, variants,
options, optionAssignments, defaultConfig, comboRefs, editor, benefits, texts,
visibility, nutrition, revision. Discounts присутствуют во вложенных product,
editor.discounts и benefits; defaultConfig/availability не заменяются membership.
Сам факт общего кода не доказывает точное равенство данных при разнесённых reads.
Shadow comparer требует ровно 19 полей и одинаковые product/tenant/stock.store_id;
сравнивает все вложенные значения, без исключённых timestamp/business fields.
Запуск comparer/paired capture сложного продукта — **NOT TESTED**: migration,
writer coverage и активация новых путей не разрешены.

Исправлены статически найденные CAS-риски:

- Working `flushPersistence` пишет `meta:working-sequence` с монотонным safe integer
  в той же IDB setMany транзакции, что и данные, под общим catalog Web Lock.
  Одинаковые значения тоже меняют sequence (защита от ABA). Legacy отсутствие = 0.
  Baseline включает durable sequence token; проверки actual tokens + записи DTO,
  summary/index, manifest, budget и committed receipt — одна readwrite Tx.
- Старый baseline без sequence не используется для новой активации: клиент
  возвращается к baseline без удаления старых chunks/рабочего паспорта.
- Manifest для слияния читается из IndexedDB, а не из потенциально устаревшего
  runtime другой вкладки. Его ожидаемое содержимое остаётся частью CAS.
- Проверяются sealed manifest/codec/19 fields/chunk descriptors/hashes/байты,
  scope, epochs формата uint64; запрещён rollback catalog/store epochs и более
  старый valuationAt при той же паре epochs.
- Ошибка coordination отключает новую активацию, не рабочий API. Fence, idle
  signal, scope, dirty/pending/removed guards остаются; публикация runtime только
  после commit, без dirty queue. Quota не удаляет outbox/drafts/старый DTO.
- Working conflict/LOCAL_CAS_MISMATCH отличаются от пользовательского AbortError:
  bounded defer получает НОВЫЙ baseline (до двух попыток), а не бесконечно
  повторяет прежний CAS под видом пользовательской отмены. Настоящий signal abort
  по-прежнему обслуживает существующий idle scheduler.

Маркер охватывает рабочие batches каталога; cache-index repairs/download metadata
не являются новой серверной версией. Direct maintenance дополнительно защищено
фактическими CAS tokens и shared write fence; fence НЕ объявлен server revision.
Проверка server freshness относится к моменту validate, не к невозможной общей
транзакции MySQL+IndexedDB. Commit, уже завершившийся до abort, не откатывается.
Все новые клиентские гарантии требуют браузерной проверки гонок/abort/quota.

### HTTP/SQL: уменьшение без нового source work

- Opt-in `POST light/start {productId,firstStage:true}` теперь выполняет первый
  существующий ограниченный stage. Использует уже прочитанную revision как before,
  проверяет after; НЕ объединяет два тяжёлых stages. Старый body совместим.
- Seal/replay/start-existing возвращает уже готовые chunks, которые помещаются
  в ответ <=60 KiB (route hard cap 64 KiB). Не поместившийся base64 даже не кодируется.
- Новый совместимый `POST light/:id/chunks {after}` отдаёт несколько соседних
  готовых chunks только если они помещаются. Старый GET одного chunk сохранён.
  Два полных 24 KiB base64 chunks в 64 KiB НЕ помещаются: это не обещание всегда
  отдавать по два. Последний маленький chunk может ехать с предыдущим.
- Один HTTP за scheduler turn, тот же guard, chunk hashes и одна staging+checkpoint
  Tx; потерянное подтверждение не запускает builder заново в пределах lease.
- Validate перед CAS оставлен отдельным HTTP в текущем idle turn: старое inline
  freshness нельзя повторно использовать после прерывания или ожидания следующего idle.

Batched discovery уже ограничен 25 keyset IDs/страницу, но текущий coarse clock
не сообщает, КАКИЕ товары изменились. Поэтому этот код не выдумывает changed-only
skip, строгие удаления или dynamic-only materialization. Общие refs уже memoized
частично внутри одного generator; shared межтоварный cache без версии не добавлен.
Встроенные legacy refs повторяются в полном DTO. Дальнейшая дедупликация требует
совместимого reference materialization, не нового полного source SELECT на каждый chunk.

### Модель 100/500 tenants (расчёт, НЕ нагрузочный тест)

Условия: один store и один browser-подготовщик/tenant, 1000 товаров, DTO помещается
в один chunk, пять build stages, стабильные epochs, нет ошибок/foreground/квот.
Терминальная пустая targets страница при кратности 25 добавляет один HTTP/3 SQL
на tenant; ниже она не включена. Q = фактические source SQL одного builder,
A = auth/scope SQL на HTTP. Прежние 41/83 SQL нельзя автоматически считать Q.

| Метрика | До этого прохода | После, для K=1 |
|---|---:|---:|
| HTTP / 1000 products / tenant | 8040 | 6040 (−24.88%) |
| Revision SQL / product | 12.12 | 11.12 |
| Полные SQL / product | Q+12.12+8.04*A | Q+11.12+6.04*A |
| HTTP / 100 tenants | 804000 | 604000 |
| HTTP / 500 tenants | 4020000 | 3020000 |
| Revision SQL / 100 tenants | 1212000 | 1112000 |
| Revision SQL / 500 tenants | 6060000 | 5560000 |
| CPU формул / source SQL | SUM(Q), те же формулы | НЕ увеличены; убраны 2 auth/envelope обработки на небольшой DTO и 1 clock read |
| Сохранённый MySQL DTO/chunk payload | 0 | 0 |
| Clock rows при одном store | 200 / 1000 | 200 / 1000 |
| Global running stages / leases | 1 / 2 | 1 / 2 (один Node процесс) |

Для большего DTO: HTTP=1 start-with-first-stage + 4 advances + 1 validate +
B оставшихся chunk HTTP + .04 targets = 6.04+B; B зависит от inline вместимости,
не только ceil(chunks/2). Source CPU и Q остаются прежними, экономия — orchestration,
auth и clock reads; фактические CPU-ms/SQL timings пока НЕ измерены.

Сеть: ранее наблюдавшиеся JSON 4958/18094 B дают base64 6612/24128 B на товар
(не новые замеры и не доказанный размер нового DTO). Только payload на 100000
товаров ~0.616/2.247 GiB; на 500000 ~3.079/11.236 GiB, плюс manifests, headers,
auth/TLS, retries. Тот же payload не сжимается этой оптимизацией; уходят два HTTP
envelope/headers на небольшой DTO. RAM не умножается на число tenants: 2 leases,
<=512 KiB source JSON + <=256 KiB output каждая. Это НЕ RSS cap: driver, maps,
derived objects и GC требуют heap measurement. Source rows защищены после чтения,
а не доказанно ограниченным SQL scan — ещё одна причина canary перед включением.
Диск: clock metadata O(T*(1+S)), ни raw, ни output копии в MySQL не добавляются;
существующий legacy mutable snapshot и его rebuild нагрузка не удалены.

При default pause=3 s условная нижняя граница пауз для небольшого DTO: старые
10.04 idle turns/product против новых 8.04 (targets/baseline/build/verify/activate),
то есть около 8.37 h против 6.70 h на 1000 товаров только по паузам, БЕЗ SQL/сети,
начальных 60 s, retries и конкуренции. Это НЕ срок готовности: maxTurns=100 на
lifecycle, общий scope staging budget и постоянный foreground могут остановить
обход значительно раньше. Без lifecycle событий непрерывные 1000 товаров не обещаны.

При массовом stock update: один clock UPDATE/бизнес-Tx (не N clock rows/товаров);
но незавершённый кандидат с другой парой epochs отменяется и может потребовать
повтор source reads. Отдельное dynamic обновление полного DTO НЕ реализовано.
Два bounded retries затем blocked ограничивают storm; это честный PARTIAL,
а не гарантированная свежесть 1000 DTO при частых stock commits.
Квоты browser staging 8 MiB/4096 rows и active DTO 8 MiB/1024 records тоже могут
не вместить 1000 сложных товаров с дублированными refs; бесконечная eviction не включена.

Queue осталась global=1, queued<=64/perTenant<=4, wait<=250 ms, pause>=250 ms,
foreground priority + loop lag threshold 50 ms, 4 s source stage/8 s client request,
без per-tenant worker/polling. Round-robin относится к УЖЕ принятым jobs; early
ingress=1/503 и клиентский jitter не доказывают fairness между 500 конкурентами.
Постоянный foreground вправе отложить offline; latency/SLA/no-starvation не доказаны.
Обычные CRM requests не ждут offline queue; уже выполняемый SQL не мгновенно
прерывается при их появлении. Нужны p95/p99 CRM, pool wait, CPU, loop lag и RSS
canary измерения; никакого роста parallel/deadline как средства прохождения.

### Migration, rollout и оставшиеся разрешения

`012-catalog-revisions-only.sql` остаётся минимальной альтернативой: одна InnoDB
таблица, PK(tenant_id,scope_store_id) обслуживает все новые clock reads/updates,
FK tenant, uint64 revision, coverage=0. Дополнительные индексы/JSON tables/triggers
не нужны этому coarse протоколу. В SQL добавлены только поясняющие comments.
Обе альтернативы 012 применять нельзя. Файл всё ещё игнорируется migrations/*;
для будущей поставки — адресный git add -f -- migrations/012-catalog-revisions-only.sql
после выбора варианта, без изменения .gitignore. Здесь staging Git НЕ выполнялся.

Точные blockers перед включением:

1. Отдельное разрешение migration/clock bootstrap и интеграции ВСЕХ writer Tx,
   включая скрытые GET repairs, pool discount usage и stock/payment callers.
2. Доказанное writer coverage (включая внешние инструменты) до coverage>=1;
   migration сама по себе не даёт snapshot-consistency.
3. Paired сложный DTO JSON при одинаковых epochs/valuationAt; filesystem/media
   policy; реальные SQL/CPU/connection budget измерения, без увеличения лимитов.
4. Браузерные CAS/ABA/stale manifest/abort/old-epoch/quota проверки после отдельно
   разрешённой активации. Статический CAS review не является браузерным PASS.
5. Отдельное решение по coarse stock invalidation, incremental changed discovery,
   bounded refs materialization/GC и server admission fairness перед широким rollout.

Rollback: flags OFF, текущий рабочий legacy path остаётся; clocks и локальные
рабочие DTO/outbox/drafts не удалять. Удаление таблицы до отключения всех будущих
writer integrations небезопасно; additive schema можно оставить на время отката.
Current verdict: **PARTIAL, production activation BLOCKED**, не нагрузочный PASS.

Статические проверки этого прохода: node --check шести изменённых JS — PASS;
git diff --check — PASS с существующими LF/CRLF warnings; strict UTF-8 восьми
затронутых файлов — PASS. Тестовые наборы и shadow comparer не запускались.
