// Configuración de Redis para Socket.IO en producción
// Instala las dependencias: npm install socket.io-redis redis

const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// Configura los clientes Redis (puedes usar variables de entorno para host/puerto)
const pubClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
const subClient = pubClient.duplicate();

module.exports = { pubClient, subClient, createAdapter };
