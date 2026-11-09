# Telegram webhook: независимые исправления и границы проверки

Дата: 2026-11-09. База изменений: `main`, `1ffd1d04be1fd9ba8099f18fa9f690cbba075a74`.
Ветка: `fix/telegram-webhook-diagnostics`. Никаких deploy/restart/миграций.

## Результат и доказательства

**Задержка tenant-бота не объявляется устранённой.** Завершена независимая часть:
исправление диагностики HTTP-доставки и ошибки парсера системного бота.
Inbox/outbox и новый замер сети VPS заблокированы: SSH по ключу не доступен,
изоляция тестовой БД не подтверждена. Изменения БД не подготовлены и не применены.

Предоставленные пользователем измерения, не новые измерения этого прохода:

- Исходящие SYN с VPS `141.8.198.215` к `149.154.166.110:443` без наблюдаемых SYN-ACK;
  контрольные Google/Cloudflare работали. Это подтверждает отсутствие ответа на
  наблюдавшемся участке, но не устанавливает виновника или конкретный фильтр.
- Один `contact`, `eventId=3943bafe8326069f`, обработан шесть раз: пять HTTP 500
  после примерно 10 секунд Telegram API; шестой HTTP 200, API 389 мс, всего 1,14 с.
- `23` — числовой DOMException-код `TimeoutError`. Теперь на границе HTTP он
  преобразуется в `TELEGRAM_API_TIMEOUT`, без потери неопределённости доставки.

Локально подтверждено кодом и mock-проверками:

- Tenant `/start`: HTTPS/secret/config, advisory lock и проверка события,
  определение tenant/auth operation, customer policy, запись доступности контакта;
  затем scoped pending-origin lookup (до двух запросов), known-customer lookup.
  Для неизвестного клиента `sendContactRequest()` формирует `reply_markup.keyboard`
  с `request_contact: true`; доставка — POST `sendMessage`. Для известного клиента
  до отправки дополнительно создаётся одноразовая ссылка и читаются настройки URL.
- Эти чтения последовательные. Без свежего `dbMs/dbWaitMs` или query plan нельзя
  приписать им конкретную задержку и безопасно менять индексы/порядок авторизации.
- Системный обработчик использовал `slice(5)` для шестисимвольного `/start`:
  вместо пустого payload получал `t`, выполнял лишние token lookups и отправлял
  ошибку ссылки. Исправлен разбор `/start`, `/start@bot` и payload. Это отдельный
  legacy-путь, не доказанная причина задержки tenant webhook `/1`.
- `processWebhookEvent()` помечает `done` только после всего handler. При ошибке
  удаляет `processing`. Поэтому пять ошибок отправки допускают шесть исполнений.
  Внутренние auth-транзакции могут уже выполнить commit; внешний обработчик
  не может его отменить. Этот риск воспроизведён, но не исправлен без очереди.

## Что изменено

- `api/telegramApi.js`: общий HTTP helper вместо повторяющихся fetch-блоков
  доставки. Используется только для `sendMessage`/`answerCallbackQuery`.
  Сохраняет 10-секундный deadline и переданный caller signal; не делает retry.
- `api/tenantTelegramBot.js`, `api/telegramBot.js`, `api/messengerDelivery.js`:
  подключён helper; сохранены result shapes, contact keyboard и tracking реального
  message ID. У Telegram-дедлайна OTP теперь явно указан `TimeoutError`.
- `api/messengerAuth.js`, `server.js`: безопасная классификация вместо `23`,
  в том числе через cause обёрнутой ошибки. Auth-переходы/SQL не изменены.
- `server.js`: `TELEGRAM_API_TIMING` — одна JSON-строка на завершённый API-вызов:
  eventId, tenantId, method, startMs/endMs от ingress, durationMs, phase/stage,
  classification, deliveryOutcome, httpStatus, разрешённый causeCode, retryAfter.
  В summary добавлены `telegramApiFirstStartMs/telegramApiLastEndMs`.

Классификация: `TELEGRAM_API_TIMEOUT`, `TELEGRAM_CONNECT_FAILED`,
`TELEGRAM_RATE_LIMITED`, `TELEGRAM_API_REJECTED`, `TELEGRAM_DELIVERY_UNKNOWN`.
Старые `.code` для 400/401/403 сохранены: уведомления используют их для обработки
недоступных контактов. Канонический диагностический код — `.classification`.
DNS/TCP/TLS указываются только по конкретному разрешённому cause code.
`UND_ERR_CONNECT_TIMEOUT` имеет фазу `connect` (TCP/TLS не разделяются);
обычный deadline до headers имеет фазу `unknown`. После headers доступна фаза
`read_body`. HTTP-статус сохраняется даже при ошибке чтения тела.
5xx и потерянный ответ не считаются доказанным отсутствием доставки.
Нет логирования URL, токенов, OTP, chat/user IDs, текстов и Telegram description.

