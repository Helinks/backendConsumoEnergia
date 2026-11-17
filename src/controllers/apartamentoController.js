const pool = require("../config/database")
const { responderError } = require("../utils/dbError")

const consultarApartamentos = async (req,res) =>{
    const consultarQuery = "SELECT * FROM apartamento a INNER JOIN responsable r ON a.Responsable_idResponsable = r.idResponsable WHERE (a.borrado = 0 OR a.borrado IS NULL) ORDER BY a.idApartamento ASC";

    try{
        const [result]= await pool.query(consultarQuery);
        res.status(200).json({
            message: result
        })
    }catch(error){
        return responderError(res, error, 'Error al consultar los apartamentos.');
    }
};
const consultarApartamentosSinResponsable = async (req,res) =>{
    const consultarQuery = `
        SELECT a.idApartamento, a.descripcion, a.Responsable_idResponsable,
               r.idResponsable, r.nombres, r.idRol, r.Estado_idEstado,
               r.nombres AS responsable_nombre,
            (SELECT c.kw FROM consumo c
             JOIN recibo r2 ON c.Recibo_idRecibo = r2.idRecibo
             WHERE c.Apartamento_idApartamento = a.idApartamento
               AND (r2.borrado = 0 OR r2.borrado IS NULL)
             ORDER BY c.Recibo_idRecibo DESC
             LIMIT 1) AS lecturaAnterior
        FROM apartamento a
        INNER JOIN responsable r ON a.Responsable_idResponsable = r.idResponsable
        WHERE a.Responsable_idResponsable > 0
          AND (a.borrado = 0 OR a.borrado IS NULL)
        ORDER BY a.idApartamento ASC
    `;

    try{
        const [result]= await pool.query(consultarQuery);
        res.status(200).json({
            message: result
        })
    }catch(error){
        return responderError(res, error, 'Error al consultar los apartamentos para el cálculo.');
    }
};

const crearApartamento = async (req, res) => {
    const { idResponsable, descripcion} = req.body;

    if (!descripcion ) {
        return res.status(400).json({ error: 'Faltan datos requeridos.' });
    }


    const fechaCreacion = new Date();
    const fechaActualizacion = new Date();
    const insertQuery = 'INSERT INTO apartamento(Responsable_idResponsable, descripcion, fechaCreacion, fechaActualizacion, borrado) VALUES (?,?,?,?,0); ';

    const values = [
        idResponsable,
        descripcion,
        fechaCreacion,
        fechaActualizacion
    ];

    try {
        const [result] = await pool.query(insertQuery, values);

        res.status(201).json({
            message: 'Apartamento registrado correctamente',
            reciboId: result.insertId
        })
    } catch (error) {
        return responderError(res, error, 'Error al registrar el apartamento.');
    }
};

const editarApartamento = async (req, res) => {
    const { idResponsable, descripcion, id} = req.body;

    if ( !descripcion || !id ) {
        return res.status(400).json({ error: 'Faltan datos requeridos.' });
    }


    const fechaActualizacion = new Date();
    const insertQuery = 'UPDATE apartamento SET Responsable_idResponsable = ?, descripcion= ?, fechaActualizacion = ? WHERE idApartamento = ?';

    const values = [
        idResponsable,
        descripcion,
        fechaActualizacion,
        id
    ];

    try {
        const [result] = await pool.query(insertQuery, values);

        res.status(201).json({
            message: 'Apartamento actualizado correctamente',
            reciboId: id
        })
    } catch (error) {
        return responderError(res, error, 'Error al actualizar el apartamento.');
    }
};

const borrarApartamento = async (req, res) => {
    const id = req.params.id || req.body.id;

    if(!id){
        return res.status(400).json({error: "Faltan datos"})
    }
    const fechaActualizacion = new Date();
    const updateQuery = 'UPDATE apartamento SET borrado = 1, fechaActualizacion = ? WHERE idApartamento = ?';
    const values = [
        fechaActualizacion,
        id,
    ];
    try {
        const [result] = await pool.query(updateQuery, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Apartamento no encontrado.' });
        }
        res.status(200).json({
            message: 'Apartamento eliminado correctamente',
            reciboId: id
        });
    } catch (error) {
        return responderError(res, error, 'Error al borrar el apartamento.');
    }

};

module.exports = {
    consultarApartamentos,
    crearApartamento,
    editarApartamento,
    borrarApartamento,
    consultarApartamentosSinResponsable
};