const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'test_shop',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection((err, conn) => {
  if (err) {
    console.error('ОШИБКА подключения к БД:', err);
    return;
  }
  console.log('✅ Подключение к MySQL успешно!');
  conn.release();
});

module.exports = pool.promise();
