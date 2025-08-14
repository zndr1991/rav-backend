const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;