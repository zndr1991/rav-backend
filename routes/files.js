const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db-postgres');
const verifyToken = require('../auth');

const router = express.Router();

// Configuración de multer para guardar archivos en la carpeta /uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Guardar con nombre único: fecha + idusuario + nombreoriginal
    const uniqueSuffix = Date.now() + '-' + req.user.id + path.extname(file.originalname);
    cb(null, uniqueSuffix);
  }
});
const upload = multer({ storage: storage });

// Subir archivo (protegido)
router.post('/upload', verifyToken, upload.single('archivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ningún archivo.' });
  }

  // Registrar en la base de datos
  try {
    await db.query(
      'INSERT INTO archivos (nombre_original, nombre_servidor, usuario_id) VALUES ($1, $2, $3)',
      [req.file.originalname, req.file.filename, req.user.id]
    );
    res.status(201).json({ message: 'Archivo subido correctamente.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al guardar archivo en la base de datos.' });
  }
});

// Listar archivos subidos (de todos)
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.id, a.nombre_original, a.nombre_servidor, a.fecha, u.nombre AS autor
       FROM archivos a
       JOIN usuarios u ON a.usuario_id = u.id
       ORDER BY a.fecha DESC`
    );
    res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener archivos.' });
  }
});

// Descargar archivo (por id)
router.get('/download/:id', verifyToken, async (req, res) => {
  const archivoId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM archivos WHERE id = $1', [archivoId]);
    const file = result.rows[0];
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }
    res.download(path.join(__dirname, '../uploads/', file.nombre_servidor), file.nombre_original);
  } catch (err) {
    return res.status(500).json({ error: 'Error al buscar archivo.' });
  }
});

module.exports = router;