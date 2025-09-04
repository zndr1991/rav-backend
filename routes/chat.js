const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db-postgres');
const path = require('path');
const multer = require('multer');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Middleware para múltiples archivos
const uploadMultiple = upload.array('archivos', 10); // hasta 10 archivos por mensaje

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token.replace('Bearer ', ''), JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ error: 'Token no válido' });
    req.usuario = usuario;
    next();
  });
}

// --- CHAT GRUPAL ---

router.get('/group', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, usuario_id, nombre_usuario, texto, archivo_url, fecha, editado, texto_anterior, fecha_editado FROM mensajes ORDER BY fecha ASC`
    );
    // Parsear archivo_url a array para cada mensaje
    const mensajes = result.rows.map(msg => ({
      ...msg,
      archivo_url: msg.archivo_url ? JSON.parse(msg.archivo_url) : []
    }));
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes: ' + err.message });
  }
});

router.post('/group', verifyToken, uploadMultiple, async (req, res) => {
  const { usuario_id, nombre_usuario, texto } = req.body;
  let archivosUrls = [];
  if (req.files && req.files.length > 0) {
    archivosUrls = req.files.map(file => `/uploads/${file.filename}`);
  }
  if (!usuario_id || !nombre_usuario || (!texto && archivosUrls.length === 0)) {
    return res.status(400).json({ error: 'Debes enviar texto, archivos o ambos.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO mensajes (usuario_id, nombre_usuario, texto, archivo_url, fecha, editado, texto_anterior, fecha_editado) VALUES ($1, $2, $3, $4, $5, false, '', null) RETURNING *`,
      [usuario_id, nombre_usuario, texto || '', JSON.stringify(archivosUrls), new Date().toISOString()]
    );
    const nuevoMensaje = result.rows[0];
    // Parsear archivo_url para frontend
    nuevoMensaje.archivo_url = JSON.parse(nuevoMensaje.archivo_url || '[]');

    const io = req.app.get('io');
    if (io) {
      io.emit('nuevo-mensaje', nuevoMensaje);
    }

    res.status(201).json(nuevoMensaje);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje: ' + err.message });
  }
});

router.get('/group/unread/:usuario_id', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const userResult = await db.query('SELECT ultima_visita_grupal FROM usuarios WHERE id = $1', [usuario_id]);
    const ultimaVisita = userResult.rows[0]?.ultima_visita_grupal || new Date(0);

    const result = await db.query(
      `SELECT COUNT(*) FROM mensajes WHERE fecha > $1 AND usuario_id <> $2`,
      [ultimaVisita, usuario_id]
    );
    res.json({ sin_leer: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes sin leer: ' + err.message });
  }
});

router.post('/group/visit', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.body.usuario_id;
    await db.query('UPDATE usuarios SET ultima_visita_grupal = $1 WHERE id = $2', [new Date(), usuario_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la última visita: ' + err.message });
  }
});

// --- Borrar todos los mensajes del chat general y emitir evento en tiempo real ---
router.delete('/group', verifyToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo el supervisor puede borrar el chat.' });
  }
  try {
    await db.query('DELETE FROM mensajes');
    const io = req.app.get('io');
    if (io) {
      io.emit('chat-general-borrado');
      console.log('Emitido chat-general-borrado');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al borrar el chat: ' + err.message });
  }
});

// --- Borrar mensaje individual y emitir evento en tiempo real ---
router.delete('/group/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  try {
    const result = await db.query('SELECT usuario_id FROM mensajes WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado.' });
    }
    const mensaje = result.rows[0];
    if (req.usuario.rol !== 'supervisor' && req.usuario.id !== mensaje.usuario_id) {
      return res.status(403).json({ error: 'No tienes permiso para borrar este mensaje.' });
    }
    await db.query('DELETE FROM mensajes WHERE id = $1', [mensajeId]);
    // Emitir evento de borrado de mensaje individual
    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-borrado', mensajeId);
      console.log('Emitido mensaje-borrado', mensajeId); // LOG para depuración
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al borrar el mensaje: ' + err.message });
  }
});

