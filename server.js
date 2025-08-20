require('dotenv').config();
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

// --- Redis Adapter para Socket.IO ---
if (process.env.REDIS_URL) {
  const { pubClient, subClient, createAdapter } = require('./redis');
  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO usando Redis Adapter');
    pubClient.on('error', (err) => {
      console.error('Redis pubClient error:', err);
    });
    subClient.on('error', (err) => {
      console.error('Redis subClient error:', err);
    });
    pubClient.on('connect', () => {
      console.log('Redis pubClient conectado');
    });
    subClient.on('connect', () => {
      console.log('Redis subClient conectado');
    });
  }).catch(err => {
    console.error('Error conectando a Redis:', err);
  });
} else {
  console.log('REDIS_URL no está definida, Socket.IO funcionará sin Redis Adapter');
}

// Permite acceso a io desde las rutas
app.set('io', io);

// --- Usuarios en línea ---
let usuariosEnLinea = [];

// Función para emitir usuarios en línea a todos los sockets
function emitirUsuariosEnLinea() {
  io.emit('usuarios-en-linea', usuariosEnLinea);
  console.log('Usuarios en línea emitidos:', usuariosEnLinea);
}

io.on('connection', (socket) => {
  console.log('Usuario conectado al chat:', socket.id);

  // Recibe evento para marcar usuario en línea/fuera de línea
  socket.on('usuario-en-linea', (data) => {
    usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== data.usuario_id);
    if (data.enLinea) {
      usuariosEnLinea.push({ usuario_id: data.usuario_id, nombre: data.nombre });
      socket.usuario_id = data.usuario_id;
    }
    emitirUsuariosEnLinea();
  });

  // Al conectar, si el frontend no envía usuario-en-linea, no se agrega.
  // Puedes emitir la lista actual al conectar para asegurar sincronización:
  socket.emit('usuarios-en-linea', usuariosEnLinea);

  socket.on('disconnect', () => {
    if (socket.usuario_id) {
      usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== socket.usuario_id);
      emitirUsuariosEnLinea();
      console.log('Usuario desconectado:', socket.usuario_id);
    }
  });

  // --- Eventos de chat privado ---
  socket.on('nuevo-mensaje-privado', (mensaje) => {
    io.emit('nuevo-mensaje-privado', mensaje);
    console.log('Emitido nuevo-mensaje-privado:', mensaje);
  });

  socket.on('mensaje-editado-privado', (mensajeEditado) => {
    io.emit('mensaje-editado-privado', mensajeEditado);
    console.log('Emitido mensaje-editado-privado:', mensajeEditado);
  });

  // --- Evento para borrar chat general en tiempo real ---
  // Este evento no es necesario, el borrado se debe emitir desde la ruta DELETE en chat.js
});

server.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;