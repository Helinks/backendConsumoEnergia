require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Middleware de CORS
// Por defecto se permite CUALQUIER origen ("*") para que casi cualquier
// frontend (local, Vercel, Netlify, etc.) pueda conectarse al backend.
// Si más adelante querés restringirlo, definí la variable de entorno
// CORS_ORIGIN en Render con una lista separada por comas, por ejemplo:
//   CORS_ORIGIN=https://mi-front.vercel.app,http://localhost:4200
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const resolverOrigen = (origin) => {
    // "*" => permitir todos
    if (allowedOrigins.includes('*')) return '*';
    // Peticiones sin Origin (curl, Postman, health checks) no necesitan el header
    if (!origin) return null;
    return allowedOrigins.includes(origin) ? origin : null;
};

app.use((req, res, next) => {
    const allowOrigin = resolverOrigen(req.headers.origin);

    if (allowOrigin) {
        res.header('Access-Control-Allow-Origin', allowOrigin);
    }

    // Necesario para que los caches/CDN no mezclen respuestas de distintos orígenes
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key');
    res.header('Access-Control-Max-Age', '86400');

    // Responder el preflight (OPTIONS) directamente
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.get('/', (req, res) => {
    res.send("hola mundo, este es mi backend en express!")
})

const apiKeyMiddleware = require('./src/middlewares/auth');
const reciboRoutes = require('./src/routes/reciboRoutes');
const responsableRoutes = require ('./src/routes/responsableRoutes');
const apartamentoRoutes = require ('./src/routes/apartamentoRoutes');

// Proteger todas las rutas bajo /api con API Key
app.use('/api', apiKeyMiddleware);

app.use('/api/recibos', reciboRoutes);
app.use('/api/responsables', responsableRoutes);
app.use('/api/apartamentos', apartamentoRoutes);

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`)
})