router.put('/group/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  const { texto } = req.body;
  try {
    const result = await db.query('SELECT usuario_id, texto FROM mensajes WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado.' });
    }
    const mensaje = result.rows[0];
    if (req.usuario.id !== mensaje.usuario_id) {
      return res.status(403).json({ error: 'No tienes permiso para editar este mensaje.' });
    }
    const fechaEditado = new Date();
    await db.query(
      'UPDATE mensajes SET texto = $1, editado = true, texto_anterior = $2, fecha_editado = $3 WHERE id = $4',
      [texto, mensaje.texto, fechaEditado, mensajeId]
    );
    const editado = await db.query(
      'SELECT id, usuario_id, nombre_usuario, texto, fecha, editado, texto_anterior, fecha_editado FROM mensajes WHERE id = $1',
      [mensajeId]
    );
    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-editado', editado.rows[0]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al editar el mensaje: ' + err.message });
  }
});

// --- CHAT PRIVADO ---

router.get('/private', verifyToken, async (req, res) => {
  const { usuario_id, destinatario_id } = req.query;
  if (!usuario_id || !destinatario_id) {
    return res.status(400).json({ error: 'Faltan usuario_id o destinatario_id.' });
  }
  try {
    const result = await db.query(
      `SELECT * FROM mensajes_privados
       WHERE (remitente_id = $1 AND destinatario_id = $2)
          OR (remitente_id = $2 AND destinatario_id = $1)
       ORDER BY fecha ASC`,
      [usuario_id, destinatario_id]
    );
    // Parsear archivo_url como array para cada mensaje, robusto ante null, vacío o malformado
    const mensajes = result.rows.map(msg => {
      let archivos = [];
      if (msg.archivo_url) {
        try {
          archivos = JSON.parse(msg.archivo_url);
          if (!Array.isArray(archivos)) archivos = [];
        } catch {
          archivos = [];
        }
      }
      return {
        ...msg,
        archivo_url: archivos
      };
    });
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes privados: ' + err.message });
  }
});

router.post('/private', verifyToken, uploadMultiple, async (req, res) => {
  const { remitente_id, destinatario_id, texto } = req.body;
  let archivosUrls = [];
  if (req.files && req.files.length > 0) {
    archivosUrls = req.files.map(file => ({
      nombre: file.originalname,
      url: `/uploads/${file.filename}`,
      tipo: file.mimetype
    }));
  }
  if (!remitente_id || !destinatario_id || (!texto && archivosUrls.length === 0)) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }
  try {
    const remitenteRes = await db.query('SELECT nombre, email FROM usuarios WHERE id = $1', [remitente_id]);
    let nombre_remitente = 'Desconocido';
    if (remitenteRes.rows.length > 0) {
      nombre_remitente = remitenteRes.rows[0].nombre || remitenteRes.rows[0].email || 'Desconocido';
    }

    const result = await db.query(
      `INSERT INTO mensajes_privados (remitente_id, destinatario_id, texto, archivo_url, fecha, editado, texto_anterior, fecha_editado, leido)
       VALUES ($1, $2, $3, $4, $5, false, '', null, false) RETURNING *`,
      [remitente_id, destinatario_id, texto || '', JSON.stringify(archivosUrls), new Date().toISOString()]
    );
    const nuevoMensaje = result.rows[0];
    nuevoMensaje.nombre_remitente = nombre_remitente;
    nuevoMensaje.archivo_url = archivosUrls;

    const io = req.app.get('io');
    if (io) {
      io.to(remitente_id.toString()).emit('nuevo-mensaje-privado', nuevoMensaje);
      io.to(destinatario_id.toString()).emit('nuevo-mensaje-privado', nuevoMensaje);
    }

    res.status(201).json(nuevoMensaje);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje privado: ' + err.message });
  }
});

