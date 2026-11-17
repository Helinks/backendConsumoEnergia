const pool = require('../config/database');
const { responderError } = require('../utils/dbError');


const consultarRecibos = async (req, res) => {
    const consultarQuery = "SELECT * FROM recibo WHERE (borrado = 0 OR borrado IS NULL) ORDER BY fechaCreacion DESC";

    try {
        const [result] = await pool.query(consultarQuery);
        res.status(200).json({
            message: result
        })
    } catch (error) {
        return responderError(res, error, 'Error al consultar los recibos.');
    }
}

const crearRecibo = async (req, res, next) => {
    const { kwConsumidos, precioEnergiaConsumida, precioAseo, numeroContador, lecturas } = req.body;

    const numKwConsumidos = Number(kwConsumidos);
    const numPrecioEnergia = Number(precioEnergiaConsumida);
    const numPrecioAseo = Number(precioAseo);

    if (
        isNaN(numKwConsumidos) || numKwConsumidos <= 0 ||
        isNaN(numPrecioEnergia) || numPrecioEnergia < 0 ||
        isNaN(numPrecioAseo) || numPrecioAseo < 0
    ) {
        return res.status(400).json({ error: 'Los valores de kwConsumidos, precioEnergiaConsumida y precioAseo deben ser números válidos y mayores o iguales a 0 (kwConsumidos mayor a 0).' });
    }

    const filasQuery = "SELECT COUNT(*) AS filas FROM apartamento WHERE Responsable_idResponsable > 0 AND (borrado = 0 OR borrado IS NULL)";
    const apartamentosQuery = "SELECT a.idApartamento, a.descripcion, r.idRol, r.idResponsable FROM apartamento a INNER JOIN responsable r ON a.Responsable_idResponsable = r.idResponsable WHERE a.Responsable_idResponsable > 0 AND (a.borrado = 0 OR a.borrado IS NULL) ORDER BY a.idApartamento ASC";
    const contadorAnterior = `
        SELECT c.Apartamento_idApartamento, c.kw
        FROM consumo c
        JOIN recibo r2 ON c.Recibo_idRecibo = r2.idRecibo
        WHERE (r2.borrado = 0 OR r2.borrado IS NULL)
          AND c.Recibo_idRecibo = (
            SELECT MAX(c2.Recibo_idRecibo)
            FROM consumo c2
            JOIN recibo r3 ON c2.Recibo_idRecibo = r3.idRecibo
            WHERE c2.Apartamento_idApartamento = c.Apartamento_idApartamento
              AND (r3.borrado = 0 OR r3.borrado IS NULL)
        )
    `;

    // La conexión se adquiere aquí y se libera en crearConsumo (o en el
    // catch si algo falla antes). Así recibo y consumos se guardan en una
    // sola transacción y no quedan recibos huérfanos.
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(filasQuery);
        const [apartments] = await connection.query(apartamentosQuery);
        const totalFilas = rows[0].filas;

        const [beforeNumber] = await connection.query(contadorAnterior);

        const beforeMap = {};
        beforeNumber.forEach(item => {
            beforeMap[item.Apartamento_idApartamento] = item.kw;
        });

        // Soporte tanto para objeto/mapa de lecturas ({ [idApartamento]: valor }) o arreglo como para numeroContador heredado
        let resolvedContador = [];
        if (lecturas && typeof lecturas === 'object') {
            for (let i = 0; i < totalFilas; i++) {
                const apt = apartments[i];
                if (apt.idRol === 2) {
                    const val = lecturas[apt.idApartamento];
                    if (val === undefined || val === null || val === '' || isNaN(Number(val)) || Number(val) <= 0) {
                        await connection.rollback();
                        connection.release();
                        connection = null;
                        return res.status(400).json({
                            error: `Debe ingresar una lectura válida y mayor a 0 para ${apt.descripcion}.`
                        });
                    }
                    resolvedContador.push(Number(val));
                } else {
                    resolvedContador.push(0);
                }
            }
        } else if (Array.isArray(numeroContador) && numeroContador.length > 0) {
            resolvedContador = numeroContador;
        } else {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({ error: 'Faltan las lecturas de los apartamentos.' });
        }

        let sumaTenantsKw = 0;
        for (let i = 0; i < totalFilas; i++) {
            const apt = apartments[i];
            if (apt.idRol === 2) {
                const lecturaActual = Number(resolvedContador[i]);
                if (isNaN(lecturaActual) || lecturaActual <= 0) {
                    await connection.rollback();
                    connection.release();
                    connection = null;
                    return res.status(400).json({
                        error: `Debe ingresar una lectura válida y mayor a 0 para ${apt.descripcion}.`
                    });
                }
                const lecturaAnterior = beforeMap[apt.idApartamento] ? Number(beforeMap[apt.idApartamento]) : 0;
                if (lecturaActual < lecturaAnterior) {
                    await connection.rollback();
                    connection.release();
                    connection = null;
                    return res.status(400).json({
                        error: `La lectura actual de ${apt.descripcion} (${lecturaActual} KW) no puede ser menor a la lectura anterior (${lecturaAnterior} KW).`
                    });
                }
                sumaTenantsKw += (lecturaActual - lecturaAnterior);
            }
        }

        if (sumaTenantsKw > numKwConsumidos) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({
                error: `La suma del consumo de los inquilinos (${sumaTenantsKw} KW) no puede superar el total de KW consumidos en el recibo general (${numKwConsumidos} KW). Verifique las lecturas de los contadores.`
            });
        }

        const precioTotal = numPrecioAseo + numPrecioEnergia;
        const precioKw = numPrecioEnergia / numKwConsumidos;
        const fechaCreacion = new Date();
        const fechaActualizacion = new Date();

        const insertQuery = 'INSERT INTO recibo(kwConsumidos, precioKw, precioEnergiaConsumida, precioAseo, precioTotal, fechaCreacion, fechaActualizacion, borrado) VALUES (?,?,?,?,?,?,?,0); ';
        const values = [numKwConsumidos, precioKw, numPrecioEnergia, numPrecioAseo, precioTotal, fechaCreacion, fechaActualizacion];

        const [result] = await connection.query(insertQuery, values);
        const reciboId = result.insertId;

        req.reciboData = {
            reciboId,
            numeroContador: resolvedContador,
            totalFilas,
            apartments,
            beforeNumber,
            precioKw,
            precioAseo: numPrecioAseo,
            kwConsumidos: numKwConsumidos,
        };

        // La conexión pasa a ser responsabilidad de crearConsumo.
        req.dbConnection = connection;
        connection = null;
        next();
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error al revertir la transacción del recibo: ', rollbackError);
            }
            connection.release();
        }
        return responderError(res, error, 'Error al registrar el recibo.');
    }
};

