const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db-postgres'); // IMPORTA EL POOL DESDE TU MODULO

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta';

// Middleware de autenticación
function verificarToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token.replace('Bearer ', ''), JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ error: 'Token no válido' });
    req.usuario = usuario;
    next();
  });
}

// Listar usuarios (solo supervisor)
router.get('/', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden ver la lista de usuarios.' });
  }
  try {
    const result = await db.query('SELECT id, nombre, email, rol FROM usuarios ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios: ' + err.message });
  }
});

// Registrar usuario (solo supervisor)
router.post('/register', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden crear usuarios.' });
  }
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !rol) {
    console.error('Faltan datos requeridos:', req.body);
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
      [nombre, email, hashedPassword, rol]
    );
    res.status(201).json({ message: 'Usuario creado', usuario: result.rows[0] });
  } catch (err) {
    console.error('Error interno al registrar usuario:', err);
    res.status(500).json({ error: 'Error interno al registrar usuario.' });
  }
});

// Editar usuario (solo supervisor)
router.put('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden editar usuarios.' });
  }
  const { nombre, email, password, rol } = req.body;
  const userId = parseInt(req.params.id);

  let hashedPassword = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    await db.query(
      `UPDATE usuarios SET 
        nombre = COALESCE($1, nombre), 
        email = COALESCE($2, email), 
        password = COALESCE($3, password), 
        rol = COALESCE($4, rol) 
      WHERE id = $5`,
      [nombre ?? null, email ?? null, hashedPassword ?? null, rol ?? null, userId]
    );
    const actualizado = await db.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [userId]);
    res.json({ message: 'Usuario actualizado', usuario: actualizado.rows[0] });
  } catch (err) {
    console.error('Error en el servidor al editar usuario:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Borrar usuario (solo supervisor)
router.delete('/:id', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'supervisor') {
    return res.status(403).json({ error: 'Solo los supervisores pueden borrar usuarios.' });
  }
  const userId = parseInt(req.params.id);
  try {
    await db.query('DELETE FROM usuarios WHERE id = $1', [userId]);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Error en el servidor al borrar usuario:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Login de usuario
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    console.error('Faltan datos obligatorios:', req.body);
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }
  try {
    const userResult = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    console.log('Resultado consulta usuarios:', userResult.rows);
    const user = userResult.rows[0];
    if (!user) {
      console.error('Usuario NO encontrado:', email);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.error('Contraseña incorrecta para:', email);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const token = jwt.sign(
      {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      },
      JWT_SECRET
    );
    console.log('Login exitoso para:', email);
    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error interno al validar usuario:', error); // <-- Aquí está el console.error
    return res.status(500).json({ error: 'Error interno al validar usuario.' });
  }
});

module.exports = router;