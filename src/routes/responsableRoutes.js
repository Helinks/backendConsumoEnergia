const express = require ('express');
const router = express.Router();
const responsableController = require("../controllers/responsableController");

router.get('/', responsableController.consultarResponsables);
router.post ('/crear', responsableController.crearResponsable);
router.put ('/actualizar', responsableController.editarResponsable);

module.exports = router;