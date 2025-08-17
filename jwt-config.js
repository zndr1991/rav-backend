const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro';

module.exports = {
  JWT_SECRET,
  jwtOptions: {
    // Aumentamos la expiración para desarrollo
    expiresIn: process.env.NODE_ENV === 'production' ? '24h' : '30d', // 30 días en desarrollo
    algorithm: 'HS256'
  },
  refreshTokenOptions: {
    expiresIn: '30d' // Para futura implementación de refresh tokens
  }
};