# Address Service: Prod Setup

Короткая инструкция для запуска `address-service` на боевом сервере.

## Что это

- `address-service` это внутренний HTTP-сервис для подсказок и нормализации адресов.
- основное приложение обращается к нему по `http://127.0.0.1:3400`
- наружу этот сервис лучше не публиковать

Рекомендуемая схема:

- основное приложение: доступно из интернета
- `address-service`: работает только на сервере как внутренний сервис
- PostgreSQL: отдельная база для адресного индекса

## Что должно быть установлено

Минимум:

- `Node.js` 20+ и `npm`
- `pm2` для фонового запуска и автозапуска
- доступ к PostgreSQL 14+

Полезно:

- `git`
- `nginx` или `apache` для основного сайта
- `curl` для проверок

Установка `pm2`:

```bash
npm install -g pm2
```

Важно:

- `postgis` и `pg_trgm` для текущей версии сервиса не обязательны
- если база с таблицами `ads_root_cities` и `ads_search_index` уже заполнена, повторный импорт не нужен

## Какие файлы настроить

### 1. Настрой `services/address-service/.env`

Пример:

```env
ADDRESS_SERVICE_PORT=3400
ADDRESS_SERVICE_INTERNAL_TOKEN=change-me

ADDRESS_DB_HOST=YOUR_POSTGRES_HOST
ADDRESS_DB_PORT=5432
ADDRESS_DB_NAME=YOUR_POSTGRES_DB
ADDRESS_DB_USER=YOUR_POSTGRES_USER
ADDRESS_DB_PASSWORD=YOUR_POSTGRES_PASSWORD
ADDRESS_DB_SSL=0

ADDRESS_SERVICE_QUERY_LIMIT=20
ADDRESS_SERVICE_QUERY_TIMEOUT_MS=5000
```

Если PostgreSQL требует SSL:

```env
ADDRESS_DB_SSL=1
```

### 2. Настрой корневой `.env` основного приложения

Добавь или проверь:

```env
ADDRESS_SERVICE_URL=http://127.0.0.1:3400
ADDRESS_SERVICE_TOKEN=change-me
ADDRESS_SERVICE_TIMEOUT_MS=4500
```

Важно:

- `ADDRESS_SERVICE_TOKEN` в основном приложении должен быть равен `ADDRESS_SERVICE_INTERNAL_TOKEN` в `address-service`

## Первый запуск на сервере

Из корня проекта:

```bash
npm install
npm run address:service:install
```

Проверь подключение к PostgreSQL:

```bash
npm run address:service:db:check
```

Если база новая или таблиц ещё нет:

```bash
npm run address:service:db:init
```

Если адресные данные ещё не были загружены:

```bash
npm run address:service:import:gar -- --roots=data/import/mysql-local/root-cities.jsonl --entries=data/import/mysql-local/search-index.jsonl
npm run address:service:import:osm -- --file=data/import/mysql-local/coordinates.geojson
```

Если используется та же PostgreSQL-база, которая уже заполнена адресными таблицами:

- `db:init` можно выполнить повторно, он безопасен
- `import:gar` и `import:osm` повторно выполнять не обязательно

## Как запускать на проде

Рекомендуемый вариант: `pm2`

### Основное приложение

```bash
pm2 start server.js --name markin-main
```

### Address service

```bash
pm2 start src/server.js --name markin-address --cwd services/address-service
```

Сохранить список процессов:

```bash
pm2 save
```

Включить автозапуск после перезагрузки сервера:

```bash
pm2 startup
```

После этого выполни команду, которую покажет `pm2`.

## Как запускать оба приложения

Да, они могут работать одновременно.

Схема:

- `markin-main` слушает `3000`
- `markin-address` слушает `3400`
- основное приложение ходит в `address-service` по `127.0.0.1:3400`

Это не один процесс, а два отдельных процесса на одном сервере.

## Как проверить, что всё запущено

Проверка `address-service`:

```bash
curl http://127.0.0.1:3400/health
```

Если сервис защищён токеном, то без заголовка возможен ответ:

```text
{"ok":false,"error":"UNAUTHORIZED"}
```

Это нормально и означает, что сервис жив.

Проверка с токеном:

```bash
curl -H "x-address-service-token: change-me" http://127.0.0.1:3400/health
```

Ожидаемый ответ:

```text
{"ok":true}
```

Проверка основного приложения:

```bash
curl http://127.0.0.1:3000
```

Проверка процессов:

```bash
pm2 status
pm2 logs markin-main
pm2 logs markin-address
```

Проверка порта:

```bash
ss -ltnp | grep 3400
ss -ltnp | grep 3000
```

## Важные замечания по безопасности

- не публикуй `3400` наружу через `nginx` или `apache`
- не открывай `3400` во внешнем firewall без необходимости
- `address-service` должен быть внутренним сервисом для основного приложения

## Если что-то не работает

1. Проверь `npm run address:service:db:check`
2. Проверь `pm2 logs markin-address`
3. Проверь совпадение:
   - `ADDRESS_SERVICE_TOKEN`
   - `ADDRESS_SERVICE_INTERNAL_TOKEN`
4. Проверь, что `ADDRESS_SERVICE_URL` указывает на `http://127.0.0.1:3400`
5. Проверь, что PostgreSQL доступен с сервера

## Короткий сценарий для уже готовой базы

Если база уже создана и адресные таблицы в ней уже заполнены, то на новом сервере обычно достаточно:

```bash
npm install
npm run address:service:install
npm run address:service:db:check
pm2 start server.js --name markin-main
pm2 start src/server.js --name markin-address --cwd services/address-service
pm2 save
```