## Разрешённые локальные проверки

Новое ТЗ явно разрешает эти mock-тесты, в отличие от общего запрета AGENTS.md.
Запускать только целевой файл, не весь набор проекта:

```powershell
node --check api/telegramApi.js
node --check api/tenantTelegramBot.js
node --check api/telegramBot.js
node --check api/messengerDelivery.js
node --check api/messengerAuth.js
node --check server.js
node --check scripts/telegram-webhook.test.js
git diff --check
node --test scripts/telegram-webhook.test.js
```

Mock-тесты блокируют реальную сеть, не читают `.env`, не подключают MySQL,
не запускают сервер. Проверяют кнопки, парсер, реальный 10-секундный abort,
DNS/connect/TLS причины, HTTP 400/401/403/429/5xx, body timeout, неизвестную
доставку, очистку ошибок от секретов, result shapes, browser callback,
шесть дублей, конкурентные дубли, DB down, namespaces и истёкший OTP.
Тесты `CURRENT LIMITATION` должны проходить: они фиксируют существующую
уязвимость повторной обработки, а не доказывают её устранение.
Блокировки/commit моделируются, это не integration-тест реального MySQL.
Проверка оставшейся `processing` не равна crash-recovery долговечного inbox.

Результат повторного запуска: **33 passed, 0 failed**, Node v24.14.0,
всего около 10,29 с; deadline-тест около 10,005 с. Синтаксис семи JS-файлов
и `git diff --check` — без ошибок. Другие тесты проекта не запускались.

Не проверены: реальный crash после inbox/commit, lease/worker recovery, транзакционная
outbox, отмена просроченного OTP в очереди, retry backoff и end-to-end tenant isolation.
Без реализации очереди и изолированной БД такие результаты нельзя заявить.

## После настройки SSH: только read-only диагностика тестового контура

Нужен настроенный SSH-ключ для `root@141.8.198.215` либо отдельного диагностического
пользователя и локальный путь/alias. Пароли и приватные ключи в чат не передавать.
В этом проходе `Admin` получил отказ publickey; первая попытка `root` — banner timeout,
повторная — отказ publickey. Пароль из чата не использовался.
Удалённых команд приложения не выполнено.

Команды ниже ещё **не выполнены**. Только тестовый путь/сервис, без чтения production:

```bash
test_root=/var/www/markin-me/markin-me-test
[ "$(readlink -f -- "$test_root")" = "$test_root" ] || exit 1
date -u '+%Y-%m-%dT%H:%M:%SZ'
git -C "$test_root" rev-parse HEAD
systemctl show markin-me-test.service --no-pager \
  -p ActiveState -p SubState -p MainPID -p ExecMainStartTimestamp -p NRestarts
getent ahostsv4 api.telegram.org
getent ahostsv6 api.telegram.org
for family in -4 -6; do
  for host in api.telegram.org www.google.com www.cloudflare.com; do
    printf 'family=%s host=%s\n' "$family" "$host"
    curl "$family" --noproxy '*' --silent --output /dev/null \
      --connect-timeout 5 --max-time 8 \
      --write-out 'ip=%{remote_ip} http=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} first_byte=%{time_starttransfer} total=%{time_total}\n' \
      "https://$host/"
    printf 'curl_exit=%s\n' "$?"
  done
done
```

Вывод curl не содержит response bodies/headers. Root API без токена допустим:
HTTP 2xx/3xx/4xx доказывает полученный HTTP-ответ, а не работоспособность sendMessage.
Exit 6 — resolution, 7 — connect, 28 — deadline; фазу уточнять по time_connect/TLS.
IPv6 failure сам по себе не объясняет IPv4 failure.

Встроенный fetch запускать тем же Node executable, что у тестового сервиса
(путь executable можно получить `readlink /proc/<MainPID>/exe`; не читать environ/cmdline):

