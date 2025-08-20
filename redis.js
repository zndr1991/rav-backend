// Configuración de Redis para Socket.IO en producción
// Instala las dependencias: npm install @socket.io/redis-adapter redis

const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// Configura los clientes Redis (usa variables de entorno para host/puerto si es necesario)
const pubClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
const subClient = pubClient.duplicate();

pubClient.connect().catch(console.error);
subClient.connect().catch(console.error);

module.exports = { pubClient, subClient, createAdapter };