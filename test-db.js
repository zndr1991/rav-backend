require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PG_SSL === 'false'
      ? false
      : { rejectUnauthorized: false }
  });

  try {
    console.log('Conectando a Postgres...');
    const r1 = await pool.query('SELECT 1 AS ok');
    console.log('SELECT 1 resultado:', r1.rows);

    // Crear tabla temporal de prueba (no afecta producción)
    await pool.query(`CREATE TABLE IF NOT EXISTS prueba_migracion (
      id SERIAL PRIMARY KEY,
      texto TEXT,
      creado TIMESTAMP DEFAULT NOW()
    );`);

    // Insert de prueba
    const ins = await pool.query(
      'INSERT INTO prueba_migracion (texto) VALUES ($1) RETURNING id, texto, creado',
      ['Hola desde Neon ' + Date.now()]
    );
    console.log('Insert OK:', ins.rows[0]);

    // Select últimos 3
    const ultimos = await pool.query(
      'SELECT id, texto, creado FROM prueba_migracion ORDER BY id DESC LIMIT 3'
    );
    console.log('Últimos registros:', ultimos.rows);

    console.log('Todo OK ✅');
  } catch (err) {
    console.error('Error en test:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();