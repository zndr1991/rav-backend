const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://rav-frontend.netlify.app']
}));

// Rutas
const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);

const chatRouter = require('./routes/chat');
app.use('/api/chat', chatRouter);

app.get('/', (req, res) => {
  res.json({ message: '¡Backend RAV iniciado correctamente!' });
});

app.get('/test-db', async (req, res) => {
  try {
    const db = require('./db-postgres');
    const result = await db.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- Socket.IO ---
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://rav-frontend.netlify.app'],
    methods: ['GET', 'POST', 'DELETE', 'PUT']
  }
});

// Permite acceso a io desde las rutas
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Usuario conectado al chat');
  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
  });
});

server.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;