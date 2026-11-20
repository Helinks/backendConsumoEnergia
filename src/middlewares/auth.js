/**
 * Middleware para validar la API Key en las peticiones entrantes.
 * Permite pasar las peticiones OPTIONS (CORS preflight).
 * Acepta la clave tanto en el header 'x-api-key' como en 'Authorization: Bearer <clave>'.
 */
const apiKeyMiddleware = (req, res, next) => {
    // Las peticiones preflight de CORS no llevan encabezados de autorización
    if (req.method === 'OPTIONS') {
        return next();
    }

    const expectedKey = process.env.APP_API_KEY;

    if (!expectedKey) {
        console.error('ERROR CRÍTICO: La variable de entorno APP_API_KEY no está definida en el archivo .env');
        return res.status(500).json({ error: 'Error de configuración en el servidor.' });
    }

    const clientKey = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');

    if (!clientKey || clientKey !== expectedKey) {
        return res.status(401).json({
            error: 'Acceso no autorizado: API Key inválida o no proporcionada.'
        });
    }

    next();
};

module.exports = apiKeyMiddleware;