// Ruta para obtener los mensajes privados no leídos por remitente
router.get('/private/unread/:usuario_id', verifyToken, async (req, res) => {
  const usuario_id = req.params.usuario_id;
  try {
    // Busca los mensajes privados no leídos para el usuario actual
    const result = await db.query(
      `SELECT remitente_id, COUNT(*) as cantidad
       FROM mensajes_privados
       WHERE destinatario_id = $1 AND (leido IS NULL OR leido = false)
       GROUP BY remitente_id`,
      [usuario_id]
    );
    // Formatea la respuesta como { noLeidos: { remitenteId: cantidad, ... } }
    const noLeidos = {};
    result.rows.forEach(row => {
      noLeidos[row.remitente_id] = parseInt(row.cantidad, 10);
    });
    res.json({ noLeidos });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes privados no leídos: ' + err.message });
  }
});

router.put('/private/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  const { texto, archivo_url } = req.body;
  try {
    const result = await db.query('SELECT remitente_id, texto, archivo_url FROM mensajes_privados WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensaje privado no encontrado.' });
    }
    const mensaje = result.rows[0];
    if (req.usuario.id !== mensaje.remitente_id) {
      return res.status(403).json({ error: 'No tienes permiso para editar este mensaje privado.' });
    }
    const fechaEditado = new Date();

    // Si solo se envía archivo_url, no modificar texto ni editado
    if (typeof archivo_url !== 'undefined' && typeof texto === 'undefined') {
      await db.query(
        'UPDATE mensajes_privados SET archivo_url = $1 WHERE id = $2',
        [JSON.stringify(archivo_url), mensajeId]
      );
    } else {
      // Si se envía texto y/o archivo_url, actualizar ambos
      await db.query(
        'UPDATE mensajes_privados SET texto = $1, archivo_url = $2, editado = true, texto_anterior = $3, fecha_editado = $4 WHERE id = $5',
        [
          typeof texto !== 'undefined' ? texto : mensaje.texto,
          typeof archivo_url !== 'undefined' ? JSON.stringify(archivo_url) : mensaje.archivo_url,
          mensaje.texto,
          fechaEditado,
          mensajeId
        ]
      );
    }

    const editado = await db.query(
      'SELECT * FROM mensajes_privados WHERE id = $1',
      [mensajeId]
    );
    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-editado-privado', editado.rows[0]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al editar el mensaje privado: ' + err.message });
  }
});

router.delete('/private/:id', verifyToken, async (req, res) => {
  const mensajeId = req.params.id;
  try {
    const result = await db.query('SELECT remitente_id FROM mensajes_privados WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensaje privado no encontrado.' });
    }
    const mensaje = result.rows[0];
    if (req.usuario.id !== mensaje.remitente_id) {
      return res.status(403).json({ error: 'No tienes permiso para borrar este mensaje privado.' });
    }
    await db.query('DELETE FROM mensajes_privados WHERE id = $1', [mensajeId]);
    // Emitir evento por socket.io para borrar en tiempo real en todos los clientes
    const io = req.app.get('io');
    if (io) {
      io.emit('mensaje-borrado-privado', mensajeId);
    }
    console.log('Mensaje borrado correctamente:', mensajeId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al borrar el mensaje privado: ' + err.message });
  }
});

