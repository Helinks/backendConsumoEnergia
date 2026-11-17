const express = require('express');
const router = express.Router();
const reciboController = require ('../controllers/reciboController');
const consumoController = require ('../controllers/consumoController')

router.get('/', reciboController.consultarRecibos);
router.get('/:id', reciboController.consultarReciboPorId);
router.get('/consumos/:id', reciboController.consultarConsumosDeRecibo);

router.post ('/crear/', reciboController.crearRecibo, consumoController.crearConsumo);

router.put(['/editar/:id', '/editar'], reciboController.editarRecibo);
router.put(['/editar-consumo/:id', '/editar-consumo'], reciboController.editarConsumo);

router.delete(['/borrar/:id', '/borrar'], reciboController.borrarRecibo);

module.exports = router;
