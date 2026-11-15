const express = require ('express');
const router = express.Router();
const responsableController = require("../controllers/responsableController");

router.get('/', responsableController.consultarResponsables);
router.post ('/crear', responsableController.crearResponsable);
router.put ('/actualizar', responsableController.editarResponsable);
router.delete('/borrar', responsableController.borrarResponsable)

module.exports = router;