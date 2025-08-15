const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware para parsear JSON
app.use(express.json());

// CORS: permite peticiones desde tu frontend en Netlify
app.use(cors({
  origin: 'https://rav-frontend.netlify.app'
}));

// Rutas de usuarios
const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);

// Rutas de chat general
const chatRouter = require('./routes/chat');
app.use('/api/chat', chatRouter);

// Si tienes filesRouter, usa esto:
// const filesRouter = require('./routes/files');
// app.use('/api/files', filesRouter);

app.get('/', (req, res) => {
  res.json({ message: '¡Backend RAV iniciado correctamente!' });
});

// Endpoint de prueba para NeonDB
app.get('/test-db', async (req, res) => {
  try {
    const db = require('./db-postgres');
    const result = await db.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;