```bash
node <<'NODE'
const dns = require('node:dns').promises;
(async () => {
  const safeCodes = new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ECONNRESET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
  console.log(JSON.stringify({ runtime: process.version }));
  try {
    console.log(JSON.stringify({ addresses: await dns.lookup('api.telegram.org', { all: true }) }));
  } catch (error) {
    console.log(JSON.stringify({ dnsFailed: true, causeCode: safeCodes.has(error.code) ? error.code : null }));
  }
  for (const host of ['api.telegram.org','www.google.com','www.cloudflare.com']) {
    const started = performance.now();
    try {
      const response = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
      console.log(JSON.stringify({ host, status: response.status, headersMs: Math.round(performance.now()-started) }));
      await response.body?.cancel();
    } catch (error) {
      console.log(JSON.stringify({ host, ms: Math.round(performance.now()-started),
        timeout: error.name === 'TimeoutError', causeCode: safeCodes.has(error.cause?.code) ? error.cause.code : null }));
    }
  }
})();
NODE
```

Нативный fetch здесь проверяет обычный DNS/address selection процесса; сравнение
семейств выполняет curl выше. Не подменять глобальные DNS/dispatcher/IPv4 настройки.
Root-shell probe не воспроизводит возможные ограничения systemd sandbox/network
namespace тестового сервиса; при расхождении проверять только test-unit ограничения,
не читать Environment/EnvironmentFile или production-unit.

После отдельно разрешённого тестового deploy смотреть только известные безопасные
JSON-записи нового helper, не публиковать общий journal:

```bash
journalctl -u markin-me-test.service --since '10 minutes ago' --no-pager -o cat \
  | grep '^TELEGRAM_API_TIMING {'
```

Сравнивать одинаковый eventId + ingress tenantId + receivedAt; retry имеет тот же hash,
но другое время. Это корреляция, не новый ключ дедупликации. Большой startMs означает
работу до API; большой durationMs — ожидание исходящего API. Задержку до Express
можно отделить только по согласованным ingress/access timestamps и часам.
`message.date` секундной точности и включает возраст повторной доставки — не чистое
время сетевого transit. Ingress tenantId не обязательно равен tenant, разрешённому
auth-scope; это не повод логировать исходный auth token.
Отсутствие retry в HTTP helper не отменяет повторную доставку webhook: пока outbox
не реализована, неопределённый результат всё ещё может приводить к повторной отправке.

Известный webhook `https://posham.ru/api/telegram/webhook/1` не менять и не вызывать
для проверки тестового сервиса: его маршрутизация на порт 3001 не подтверждена.
Не слать реальный `/start` в `@posham_bot`, пока не подтверждён изолированный тестовый
маршрут/бот. Production Nginx/configuration не читать.

## Следующий безопасный этап

1. Настроить key-based SSH и предоставить подтверждение изоляции тестовой БД:
   отдельная schema с ограниченным test DB-user либо отдельный DB instance;
   подтверждение администратора без чтения production-конфига.
2. Снять свежие сеть/commit/runtime метрики, зафиксировать UTC и отсутствие секретов.
3. Спроектировать совместимый inbox/outbox в существующем auth-модуле. Текущие
   внутренние commit нельзя механически вложить в общую транзакцию: нужна явная
   принадлежность транзакции caller, единый commit auth + jobs + event processed.
4. Согласовать защищённое хранение входящих PII/OTP payload и срок их удаления;
   стабильный bot identity + update_id, совместимость со старыми event keys,
   tenant scope и доменную идемпотентность. Не считать сам enqueue отправкой OTP.
5. Реализовать worker с lease/восстановлением, ограниченным backoff, retry_after,
   terminal 400/401/403, осторожной политикой 5xx/unknown, проверкой OTP/request TTL
   перед отправкой и отменой старых заданий. Не обещать exactly-once sendMessage.
6. Mock crash/retry/expiry suite и MySQL integration только на подтверждённой test DB.
7. Review PR, затем отдельно разрешённые deploy/restart **только** test service.

## Техническое обращение провайдеру

«Для VPS 141.8.198.215 наблюдались повторные исходящие SYN к
149.154.166.110:443 без SYN-ACK на ens3; в тот же период HTTPS Google/Cloudflare
работал. Приложение прерывало запросы к Telegram через 10 секунд. Просим проверить
маршрут в обе стороны, egress/anti-DDoS/ACL и потери к Telegram, включая
149.154.166.110/111:443. Время пакетов 12:07:21–12:07:25 из прежнего захвата;
часовой пояс и дату захвата следует подтвердить перед корреляцией. Полные токены
или пользовательские данные не требуются. Готовы приложить новые UTC curl/TCP/TLS
измерения и обезличенные метаданные пакетов после восстановления SSH-доступа».

Новые успешные пробы с VPS не получены; состояние исходящей сети сейчас неизвестно.
Документация: [Node AbortSignal.timeout](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay),
[Telegram API / ResponseParameters](https://core.telegram.org/bots/api#responseparameters).
