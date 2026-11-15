const esProduccion = process.env.NODE_ENV === 'production';

/**
 * Responde un error de base de datos.
 * En desarrollo incluye el código y el mensaje real de MySQL para
 * facilitar el diagnóstico; en producción solo el mensaje genérico.
 */
const responderError = (res, error, mensaje = 'Error interno del servidor.') => {
    console.error(mensaje, error);

    const respuesta = { error: mensaje };

    if (!esProduccion) {
        respuesta.code = error.code;
        respuesta.sqlMessage = error.sqlMessage;
    }

    return res.status(500).json(respuesta);
};

module.exports = { responderError };
