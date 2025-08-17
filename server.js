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

// --- Usuarios en línea ---
let usuariosEnLinea = [];

io.on('connection', (socket) => {
  console.log('Usuario conectado al chat');

  // Recibe evento para marcar usuario en línea/fuera de línea
  socket.on('usuario-en-linea', (data) => {
    // Elimina si ya existe
    usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== data.usuario_id);
    // Si está en línea, lo agrega
    if (data.enLinea) {
      usuariosEnLinea.push({ usuario_id: data.usuario_id, nombre: data.nombre });
      socket.usuario_id = data.usuario_id; // Guarda el usuario en el socket
    }
    // Emite la lista actualizada a todos
    io.emit('usuarios-en-linea', usuariosEnLinea);
    // LOG para depuración
    console.log('Usuarios en línea:', usuariosEnLinea);
  });

  socket.on('disconnect', () => {
    // Elimina al usuario desconectado solo si estaba en línea
    if (socket.usuario_id) {
      usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== socket.usuario_id);
      io.emit('usuarios-en-linea', usuariosEnLinea);
      console.log('Usuario desconectado:', socket.usuario_id);
      console.log('Usuarios en línea:', usuariosEnLinea);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;