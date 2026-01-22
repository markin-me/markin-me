require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'test_shop',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000, // Увеличено до 20 секунд
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.getConnection((err, conn) => {
  if (err) {
    console.error('ОШИБКА подключения к БД:', err.message);
    console.error('Проверьте:');
    console.error(`  - Хост: ${process.env.DB_HOST || 'не указан'}`);
    console.error(`  - Порт: ${process.env.DB_PORT || 3306}`);
    console.error(`  - Пользователь: ${process.env.DB_USER || 'не указан'}`);
    console.error(`  - База данных: ${process.env.DB_NAME || 'не указана'}`);
    console.error('\n💡 Убедитесь, что:');
    console.error('  1. Хост указан правильно (не localhost для внешнего подключения)');
    console.error('  2. Доступ по IP настроен в панели Sprinthost');
    console.error('  3. Файрвол не блокирует порт 3306');
    return;
  }
  console.log('✅ Подключение к MySQL успешно!');
  conn.release();
});

module.exports = pool.promise();
