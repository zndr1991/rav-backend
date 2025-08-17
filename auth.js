const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./jwt-config');

// Middleware para verificar el token JWT
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Espera formato "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'No token, acceso denegado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Error verificando token:', err.message);
      return res.status(403).json({ error: 'Token inválido.' });
    }
    req.user = user;
    next();
  });
}

// Solo exportamos la función - JWT_SECRET ahora viene de jwt-config.js
module.exports = verifyToken;