const editarRecibo = async (req, res) => {
    const targetId = req.params.id || req.body.id;

    if (!targetId) {
        return res.status(400).json({ error: 'Falta el identificador del recibo.' });
    }

    const { kwConsumidos, precioEnergiaConsumida, precioAseo } = req.body;

    const numKwConsumidos = Number(kwConsumidos);
    const numPrecioEnergia = Number(precioEnergiaConsumida);
    const numPrecioAseo = Number(precioAseo);

    if (
        isNaN(numKwConsumidos) || numKwConsumidos <= 0 ||
        isNaN(numPrecioEnergia) || numPrecioEnergia < 0 ||
        isNaN(numPrecioAseo) || numPrecioAseo < 0
    ) {
        return res.status(400).json({ error: 'Los valores de kwConsumidos, precioEnergiaConsumida y precioAseo deben ser números válidos y mayores o iguales a 0 (kwConsumidos mayor a 0).' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [ultimoRecibo] = await connection.query('SELECT idRecibo FROM recibo WHERE (borrado = 0 OR borrado IS NULL) ORDER BY idRecibo DESC LIMIT 1');
        if (ultimoRecibo.length === 0) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(404).json({ error: 'No se encontraron recibos.' });
        }
        if (Number(targetId) !== Number(ultimoRecibo[0].idRecibo)) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({ error: 'Solo se permite editar el último recibo registrado.' });
        }

        const precioTotal = numPrecioAseo + numPrecioEnergia;
        const fechaActualizacion = new Date();
        const precioKw = numPrecioEnergia / numKwConsumidos;
        const updateQuery = 'UPDATE recibo SET kwConsumidos = ?, precioKw = ?, precioEnergiaConsumida = ?, precioAseo = ?, precioTotal = ?, fechaActualizacion = ? WHERE idRecibo = ?';
        const values = [
            numKwConsumidos,
            precioKw,
            numPrecioEnergia,
            numPrecioAseo,
            precioTotal,
            fechaActualizacion,
            targetId,
        ];

        await connection.query(updateQuery, values);

        // Sincronizar los consumos ya existentes del recibo con el nuevo precioKw y precioAseo
        const [consumosExistentes] = await connection.query(
            `SELECT c.idConsumo, c.Apartamento_idApartamento, c.kw, COALESCE(r.idRol, 2) AS idRol,
                (SELECT c2.kw FROM consumo c2
                 JOIN recibo r3 ON c2.Recibo_idRecibo = r3.idRecibo
                 WHERE c2.Apartamento_idApartamento = c.Apartamento_idApartamento
                   AND c2.Recibo_idRecibo < ?
                   AND (r3.borrado = 0 OR r3.borrado IS NULL)
                 ORDER BY c2.Recibo_idRecibo DESC
                 LIMIT 1) AS lecturaAnterior
             FROM consumo c
             LEFT JOIN apartamento a ON c.Apartamento_idApartamento = a.idApartamento
             LEFT JOIN responsable r ON r.idResponsable = COALESCE(NULLIF(c.idResponsable, 0), a.Responsable_idResponsable)
             WHERE c.Recibo_idRecibo = ?
             ORDER BY c.Apartamento_idApartamento ASC, c.idConsumo ASC`,
            [targetId, targetId]
        );

        if (consumosExistentes.length > 0) {
            const totalFilas = consumosExistentes.length;
            const nuevoAseo = numPrecioAseo / totalFilas;

            let tenantKwSum = 0;
            const tenantsMap = {};
            for (const c of consumosExistentes) {
                if (c.idRol === 2) {
                    const lecturaAnterior = c.lecturaAnterior !== null && c.lecturaAnterior !== undefined ? Number(c.lecturaAnterior) : 0;
                    const lecturaActual = Number(c.kw) || 0;
                    const kwConsumido = Math.max(0, lecturaActual - lecturaAnterior);
                    tenantKwSum += kwConsumido;
                    tenantsMap[c.idConsumo] = { kwConsumido, kwParaDb: lecturaActual };
                }
            }

            if (tenantKwSum > numKwConsumidos) {
                await connection.rollback();
                connection.release();
                connection = null;
                return res.status(400).json({
                    error: `La suma del consumo de los inquilinos (${tenantKwSum} KW) no puede superar el nuevo total de KW consumidos en el recibo general (${numKwConsumidos} KW).`
                });
            }

            const duenosCount = consumosExistentes.filter(c => c.idRol !== 2).length || 1;
            const kwRestante = Math.max(0, numKwConsumidos - tenantKwSum);
            const kwPorDueno = kwRestante / duenosCount;

            const updateConsumoQuery = 'UPDATE consumo SET kw = ?, precioConsumo = ?, precioAseo = ?, precioConsumoFinal = ?, fechaActualizacion = ? WHERE idConsumo = ?';
            for (const c of consumosExistentes) {
                let kwConsumido, kwParaDb;
                if (c.idRol === 2) {
                    kwConsumido = tenantsMap[c.idConsumo].kwConsumido;
                    kwParaDb = tenantsMap[c.idConsumo].kwParaDb;
                } else {
                    kwConsumido = kwPorDueno;
                    kwParaDb = kwConsumido;
                }

                const precioConsumo = precioKw * kwConsumido;
                const precioConsumoFinal = precioConsumo + nuevoAseo;

                await connection.query(updateConsumoQuery, [kwParaDb, precioConsumo, nuevoAseo, precioConsumoFinal, fechaActualizacion, c.idConsumo]);
            }
        }

        await connection.commit();

        res.status(200).json({
            message: 'Recibo actualizado correctamente',
            reciboId: targetId
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error al revertir la transacción del recibo editado: ', rollbackError);
            }
        }
        return responderError(res, error, 'Error al actualizar el recibo.');
    } finally {
        if (connection) {
            connection.release();
        }
    }

};

