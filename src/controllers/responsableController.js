const pool = require("../config/database");
const { responderError } = require("../utils/dbError");

const consultarResponsables = async (req, res) => {
    const consultarQuery = "SELECT * FROM responsable WHERE idResponsable > 0";

    try {
        const [result] = await pool.query(consultarQuery)
        res.status(200).json({
            message: result
        })
    } catch (error) {
        return responderError(res, error, 'Error al consultar los responsables.');
    }
};

const crearResponsable = async (req, res) => {
    const { nombres } = req.body;
    // En esta pantalla se registran inquilinos (rol 2). Si se envía
    // idRol explícitamente se respeta (1 = Dueño, 2 = Inquilino).
    const idRol = Number(req.body.idRol) || 2;

    if (!nombres) {
        return res.status(400).json({ error: "Faltan datos" })
    }

    const fechaCreacion = new Date();
    const fechaActualizacion = new Date();
    const idEstado = 1;
    const createQuery = 'INSERT INTO responsable(Estado_idEstado,nombres,fechaCreacion,fechaActualizacion,idRol) VALUES (?,?,?,?,?)';
    const values = [
        idEstado,
        nombres,
        fechaCreacion,
        fechaActualizacion,
        idRol
    ];

    try {
        const [result] = await pool.query(createQuery, values);
        res.status(201).json({
            message: 'Responsable creado correctamente',
            reciboId: result.insertId,
        })
    } catch (error) {
        return responderError(res, error, 'Error al registrar el responsable.');
    }
};

const editarResponsable = async (req, res) => {
    const { nombres, idEstado, id } = req.body;

    if (!id || !nombres || !idEstado) {
        return res.status(400).json({ error: "Faltan datos" })
    }

    const fechaActualizacion = new Date();
    const updateQuery = 'UPDATE responsable SET Estado_idEstado = ?, nombres = ?, fechaActualizacion = ? WHERE idResponsable = ?';
    const values = [
        idEstado,
        nombres,
        fechaActualizacion,
        id
    ];

    try {
        const [result] = await pool.query(updateQuery, values);
        res.status(201).json({
            message: 'Responsable actualizado correctamente',
            reciboId: id,
        })
    } catch (error) {
        return responderError(res, error, 'Error al actualizar el responsable.');
    }
};


module.exports = {
    consultarResponsables,
    crearResponsable,
    editarResponsable,
};
