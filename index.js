require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Middleware de CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
        return res.status(200).json({});
    }
    next();
});

app.get('/', (req, res) => {
    res.send("hola mundo, este es mi backend en express!")
})

const reciboRoutes = require('./src/routes/reciboRoutes');
const responsableRoutes = require ('./src/routes/responsableRoutes');
const apartamentoRoutes = require ('./src/routes/apartamentoRoutes')

app.use('/api/recibos', reciboRoutes);
app.use('/api/responsables', responsableRoutes);
app.use('/api/apartamentos', apartamentoRoutes);

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`)
})
