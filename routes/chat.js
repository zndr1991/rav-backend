const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db-postgres');

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

// Obtener todos los mensajes grupales
router.get('/group', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, usuario_id, nombre_usuario, texto, fecha, editado, fecha_edicion, texto_original FROM mensajes ORDER BY fecha ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes: ' + err.message });
  }
});

// Enviar mensaje grupal
router.post('/group', verifyToken, async (req, res) => {
  const { usuario_id, nombre_usuario, texto } = req.body;
  if (!usuario_id || !nombre_usuario || !texto) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO mensajes (usuario_id, nombre_usuario, texto, fecha, editado) VALUES ($1, $2, $3, $4, FALSE) RETURNING *`,
      [usuario_id, nombre_usuario, texto, new Date()]
    );
    const nuevoMensaje = result.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.emit('nuevo-mensaje', nuevoMensaje);
    }

    res.status(201).json(nuevoMensaje);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje: ' + err.message });
  }
});

// Borrar mensaje por ID
router.delete('/group/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM mensajes WHERE id = $1', [mensajeId]);
    const mensaje = result.rows[0];
    if (!mensaje) return res.status(404).json({ error: 'Mensaje no encontrado.' });

    // Permisos: supervisor puede borrar cualquiera, usuario solo el suyo
    if (
      req.usuario.rol !== 'supervisor' &&
      mensaje.usuario_id !== req.usuario.id
    ) {
      return res.status(403).json({ error: 'No tienes permiso para borrar este mensaje.' });
    }

    await db.query('DELETE FROM mensajes WHERE id = $1', [mensajeId]);

    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-borrado', Number(mensajeId));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al borrar el mensaje: ' + err.message });
  }
});

// Editar mensaje por ID
router.put('/group/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: 'Texto requerido.' });

  try {
    const result = await db.query('SELECT * FROM mensajes WHERE id = $1', [mensajeId]);
    const mensaje = result.rows[0];
    if (!mensaje) return res.status(404).json({ error: 'Mensaje no encontrado.' });

    // Permisos: supervisor solo edita los suyos, usuario solo el suyo
    if (mensaje.usuario_id !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permiso para editar este mensaje.' });
    }

    const fechaEdicion = new Date();
    await db.query(
      'UPDATE mensajes SET texto = $1, editado = TRUE, fecha_edicion = $2, texto_original = $3 WHERE id = $4',
      [texto, fechaEdicion, mensaje.texto, mensajeId]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-editado', {
        id: Number(mensajeId),
        texto,
        editado: true,
        fecha_edicion: fechaEdicion,
        texto_original: mensaje.texto
      });
    }

    res.json({
      ok: true,
      fecha_edicion: fechaEdicion,
      texto_original: mensaje.texto
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al editar el mensaje: ' + err.message });
  }
});

module.exports = router;