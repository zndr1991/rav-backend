const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const SECRET_KEY = 'clave_secreta_super_segura'; // Cámbiala por una propia

// Conexión a Neon (nuevo link)
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

// Login: genera y devuelve token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE email = $1 AND password = $2',
      [email, password]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const usuario = result.rows[0];
    const token = jwt.sign(usuario, SECRET_KEY, { expiresIn: '8h' });
    res.json({ token, usuario });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Crear usuario protegido (solo supervisor)
router.post('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden crear usuarios.' });
  }
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
      [nombre, email, password, rol]
    );
    res.status(201).json({ message: 'Usuario creado', usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Editar usuario protegido (solo supervisor)
router.put('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden editar usuarios.' });
  }
  const { nombre, email, password, rol } = req.body;
  const userId = parseInt(req.params.id);

  // Asegura que los campos sean null si no fueron enviados
  const nombreValue = nombre ?? null;
  const emailValue = email ?? null;
  const passwordValue = password ?? null;
  const rolValue = rol ?? null;

  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    await pool.query(
      `UPDATE usuarios SET 
        nombre = COALESCE($1, nombre), 
        email = COALESCE($2, email), 
        password = COALESCE($3, password), 
        rol = COALESCE($4, rol) 
      WHERE id = $5`,
      [nombreValue, emailValue, passwordValue, rolValue, userId]
    );
    const actualizado = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [userId]);
    res.json({ message: 'Usuario actualizado', usuario: actualizado.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Borrar usuario protegido (solo supervisor)
router.delete('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden borrar usuarios.' });
  }
  const userId = parseInt(req.params.id);
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [userId]);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Listar usuarios protegido (solo supervisor)
router.get('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden ver la lista de usuarios.' });
  }
  try {
    const result = await pool.query('SELECT id, nombre, email, rol FROM usuarios');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;