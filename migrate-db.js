const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'negocio.db');
const db = new sqlite3.Database(dbPath);

console.log("🔄 Iniciando migración de base de datos...");

// Función para agregar columna de forma segura
function addColumnSafely(tableName, columnName, columnType) {
  return new Promise((resolve, reject) => {
    const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
    
    db.run(query, (err) => {
      if (err) {
        if (err.message.includes("duplicate column") || err.message.includes("already exists")) {
          console.log(`✓ Columna ${columnName} ya existe en ${tableName}`);
          resolve(true);
        } else {
          console.error(`✗ Error agregando ${columnName} a ${tableName}:`, err.message);
          reject(err);
        }
      } else {
        console.log(`✅ Columna ${columnName} agregada exitosamente a ${tableName}`);
        resolve(true);
      }
    });
  });
}

// Ejecutar migraciones
async function migrate() {
  try {
    // Agregar columnas a la tabla mensajes
    await addColumnSafely('mensajes', 'leido', 'BOOLEAN DEFAULT 0');
    await addColumnSafely('mensajes', 'editado', 'BOOLEAN DEFAULT 0');
    await addColumnSafely('mensajes', 'archivo_nombre', 'TEXT');
    await addColumnSafely('mensajes', 'archivo_tipo', 'TEXT');
    await addColumnSafely('mensajes', 'archivo_tamano', 'INTEGER');
    
    // Agregar columna a la tabla archivos si es necesario
    await addColumnSafely('archivos', 'mensaje_id', 'INTEGER');
    
    console.log("\n✅ Migración completada exitosamente");
    
    // Verificar estructura actual
    db.all("PRAGMA table_info(mensajes)", [], (err, rows) => {
      if (!err) {
        console.log("\n📋 Estructura actual de tabla mensajes:");
        rows.forEach(col => {
          console.log(`   - ${col.name} (${col.type})`);
        });
      }
      
      db.close();
      console.log("\n🎉 Base de datos actualizada y lista para usar");
    });
    
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
    db.close();
  }
}

// Ejecutar migración
migrate();