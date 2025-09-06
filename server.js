const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://rav-frontend.netlify.app',
  'https://rav-backend.onrender.com', // tu backend en Render
  'app://.', // Electron
];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'DELETE', 'PUT']
  }
});

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

    socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`Socket ${socket.id} unido a la room de usuario ${userId}`);
  });

  // Recibe evento para marcar usuario en línea/fuera de línea
  socket.on('usuario-en-linea', (data) => {
    usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== data.usuario_id);
    if (data.enLinea) {
      usuariosEnLinea.push({
        usuario_id: data.usuario_id,
        nombre: data.nombre,
        manual: !!data.manual // <-- Solo si fue manual
      });
      socket.usuario_id = data.usuario_id;
      socket.manual = !!data.manual;
    }
    emitirUsuariosEnLinea();
  });

  // Al conectar, si el frontend no envía usuario-en-linea, no se agrega.
  socket.emit('usuarios-en-linea', usuariosEnLinea);

  socket.on('disconnect', () => {
    if (socket.usuario_id) {
      usuariosEnLinea = usuariosEnLinea.filter(u => u.usuario_id !== socket.usuario_id);
      emitirUsuariosEnLinea();
      console.log('Usuario desconectado:', socket.usuario_id);
    }
  });

  // --- Eventos de chat privado ---
  // SOLO EMITIR AL DESTINATARIO Y REMITENTE UNA SOLA VEZ POR USUARIO
  socket.on('nuevo-mensaje-privado', (mensaje) => {
    const enviados = new Set();
    for (const [id, s] of io.sockets.sockets) {
      if (
        (s.usuario_id === mensaje.destinatario_id || s.usuario_id === mensaje.remitente_id) &&
        !enviados.has(s.usuario_id)
      ) {
        s.emit('nuevo-mensaje-privado', mensaje);
        enviados.add(s.usuario_id);
      }
    }
    console.log('Emitido nuevo-mensaje-privado SOLO a destinatario y remitente:', mensaje);
  });

  socket.on('mensaje-editado-privado', (mensajeEditado) => {
    io.emit('mensaje-editado-privado', mensajeEditado);
    console.log('Emitido mensaje-editado-privado:', mensajeEditado);
  });

  // Evento para borrar mensaje privado en tiempo real
  socket.on('mensaje-borrado-privado', (data) => {
    io.emit('mensaje-borrado-privado', data);
    console.log('Emitido mensaje-borrado-privado:', data);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
});

module.exports = app;