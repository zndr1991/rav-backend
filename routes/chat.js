const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db-postgres');

// Middleware de autenticación JWT
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta';

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token.replace('Bearer ', ''), JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ error: 'Token no válido' });
    req.usuario = usuario;
    next();
  });
}

// Obtener todos los mensajes del chat grupal (requiere autenticación)
router.get('/group', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, usuario_id, nombre_usuario, texto, fecha FROM mensajes ORDER BY fecha ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes: ' + err.message });
  }
});

// Enviar un mensaje al chat grupal (requiere autenticación)
router.post('/group', verifyToken, async (req, res) => {
  const { usuario_id, nombre_usuario, texto } = req.body;
  if (!usuario_id || !nombre_usuario || !texto) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO mensajes (usuario_id, nombre_usuario, texto, fecha) VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuario_id, nombre_usuario, texto, new Date()]
    );
    const nuevoMensaje = result.rows[0];

    // Emitir el mensaje a todos los clientes conectados con Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('nuevo-mensaje', nuevoMensaje);
    }

    res.status(201).json(nuevoMensaje);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje: ' + err.message });
  }
});

// Obtener cantidad de mensajes grupales sin leer para un usuario (NO cuenta los propios)
router.get('/group/unread/:usuario_id', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    // Busca la última visita del usuario al chat grupal
    const userResult = await db.query('SELECT ultima_visita_grupal FROM usuarios WHERE id = $1', [usuario_id]);
    const ultimaVisita = userResult.rows[0]?.ultima_visita_grupal || new Date(0);

    // Solo cuenta mensajes grupales que NO sean del propio usuario
    const result = await db.query(
      `SELECT COUNT(*) FROM mensajes WHERE fecha > $1 AND usuario_id <> $2`,
      [ultimaVisita, usuario_id]
    );
    res.json({ sin_leer: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes sin leer: ' + err.message });
  }
});

// Marcar como leídos (actualizar fecha de última visita)
router.post('/group/visit', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.body.usuario_id;
    await db.query('UPDATE usuarios SET ultima_visita_grupal = $1 WHERE id = $2', [new Date(), usuario_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la última visita: ' + err.message });
  }
});

module.exports = router;