const editarConsumo = async (req, res) => {
    const targetId = req.params.id || req.body.id;

    if (!targetId) {
        return res.status(400).json({ error: 'Falta el identificador del recibo.' });
    }

    const { kwConsumidos, precioEnergiaConsumida, precioAseo, numeroContador, lecturas } = req.body;

    const numKwConsumidos = Number(kwConsumidos);
    const numPrecioEnergia = Number(precioEnergiaConsumida);
    const numPrecioAseo = Number(precioAseo);

    if (
        isNaN(numKwConsumidos) || numKwConsumidos <= 0 ||
        isNaN(numPrecioEnergia) || numPrecioEnergia < 0 ||
        isNaN(numPrecioAseo) || numPrecioAseo < 0
    ) {
        return res.status(400).json({ error: 'Los valores de kwConsumidos, precioEnergiaConsumida y precioAseo deben ser números válidos y mayores o iguales a 0 (kwConsumidos mayor a 0).' });
    }

    const precioTotal = numPrecioAseo + numPrecioEnergia;
    const precioKw = numPrecioEnergia / numKwConsumidos;
    const fechaActualizacion = new Date();

    const apartamentosQuery = "SELECT a.idApartamento, a.descripcion, r.idRol, r.idResponsable FROM apartamento a INNER JOIN responsable r ON a.Responsable_idResponsable = r.idResponsable WHERE a.Responsable_idResponsable > 0 AND (a.borrado = 0 OR a.borrado IS NULL) ORDER BY a.idApartamento ASC";
    // Lectura del recibo inmediatamente anterior al que se está editando
    // (no la última lectura global). Así se pueden corregir recibos
    // antiguos y también el más reciente sin comparar contra sí mismo.
    const contadorAnterior = `
        SELECT c.Apartamento_idApartamento, c.kw
        FROM consumo c
        JOIN recibo r2 ON c.Recibo_idRecibo = r2.idRecibo
        WHERE (r2.borrado = 0 OR r2.borrado IS NULL)
          AND c.Recibo_idRecibo = (
            SELECT MAX(c2.Recibo_idRecibo)
            FROM consumo c2
            JOIN recibo r3 ON c2.Recibo_idRecibo = r3.idRecibo
            WHERE c2.Apartamento_idApartamento = c.Apartamento_idApartamento
              AND (r3.borrado = 0 OR r3.borrado IS NULL)
              AND c2.Recibo_idRecibo < ?
        )
    `;
    const updateReciboQuery = 'UPDATE recibo SET kwConsumidos = ?, precioKw = ?, precioEnergiaConsumida = ?, precioAseo = ?, precioTotal = ?, fechaActualizacion = ? WHERE idRecibo = ?';
    const reciboValues = [numKwConsumidos, precioKw, numPrecioEnergia, numPrecioAseo, precioTotal, fechaActualizacion, targetId];
    const deleteConsumoQuery = "DELETE FROM consumo WHERE Recibo_idRecibo = ?";
    const insertQuery = "INSERT INTO consumo(Recibo_idRecibo, Apartamento_idApartamento, kw, precioConsumo, precioAseo, precioConsumoFinal, fechaCreacion, fechaActualizacion,idResponsable) VALUES (?,?,?,?,?,?,?,?,?)";

    // La actualización del recibo y el borrado/reinserción de sus consumos
    // se ejecutan en una sola transacción para no dejar datos a medias.
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [ultimoRecibo] = await connection.query('SELECT idRecibo FROM recibo WHERE (borrado = 0 OR borrado IS NULL) ORDER BY idRecibo DESC LIMIT 1');
        if (ultimoRecibo.length === 0) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(404).json({ error: 'No se encontraron recibos.' });
        }
        if (Number(targetId) !== Number(ultimoRecibo[0].idRecibo)) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({ error: 'Solo se permite editar el último recibo registrado.' });
        }

        const consumosExistentesQuery = `
            SELECT c.idConsumo, c.Apartamento_idApartamento AS idApartamento, c.idResponsable, c.fechaCreacion,
                   COALESCE(a.descripcion, CONCAT('Apartamento ', c.Apartamento_idApartamento)) AS descripcion,
                   COALESCE(r.idRol, 2) AS idRol
            FROM consumo c
            LEFT JOIN apartamento a ON c.Apartamento_idApartamento = a.idApartamento
            LEFT JOIN responsable r ON r.idResponsable = COALESCE(NULLIF(c.idResponsable, 0), a.Responsable_idResponsable)
            WHERE c.Recibo_idRecibo = ?
            ORDER BY c.Apartamento_idApartamento ASC, c.idConsumo ASC
        `;
        const [existingConsumos] = await connection.query(consumosExistentesQuery, [targetId]);
        const apartments = existingConsumos.length > 0 ? existingConsumos : (await connection.query(apartamentosQuery))[0];
        const totalFilas = apartments.length;
        const [beforeNumber] = await connection.query(contadorAnterior, [targetId]);

        const beforeMap = {};
        if (beforeNumber) {
            beforeNumber.forEach(item => {
                beforeMap[item.Apartamento_idApartamento] = item.kw;
            });
        }

        let resolvedContador = [];
        if (lecturas && typeof lecturas === 'object') {
            for (let i = 0; i < totalFilas; i++) {
                const apt = apartments[i];
                if (apt.idRol === 2) {
                    const val = lecturas[apt.idApartamento] !== undefined ? lecturas[apt.idApartamento] : (lecturas[apt.idConsumo] !== undefined ? lecturas[apt.idConsumo] : undefined);
                    if (val === undefined || val === null || val === '' || isNaN(Number(val)) || Number(val) <= 0) {
                        await connection.rollback();
                        return res.status(400).json({
                            error: `Debe ingresar una lectura válida y mayor a 0 para ${apt.descripcion}.`
                        });
                    }
                    resolvedContador.push(Number(val));
                } else {
                    resolvedContador.push(0);
                }
            }
        } else if (Array.isArray(numeroContador) && numeroContador.length > 0) {
            resolvedContador = numeroContador;
        } else {
            await connection.rollback();
            return res.status(400).json({ error: 'Faltan las lecturas de los apartamentos.' });
        }

        for (let i = 0; i < totalFilas; i++) {
            if (apartments[i].idRol === 2) {
                const lecturaActual = Number(resolvedContador[i]);
                if (isNaN(lecturaActual) || lecturaActual <= 0) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Debe ingresar una lectura válida y mayor a 0 para ${apartments[i].descripcion}.`
                    });
                }
                const lecturaAnterior = beforeMap[apartments[i].idApartamento] ? Number(beforeMap[apartments[i].idApartamento]) : 0;
                if (lecturaActual < lecturaAnterior) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `La lectura actual de ${apartments[i].descripcion} (${lecturaActual} KW) no puede ser menor a la lectura anterior (${lecturaAnterior} KW).`
                    });
                }
            }
        }

        await connection.query(updateReciboQuery, reciboValues);

        let tenantKwSum = 0;
        const tenantData = [];
        for (let i = 0; i < totalFilas; i++) {
            if (apartments[i].idRol === 2) {
                const lecturaAnterior = beforeMap[apartments[i].idApartamento] ? Number(beforeMap[apartments[i].idApartamento]) : 0;
                const lecturaActual = Number(resolvedContador[i]);
                const kwConsumido = lecturaActual - lecturaAnterior;
                tenantKwSum += kwConsumido;
                tenantData.push({ idx: i, kwConsumido, lecturaActual });
            }
        }

        if (tenantKwSum > numKwConsumidos) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({
                error: `La suma del consumo de los inquilinos (${tenantKwSum} KW) no puede superar el total de KW consumidos en el recibo general (${numKwConsumidos} KW). Verifique las lecturas de los contadores.`
            });
        }

        await connection.query(deleteConsumoQuery, [targetId]);

        const duenosCount = apartments.filter(a => a.idRol !== 2).length || 1;
        const kwRestante = Math.max(0, numKwConsumidos - tenantKwSum);
        const kwPorDueno = kwRestante / duenosCount;

        const insertPromises = [];
        let tenantIdx = 0;
        for (let i = 0; i < totalFilas; i++) {
            const apt = apartments[i];
            let kwConsumido, kwParaDb;

            if (apt.idRol === 2) {
                const t = tenantData[tenantIdx++];
                kwConsumido = t.kwConsumido;
                kwParaDb = t.lecturaActual;
            } else {
                kwConsumido = kwPorDueno;
                kwParaDb = kwConsumido;
            }

            const precioConsumo = precioKw * kwConsumido;
            const aseo = numPrecioAseo / totalFilas;
            const precioFinal = precioConsumo + aseo;
            const now = new Date();
            const fechaCreacionOriginal = apt.fechaCreacion ? new Date(apt.fechaCreacion) : now;

            const values = [targetId, apt.idApartamento, kwParaDb, precioConsumo, aseo, precioFinal, fechaCreacionOriginal, now, apt.idResponsable];
            insertPromises.push(connection.query(insertQuery, values));
        }

        await Promise.all(insertPromises);

        await connection.commit();

        res.status(200).json({
            message: 'Consumo actualizado correctamente',
            reciboId: targetId
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error al revertir la transacción del consumo editado: ', rollbackError);
            }
        }
        return responderError(res, error, 'Error al actualizar el consumo.');
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const borrarRecibo = async (req, res) => {
    const targetId = req.params.id || req.body.id;

    if (!targetId) {
        return res.status(400).json({ error: 'Falta el identificador del recibo.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [reciboExiste] = await connection.query('SELECT idRecibo FROM recibo WHERE idRecibo = ? AND (borrado = 0 OR borrado IS NULL)', [targetId]);
        if (reciboExiste.length === 0) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(404).json({ error: 'Recibo no encontrado.' });
        }

        const [ultimoRecibo] = await connection.query('SELECT idRecibo FROM recibo WHERE (borrado = 0 OR borrado IS NULL) ORDER BY idRecibo DESC LIMIT 1');
        if (ultimoRecibo.length > 0 && Number(targetId) !== Number(ultimoRecibo[0].idRecibo)) {
            await connection.rollback();
            connection.release();
            connection = null;
            return res.status(400).json({ error: 'Solo se permite eliminar el último recibo registrado para no romper el historial de lecturas.' });
        }

        const fechaActualizacion = new Date();
        await connection.query('UPDATE recibo SET borrado = 1, fechaActualizacion = ? WHERE idRecibo = ?', [fechaActualizacion, targetId]);

        await connection.commit();

        res.status(200).json({
            message: 'Recibo eliminado correctamente',
            reciboId: targetId
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error al revertir eliminación del recibo:', rollbackError);
            }
        }
        return responderError(res, error, 'Error al borrar el recibo.');
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const consultarReciboPorId = async (req, res) => {
    const { id } = req.params;
    const query = "SELECT * FROM recibo WHERE idRecibo = ? AND (borrado = 0 OR borrado IS NULL)";

    try {
        const [result] = await pool.query(query, [id]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Recibo no encontrado.' });
        }
        res.status(200).json({
            message: result[0]
        });
    } catch (error) {
        return responderError(res, error, 'Error al consultar el recibo.');
    }
};

const consultarConsumosDeRecibo = async (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT c.*, 
            COALESCE(a.descripcion, CONCAT('Apartamento ', c.Apartamento_idApartamento)) AS apartamento_descripcion, 
            r.idRol, 
            r.nombres AS responsable_nombre,
            (SELECT c2.kw FROM consumo c2
             JOIN recibo r3 ON c2.Recibo_idRecibo = r3.idRecibo
             WHERE c2.Apartamento_idApartamento = c.Apartamento_idApartamento
               AND c2.Recibo_idRecibo < c.Recibo_idRecibo
               AND (r3.borrado = 0 OR r3.borrado IS NULL)
             ORDER BY c2.Recibo_idRecibo DESC
             LIMIT 1) AS lecturaAnterior,
            rec.precioKw,
            rec.precioAseo AS recibo_precioAseo,
            rec.precioEnergiaConsumida AS recibo_precioEnergiaConsumida,
            rec.precioTotal AS recibo_precioTotal,
            rec.kwConsumidos AS recibo_kwConsumidos
        FROM consumo c 
        JOIN recibo rec ON c.Recibo_idRecibo = rec.idRecibo AND (rec.borrado = 0 OR rec.borrado IS NULL)
        LEFT JOIN apartamento a ON c.Apartamento_idApartamento = a.idApartamento 
        LEFT JOIN responsable r ON r.idResponsable = COALESCE(NULLIF(c.idResponsable, 0), a.Responsable_idResponsable)
        WHERE c.Recibo_idRecibo = ?
        ORDER BY c.idConsumo ASC
    `;

    try {
        const [result] = await pool.query(query, [id]);

        let totalConsumo = 0;
        let totalAseo = 0;
        let totalFinal = 0;

        const consumosCalculados = result.map(c => {
            const precioKw = Number(c.precioKw) || 0;
            const precioConsumo = Number(c.precioConsumo) || 0;
            const precioAseo = Number(c.precioAseo) || 0;
            const precioConsumoFinal = Number(c.precioConsumoFinal) || 0;

            totalConsumo += precioConsumo;
            totalAseo += precioAseo;
            totalFinal += precioConsumoFinal;

            // Para inquilinos (rol 2), c.kw es la lectura del medidor; kwConsumidos es la diferencia con la lectura anterior
            // o precioConsumo / precioKw si se calcula por costo.
            // Para dueños (rol 1), c.kw ya es el kw neto asignado.
            let kwConsumidos;
            if (c.idRol === 2) {
                const lecturaActual = Number(c.kw) || 0;
                const lecturaAnterior = c.lecturaAnterior !== null && c.lecturaAnterior !== undefined ? Number(c.lecturaAnterior) : 0;
                kwConsumidos = lecturaActual >= lecturaAnterior ? lecturaActual - lecturaAnterior : (precioKw > 0 ? (precioConsumo / precioKw) : 0);
            } else {
                kwConsumidos = Number(c.kw) || 0;
            }

            return {
                ...c,
                kwConsumidos: Number(kwConsumidos.toFixed(2)),
                kwLectura: c.idRol === 2 ? Number(c.kw) : null,
                precioConsumo,
                precioAseo,
                precioConsumoFinal
            };
        });

        res.status(200).json({
            message: consumosCalculados,
            totales: {
                totalConsumo: Number(totalConsumo.toFixed(2)),
                totalAseo: Number(totalAseo.toFixed(2)),
                totalFinal: Number(totalFinal.toFixed(2))
            }
        });
    } catch (error) {
        return responderError(res, error, 'Error al consultar los consumos del recibo.');
    }
};

module.exports = {
    crearRecibo,
    editarRecibo,
    editarConsumo,
    borrarRecibo,
    consultarRecibos,
    consultarReciboPorId,
    consultarConsumosDeRecibo,
}
