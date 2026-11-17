const express = require('express');
const router = express.Router();
const apartamentoController = require ('../controllers/apartamentoController');

router.get('/', apartamentoController.consultarApartamentos);
router.get('/calcular', apartamentoController.consultarApartamentosSinResponsable);
router.post('/crear', apartamentoController.crearApartamento);
router.put('/actualizar', apartamentoController.editarApartamento);
router.delete(['/borrar/:id', '/borrar'], apartamentoController.borrarApartamento);

module.exports = router;
