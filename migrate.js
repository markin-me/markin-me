/**
 * Скрипт для выполнения миграции БД
 * Использование: node migrate.js migrations/add_pickup_store_id.sql
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration(filePath) {
  try {
    console.log(`\n📋 Выполнение миграции: ${filePath}`);

    // Читаем SQL файл
    const sql = fs.readFileSync(filePath, 'utf8');

    // Разделяем на отдельные запросы по точке с запятой
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Найдено запросов: ${statements.length}\n`);

    // Выполняем каждый запрос
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`▶️  Запрос ${i + 1}/${statements.length}:`);
      console.log(`   ${statement.substring(0, 80)}${statement.length > 80 ? '...' : ''}`);

      try {
        await db.query(statement);
        console.log(`   ✅ Выполнено успешно\n`);
      } catch (err) {
        console.error(`   ❌ Ошибка:`, err.message);

        // Игнорируем ошибку "колонка уже существует"
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`   ℹ️  Колонка уже существует, пропускаем\n`);
        } else {
          throw err;
        }
      }
    }

    console.log('✅ Миграция завершена успешно!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:', error.message);
    process.exit(1);
  }
}

// Получаем путь к файлу миграции из аргументов командной строки
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Укажите путь к файлу миграции');
  console.log('Использование: node migrate.js migrations/add_pickup_store_id.sql');
  process.exit(1);
}

const fullPath = path.resolve(migrationFile);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Файл не найден: ${fullPath}`);
  process.exit(1);
}

runMigration(fullPath);
