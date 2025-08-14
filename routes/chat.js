const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const router = express.Router();

const SECRET_KEY = 'clave_secreta_super_segura';

// Conexión a Neon
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Giux1LytnQ6B@ep-frosty-paper-ae54fzuj-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

// Middleware para verificar token
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, SECRET_KEY, (err, usuario) => {
    if (err) return res.status(403).json({ error: 'Token no válido' });
    req.usuario = usuario;
    next();
  });
}

// Enviar mensaje al chat general
router.post('/', verificarToken, async (req, res) => {
  const { texto } = req.body;
  if (!texto) {
    return res.status(400).json({ error: 'Falta el texto del mensaje' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO mensajes (usuario_id, nombre_usuario, texto) VALUES ($1, $2, $3) RETURNING *',
      [req.usuario.id, req.usuario.nombre, texto]
    );
    res.status(201).json({ message: 'Mensaje enviado', mensaje: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Obtener todos los mensajes del chat general
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, usuario_id, nombre_usuario, texto, fecha FROM mensajes ORDER BY fecha ASC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;