const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'negocio.db'); // Asegúrate que esta ruta coincida con tu base de datos

console.log(`Iniciando migración para soportar chat privado en ${dbPath}...`);
const db = new sqlite3.Database(dbPath);

// Ejecutar las modificaciones en secuencia
db.serialize(() => {
  console.log("Verificando estructura de tabla mensajes...");
  
  // 1. Verificar si ya existe la columna para_usuario
  db.get("PRAGMA table_info(mensajes)", (err, rows) => {
    if (err) {
      console.error("Error al obtener información de la tabla:", err);
      return;
    }
    
    // 2. Intentar agregar columna para_usuario si no existe
    db.run("ALTER TABLE mensajes ADD COLUMN para_usuario INTEGER", (err) => {
      if (err) {
        // Ignorar error si la columna ya existe
        if (err.message.includes('duplicate column name')) {
          console.log("La columna para_usuario ya existe.");
        } else {
          console.error("Error al añadir columna para_usuario:", err.message);
        }
      } else {
        console.log("✅ Columna para_usuario añadida correctamente.");
      }
      
      // 3. Intentar agregar columna leido si no existe
      db.run("ALTER TABLE mensajes ADD COLUMN leido INTEGER DEFAULT 0", (err) => {
        if (err) {
          // Ignorar error si la columna ya existe
          if (err.message.includes('duplicate column name')) {
            console.log("La columna leido ya existe.");
          } else {
            console.error("Error al añadir columna leido:", err.message);
          }
        } else {
          console.log("✅ Columna leido añadida correctamente.");
        }
        
        // 4. Intentar agregar columna archivo_url si no existe
        db.run("ALTER TABLE mensajes ADD COLUMN archivo_url TEXT", (err) => {
          if (err) {
            // Ignorar error si la columna ya existe
            if (err.message.includes('duplicate column name')) {
              console.log("La columna archivo_url ya existe.");
            } else {
              console.error("Error al añadir columna archivo_url:", err.message);
            }
          } else {
            console.log("✅ Columna archivo_url añadida correctamente.");
          }
          
          // 5. Actualizar mensajes existentes: marcarlos como leídos y como generales
          db.run(`UPDATE mensajes SET leido = 1, es_general = 1 WHERE es_general IS NULL OR leido IS NULL`, (err) => {
            if (err) {
              console.error("Error al actualizar mensajes existentes:", err.message);
            } else {
              console.log("✅ Mensajes existentes actualizados correctamente.");
            }
            
            console.log("Migración completada. La base de datos está lista para chat privado.");
            
            // 6. Cerrar la conexión cuando termine todo
            db.close((err) => {
              if (err) {
                console.error("Error al cerrar la base de datos:", err.message);
              } else {
                console.log("Base de datos cerrada correctamente.");
              }
              process.exit(0);
            });
          });
        });
      });
    });
  });
});