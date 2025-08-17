const db = require('./db');

// Mostrar estructura de la tabla usuarios
db.all("PRAGMA table_info(usuarios)", [], (err, rows) => {
  if (err) {
    console.error("Error al obtener estructura:", err);
  } else {
    console.log("Estructura de tabla 'usuarios':");
    console.log(rows);
  }
  
  // También obtener algunos datos para ver qué contienen
  db.all("SELECT * FROM usuarios LIMIT 3", [], (err, users) => {
    if (err) {
      console.error("Error al consultar usuarios:", err);
    } else {
      console.log("\nDatos de ejemplo (primeros 3 usuarios):");
      console.log(users);
    }
    
    // Ver qué código está tratando de acceder a la columna 'usuario'
    console.log("\nComprobando consultas que contienen 'usuario':");
    const fs = require('fs');
    const { exec } = require('child_process');
    
    // Buscar en los archivos la cadena 'usuario'
    exec("grep -r 'usuario' --include='*.js' .", (err, stdout) => {
      if (err) {
        console.log("Error al buscar en archivos:", err);
      } else {
        console.log(stdout);
      }
      
      process.exit(0);
    });
  });
});