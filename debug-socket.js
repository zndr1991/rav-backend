// Archivo para diagnosticar problemas de Socket.io
// Coloca este archivo en la raíz del proyecto del servidor

const express = require('express');
const router = express.Router();

// Añadir esta ruta a server.js para diagnóstico Socket.io
router.get('/socket-check', (req, res) => {
  try {
    // Obtener información sobre conexiones Socket.io
    const io = req.app.get('io');
    if (!io) {
      return res.status(500).json({ error: 'Socket.io no disponible en req.app' });
    }

    // Contar clientes conectados
    const sockets = io.sockets.sockets;
    const clientesConectados = Array.from(sockets).map(socket => ({
      id: socket[0],
      handshake: {
        address: socket[1].handshake.address,
        time: socket[1].handshake.time,
        auth: socket[1].handshake.auth ? 'presente' : 'ausente',
        query: socket[1].handshake.query
      },
      rooms: Array.from(socket[1].rooms || []),
      user: socket[1].user ? {
        id: socket[1].user.id,
        nombre: socket[1].user.nombre
      } : 'no autenticado'
    }));

    // Emitir un mensaje de prueba a todos los clientes
    const testMessage = {
      id: 'test-' + Date.now(),
      mensaje: '⚡ Mensaje de prueba desde /socket-check',
      fecha: new Date().toISOString(),
      autor: 'Sistema',
      de_usuario: 0
    };
    
    io.emit('debug-message', {
      type: 'system-test',
      content: 'Mensaje de prueba general',
      timestamp: new Date().toISOString()
    });
    
    io.to('chat-general').emit('nuevo-mensaje', testMessage);
    
    res.json({
      socketAvailable: !!io,
      clientesConectados: clientesConectados,
      totalClientes: clientesConectados.length,
      mensajePrueba: testMessage,
      salas: Array.from(io.sockets.adapter.rooms || [])
    });
  } catch (error) {
    console.error('Error en socket-check:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;