// Marcar mensajes privados como leídos cuando el usuario abre el chat privado
router.post('/private/read', verifyToken, async (req, res) => {
  const { usuario_id, remitente_id } = req.body;
  if (!usuario_id || !remitente_id) {
    return res.status(400).json({ error: 'Faltan usuario_id o remitente_id.' });
  }
  try {
    await db.query(
      `UPDATE mensajes_privados
       SET leido = true
       WHERE destinatario_id = $1 AND remitente_id = $2 AND (leido IS NULL OR leido = false)`,
      [usuario_id, remitente_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar mensajes como leídos: ' + err.message });
  }
});

// Eliminar adjunto de mensaje grupal
router.post('/group/eliminar-adjunto', verifyToken, async (req, res) => {
  const { mensajeId, adjuntoIdx } = req.body;
  try {
    // Obtener mensaje actual
    const result = await db.query('SELECT usuario_id, archivo_url FROM mensajes WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const mensaje = result.rows[0];
    // Solo el autor o el supervisor pueden eliminar adjuntos
    if (req.usuario.rol !== 'supervisor' && req.usuario.id !== mensaje.usuario_id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar adjuntos de este mensaje.' });
    }
    let archivos = JSON.parse(mensaje.archivo_url || '[]');
    if (adjuntoIdx < 0 || adjuntoIdx >= archivos.length) return res.status(400).json({ error: 'Índice inválido' });
    archivos.splice(adjuntoIdx, 1);
    await db.query('UPDATE mensajes SET archivo_url = $1 WHERE id = $2', [JSON.stringify(archivos), mensajeId]);
    // Emitir evento de actualización de adjuntos
    const io = req.app.get('io');
    if (io) {
      io.emit('adjunto-eliminado', { mensajeId, adjuntoIdx });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar adjunto' });
  }
});

// --- Adjuntos para mensajes privados ---

// Subir adjunto a mensaje privado
router.post('/privado/subir-adjunto', verifyToken, multer({ dest: 'uploads/' }).array('archivos'), async (req, res) => {
  const { mensajeId } = req.body;
  try {
    // Obtener mensaje actual
    const result = await db.query('SELECT archivo_url FROM mensajes_privados WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mensaje no encontrado' });
    let archivos = [];
    if (result.rows[0].archivo_url) {
      archivos = JSON.parse(result.rows[0].archivo_url);
    }
    // Agregar nuevos archivos
    req.files.forEach(file => {
      archivos.push({
        nombre: file.originalname,
        url: `/uploads/${file.filename}`,
        tipo: file.mimetype
      });
    });
    await db.query('UPDATE mensajes_privados SET archivo_url = $1 WHERE id = $2', [JSON.stringify(archivos), mensajeId]);
    res.json({ ok: true, archivos });
  } catch (err) {
    res.status(500).json({ error: 'Error al subir adjunto privado' });
  }
});

// Eliminar adjunto de mensaje privado
router.post('/privado/eliminar-adjunto', verifyToken, async (req, res) => {
  const { mensajeId, adjuntoIdx } = req.body;
  try {
    // Incluye destinatario_id en la consulta
    const result = await db.query('SELECT remitente_id, destinatario_id, archivo_url FROM mensajes_privados WHERE id = $1', [mensajeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const mensaje = result.rows[0];
    if (req.usuario.rol !== 'supervisor' && req.usuario.id !== mensaje.remitente_id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar adjuntos de este mensaje.' });
    }
    let archivos = JSON.parse(mensaje.archivo_url || '[]');
    if (adjuntoIdx < 0 || adjuntoIdx >= archivos.length) return res.status(400).json({ error: 'Índice inválido' });
    archivos.splice(adjuntoIdx, 1);
    await db.query('UPDATE mensajes_privados SET archivo_url = $1 WHERE id = $2', [JSON.stringify(archivos), mensajeId]);

    // Emitir evento por socket para tiempo real SOLO a los dos usuarios
    const io = req.app.get('io');
    if (io) {
      // Envía el evento solo al remitente y destinatario
      io.to(mensaje.remitente_id.toString()).emit('adjunto-eliminado-privado', { mensajeId, adjuntoIdx });
      if (mensaje.destinatario_id) {
        io.to(mensaje.destinatario_id.toString()).emit('adjunto-eliminado-privado', { mensajeId, adjuntoIdx });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar adjunto privado' });
  }
});

module.exports = router;