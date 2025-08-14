require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === 'false'
    ? false
    : { rejectUnauthorized: false }
});

pool.on('connect', () => {
  console.log('PostgreSQL listo.');
});

pool.on('error', (err) => {
  console.error('Error en PostgreSQL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};