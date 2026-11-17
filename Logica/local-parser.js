/* Analisis local de enunciados con expresiones y patrones en JavaScript. */

function numeroLocal(valor) {
    const texto = String(valor).trim();
    if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(texto)) return Number(texto.replace(/,/g, ''));
    const numero = Number(texto.replace(',', '.'));
    return Number.isFinite(numero) ? numero : null;
}

function normalizarEnunciadoLocal(texto) {
    return normalizarTexto(texto)
        .replace(/\\text\{([^}]*)\}/gi, '$1')
        .replace(/\\(?:mathrm|mathbf)\{([^}]*)\}/gi, '$1')
        .replace(/\bX\s*_\s*\{\s*(\d+)\s*\}/gi, 'X$1')
        .replace(/\bX\s*_\s*(\d+)\b/gi, 'X$1')
        .replace(/\bX\s+(\d+)\b/gi, 'X$1')
        .replace(/[\$\\]/g, '')
        .replace(/\\[,;!]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function escaparNombreLocal(valor) {
    return String(valor).trim().replace(/[<>]/g, '');
}

function seccionTemaLocal(texto, inicioRegex, finRegex) {
    const inicio = inicioRegex.exec(texto);
    if (!inicio) return '';
    const inicioContenido = inicio.index + inicio[0].length;
    const resto = texto.slice(inicioContenido);
    const fin = finRegex.exec(resto);
    return texto.slice(inicio.index, fin ? inicioContenido + fin.index : texto.length);
}

function limpiarExtraccionLocal() {
    window.datosProduccion = null;
    window.datosTransporte = null;
    window.datosAsignacion = null;
    window.datosPert = null;
    window.datosColas = null;
    window.extraccionLocal = null;
    window.enunciadoAnalizado = null;
    Object.keys(FUENTES).forEach(key => delete FUENTES[key]);
    Object.keys(RESULTADOS).forEach(key => delete RESULTADOS[key]);
}

function validarProduccionLocal(raw) {
    if (!raw) return { disponible: false, motivo: 'No se reconocio un modelo completo de produccion.' };
    if (raw.sentido !== 'max') {
        return { disponible: false, motivo: 'El metodo Simplex disponible requiere un objetivo de maximizacion.' };
    }
    if (!raw.productos.length || raw.productos.length > 12
        || raw.productos.some(producto => !producto.nombre || !Number.isFinite(producto.util)
            || !Number.isFinite(producto.min) || producto.min < 0)) {
        return { disponible: false, motivo: 'Faltan productos, coeficientes del objetivo o minimos validos.' };
    }
    if (!raw.restricciones.length || raw.restricciones.length > 60
        || raw.restricciones.some(restriccion => !['<=', '>=', '='].includes(restriccion.tipo)
            || !Number.isFinite(restriccion.b) || restriccion.a.length !== raw.productos.length
            || restriccion.a.some(coeficiente => !Number.isFinite(coeficiente)))) {
        return { disponible: false, motivo: 'Faltan restricciones completas o coeficientes asociados a cada variable.' };
    }
    return {
        disponible: true,
        datos: {
            productos: raw.productos,
            restricciones: raw.restricciones.map(restriccion => ({
                nombre: restriccion.nombre,
                coeficientes: restriccion.a,
                tipo: restriccion.tipo,
                b: restriccion.b
            })),
            sentido: 'max'
        },
        enteras: raw.enteras
    };
}

function validarTransporteLocal(raw) {
    if (!raw) return { disponible: false, motivo: 'No se reconocio un problema de transporte.' };
    if (raw.sentido !== 'min') {
        return { disponible: false, motivo: 'El metodo MODI disponible requiere minimizar costos.' };
    }
    const { origenes, destinos, ofertas, demandas, costos } = raw;
    if (!origenes.length || origenes.length > 20 || !destinos.length || destinos.length > 20
        || ofertas.length !== origenes.length || demandas.length !== destinos.length
        || costos.length !== origenes.length || costos.some(fila => fila.length !== destinos.length)) {
        return { disponible: false, motivo: 'Faltan origenes, destinos o una matriz de costos completa.' };
    }
    if (origenes.some(nombre => !nombre) || destinos.some(nombre => !nombre)
        || ofertas.some(valor => !Number.isFinite(valor) || valor < 0)
        || demandas.some(valor => !Number.isFinite(valor) || valor < 0)
        || costos.some(fila => fila.some(valor => !Number.isFinite(valor) || valor < 0))) {
        return { disponible: false, motivo: 'Las ofertas, demandas y costos deben estar completos y ser no negativos.' };
    }
    return {
        disponible: true,
        datos: {
            origenes, destinos, ofertas, demandas, costos
        }
    };
}

function validarAsignacionLocal(raw) {
    if (!raw) return { disponible: false, motivo: 'No se reconocio una matriz de asignacion completa.' };
    const { filas, columnas, costos } = raw;
    if (!filas.length || filas.length > 20 || !columnas.length || columnas.length > 20
        || costos.length !== filas.length || costos.some(fila => fila.length !== columnas.length)
        || filas.some(nombre => !nombre) || columnas.some(nombre => !nombre)
        || costos.some(fila => fila.some(valor => !Number.isFinite(valor)))) {
        return { disponible: false, motivo: 'Faltan filas, columnas o costos de la matriz de asignacion.' };
    }
    return {
        disponible: true,
        datos: { filas, columnas, costos, unidad: raw.unidad || 'unidades', maximizar: raw.maximizar }
    };
}

function validarPertLocal(actividades, plazo) {
    if (!actividades || !actividades.length || actividades.length > 100) {
        return { disponible: false, motivo: 'No se reconocieron actividades PERT/CPM completas.' };
    }
    const ids = new Set(actividades.map(actividad => actividad.id));
    if (ids.size !== actividades.length
        || actividades.some(actividad => actividad.pred.some(id => !ids.has(id) || id === actividad.id)
            || new Set(actividad.pred).size !== actividad.pred.length
            || (actividad.o !== undefined && (!Number.isFinite(actividad.o) || !Number.isFinite(actividad.m)
                || !Number.isFinite(actividad.p) || actividad.o < 0 || actividad.o > actividad.m || actividad.m > actividad.p))
            || (actividad.dur !== undefined && (!Number.isFinite(actividad.dur) || actividad.dur < 0)))) {
        return { disponible: false, motivo: 'Revisa identificadores y predecesoras, y que las duraciones sean no negativas y las estimaciones cumplan o ≤ m ≤ p.' };
    }
    return { disponible: true, datos: { actividades, plazo: Number.isFinite(plazo) ? plazo : null } };
}

function extraerColasLocal(texto) {
    if (!/\b(?:(?<!-)colas?|lambda|mu|tasa\s+de\s+llegadas?|tasa\s+de\s+servicio|servidores?)\b|[λμ]/i.test(texto)) return null;
    const tasas = (regex) => {
        const hallazgos = [...texto.matchAll(regex)];
        return hallazgos.filter((actual, i) => !hallazgos.slice(0, i).some(anterior =>
            Math.abs(anterior.index - actual.index) < 24));
    };
    const llegadas = tasas(/(?:\blambda\b|\btasa\s+de\s+llegadas?\b|λ)/gi);
    const servicios = tasas(/(?:\bmu\b|\btasa\s+de\s+servicio\b|\bcapacidad\s+de\s+servicio\b|μ)/gi);
    const leerTasa = (coincidencia) => {
        const resto = texto.slice(coincidencia.index + coincidencia[0].length,
            coincidencia.index + coincidencia[0].length + 110);
        const valor = resto.match(/^[^0-9]{0,100}(\d+(?:[.,]\d+)?)/);
        if (!valor) return null;
        const numero = numeroLocal(valor[1]);
        const unidad = /(?:\/|por)\s*(horas?|hrs?|d[ií]as?|semanas?|minutos?|mins?)(?![a-z])/i.exec(resto.slice(valor.index + valor[0].length));
        const unidadNormalizada = unidad
            ? unidad[1].toLowerCase().replace(/s$/, '').replace('hrs', 'hora').replace('hr', 'hora').replace('mins', 'min').replace('minutos', 'min')
            : 'unidad de tiempo';
        return { valor: numero, unidad: unidadNormalizada };
    };

    const serviciosCola = [];
    llegadas.forEach((marca, indice) => {
        const limite = llegadas[indice + 1]?.index ?? texto.length;
        const marcaMu = servicios.find(item => item.index > marca.index && item.index < limite);
        if (!marcaMu) return;
        const tasaLlegada = leerTasa(marca);
        const tasaServicio = leerTasa(marcaMu);
        if (!tasaLlegada || !tasaServicio) return;

        const inicioContexto = Math.max(0, marca.index - 260);
        const siguientesEncabezados = /\b(?:tienda|sucursal|destino|supermercado|cedi|propuesta|situaci[oó]n|caso|escenario)\b/gi;
        siguientesEncabezados.lastIndex = marca.index + marca[0].length;
        const siguienteEncabezado = siguientesEncabezados.exec(texto);
        const finContexto = siguienteEncabezado && siguienteEncabezado.index < limite
            ? siguienteEncabezado.index
            : limite;
        const contexto = texto.slice(inicioContexto, finContexto);
        const contextoPrevio = texto.slice(inicioContexto, marca.index);
        const nombreMatch = [...contextoPrevio.matchAll(/\b(?:tienda|sucursal|destino|supermercado|cedi)\s+(?:de\s+)?([^,;:\n.]{1,45})/gi)].pop();
        const modelos = [...contextoPrevio.matchAll(/\bm\s*\/\s*m\s*\/\s*(\d+)\b/gi)];
        const servidores = [...contexto.matchAll(/(?:\b(?:servidores?|estaciones?|bah[ií]as?|plataformas?)\s*(?:=|:|de|son)?\s*(\d+)\b|(\d+)\s*(?:servidores?|estaciones?|bah[ií]as?|plataformas?)\b|\bc\s*=\s*(\d+)\b)/gi)];
        const contextoCercano = texto.slice(Math.max(0, marca.index - 220), marca.index);
        const etiquetasEscenario = [
            ...contextoCercano.matchAll(/\bsituaci[oó]n\s+actual\b|\bactual\s*\(/gi)
        ].map(match => ({ indice: match.index, tipo: 'actual' }))
            .concat([
                ...contextoCercano.matchAll(/\bpropuesta\s+(?:de\s+)?mejora\b|\bpropuesta\s*\(/gi)
            ].map(match => ({ indice: match.index, tipo: 'propuesta' })))
            .sort((a, b) => b.indice - a.indice);
        const etiquetaCercana = etiquetasEscenario[0];
        const situacionActual = etiquetaCercana?.tipo === 'actual'
            || (!etiquetaCercana && /\bm\s*\/\s*m\s*\/\s*1\b/i.test(contextoCercano));
        const propuestaMejora = etiquetaCercana?.tipo === 'propuesta'
            || (!etiquetaCercana && /\bm\s*\/\s*m\s*\/\s*2\b/i.test(contextoCercano));
        const nombre = propuestaMejora
            ? 'Propuesta de mejora'
            : situacionActual
                ? 'Situación actual'
                : nombreMatch
                    ? nombreMatch[0].trim()
                    : `Servicio ${serviciosCola.length + 1}`;
        const marcaServidor = servidores[servidores.length - 1];
        const c = marcaServidor
            ? Number(marcaServidor[1] || marcaServidor[2] || marcaServidor[3])
            : (modelos.length ? Number(modelos[modelos.length - 1][1]) : null);
        serviciosCola.push({
            nombre,
            lambda: tasaLlegada.valor,
            mu: tasaServicio.valor,
            servidores: c,
            unidad: tasaLlegada.unidad,
            unidadServicio: tasaServicio.unidad,
            fuente: 'enunciado'
        });
    });

    if (!serviciosCola.length) {
        return { disponible: false, motivo: 'Se detectó teoría de colas, pero faltan tasas λ y μ explícitas y asociadas.' };
    }
    if (serviciosCola.length > 20) {
        return { disponible: false, motivo: 'El modelo de colas admite hasta 20 servicios independientes.' };
    }
    if (serviciosCola.some(servicio => !servicio.nombre || !Number.isFinite(servicio.lambda) || servicio.lambda <= 0
        || !Number.isFinite(servicio.mu) || servicio.mu <= 0 || !Number.isInteger(servicio.servidores)
        || servicio.servidores < 1 || servicio.servidores > 20 || servicio.unidad !== servicio.unidadServicio)) {
        return { disponible: false, motivo: 'Cada servicio requiere λ y μ positivas en la misma unidad de tiempo y un número entero de servidores.' };
    }
    const nombres = new Map();
    serviciosCola.forEach(servicio => {
        const clave = servicio.nombre.toLowerCase();
        nombres.set(clave, (nombres.get(clave) || 0) + 1);
    });
    serviciosCola.forEach((servicio, i) => {
        if (nombres.get(servicio.nombre.toLowerCase()) > 1) {
            servicio.nombre = `${servicio.nombre} (${i + 1})`;
        }
    });
    return { disponible: true, datos: serviciosCola };
}

function extraerVariablesLocales(texto) {
    const variables = [];
    const regex = /\bX(\d+)\b/gi;
    let coincidencia;
    while ((coincidencia = regex.exec(texto))) {
        const indice = Number(coincidencia[1]);
        if (!variables.some(variable => variable.indice === indice)) {
            variables.push({ indice, posicion: coincidencia.index, marcador: coincidencia[0] });
        }
    }
    return variables.sort((a, b) => a.indice - b.indice);
}

function nombreVariableLocal(texto, variable) {
    const antes = texto.slice(Math.max(0, variable.posicion - 140), variable.posicion);
    const marcas = [...antes.matchAll(/\b(?:produce|producen|producir|producto|productos|elabora|elaboran|fabricar|fabrica|fabrican|variable)\b/gi)];
    if (!marcas.length) return `X${variable.indice}`;
    let nombre = antes.slice(marcas[marcas.length - 1].index + marcas[marcas.length - 1][0].length);
    nombre = nombre.replace(/(?:representa|denominada|llamada|identificada como)\s*$/i, '')
        .replace(/^\s*(?:de|del|la|el|los|las|un|una)\s+/i, '')
        .replace(/[\s(:,-]+$/, '')
        .replace(/^[\s(:,-]+/, '')
        .trim();
    return escaparNombreLocal(nombre);
}

function coeficientesLinealesLocales(expresion, nVariables) {
    const coeficientes = Array(nVariables).fill(0);
    const regex = /([+-]?)\s*(\d+(?:[.,]\d+)*)?\s*(?:\*|·)?\s*X(\d+)\b/gi;
    let coincidencia, consumido = '';
    while ((coincidencia = regex.exec(expresion))) {
        const indice = Number(coincidencia[3]) - 1;
        if (indice < 0 || indice >= nVariables) return null;
        const magnitud = coincidencia[2] ? numeroLocal(coincidencia[2]) : 1;
        if (magnitud === null) return null;
        coeficientes[indice] += coincidencia[1] === '-' ? -magnitud : magnitud;
        consumido += coincidencia[0];
    }
    if (!consumido || expresion.replace(regex, '').replace(/[+\-*\s]/g, '') !== '') return null;
    return coeficientes;
}

function extraerRestriccionesLocales(texto, variables) {
    const restricciones = [];
    const regex = /((?:[+-]?\s*(?:\d+(?:[.,]\d+)*\s*(?:\*|·)?\s*)?X\d+\s*)+)(<=|>=|≤|≥|=|<|>)(\s*-?\d+(?:[.,]\d+)*)/g;
    let coincidencia;
    while ((coincidencia = regex.exec(texto))) {
        const coeficientes = coeficientesLinealesLocales(coincidencia[1], variables.length);
        const ladoDerecho = numeroLocal(coincidencia[3]);
        if (!coeficientes || ladoDerecho === null) continue;
        const tipo = coincidencia[2] === '<' ? '<=' : (coincidencia[2] === '>' ? '>=' : coincidencia[2]);
        const contexto = texto.slice(Math.max(0, coincidencia.index - 90), coincidencia.index);
        const candidato = contexto.split(/;|\n|\.(?=\s|$)/).pop().trim().slice(-60);
        const nombre = candidato && !/\bX\d+\b|\bZ\s*=|\bmax(?:imize)?\b/i.test(candidato)
            ? candidato
            : `Restriccion ${restricciones.length + 1}`;
        restricciones.push({ nombre: escaparNombreLocal(nombre), a: coeficientes, tipo, b: ladoDerecho });
    }
    return restricciones;
}

function capacidadLocal(texto, unidad) {
    const regex = unidad === 'vol'
        ? /(?:capacidad|disponibilidad|dispone de|total de)[^.;\n]{0,100}?(\d+(?:[.,]\d+)*)\s*(?:m\s*\^?\s*3|metros?\s*c[uú]bicos?)/i
        : /(?:capacidad|disponibilidad|dispone de|disponible)[^.;\n]{0,100}?(\d+(?:[.,]\d+)*)\s*(?:horas?|hrs?|horas?[- ]hombre)/i;
    const coincidencia = regex.exec(texto);
    return coincidencia ? numeroLocal(coincidencia[1]) : null;
}

function extraerProduccionLocal(texto) {
    const marcaInicio = /(?:^|\s)\d+\s*[.)]\s*(?:programaci[oó]n\s+(?:lineal|entera)|producci[oó]n)\b/i.exec(texto)
        || /\b(?:programaci[oó]n\s+lineal|producci[oó]n|maximizar|max(?:imize)?\s+Z|minimizar|min\s+Z)\b/i.exec(texto);
    const textoProduccion = marcaInicio
        ? seccionTemaLocal(texto, new RegExp(marcaInicio[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            /\b(?:problema\s+de\s+)?(?:transporte|distribuci[oó]n|asignaci[oó]n|h[uú]ngaro|PERT|CPM|teor[ií]a\s+de\s+colas?|(?<!-)colas?)\b/i)
        : texto;
    const variables = extraerVariablesLocales(textoProduccion);
    if (!variables.length || variables.length > 12) return null;
    const nombresExplicitos = new Map();
    const etiquetaVariable = /([^;.,:()]{1,50})\(\s*X\s*(\d+)\s*\)/gi;
    let etiqueta;
    while ((etiqueta = etiquetaVariable.exec(textoProduccion))) {
        const nombre = etiqueta[1].replace(/^(?:productos?|variables?)\s*:?\s*/i, '').trim();
        if (nombre) nombresExplicitos.set(Number(etiqueta[2]), escaparNombreLocal(nombre));
    }
    const descripcionVariable = /\b(?:cantidad|unidades?)\s+(?:de\s+)?(?:cajas?\s+de\s+)?([^.;,]{1,50}?)\s+(?:se\s+representa(?:n)?\s+con|se\s+denota(?:n)?\s+por|con)\s*X\s*(\d+)\b/gi;
    while ((etiqueta = descripcionVariable.exec(textoProduccion))) {
        const nombre = etiqueta[1].trim();
        if (nombre && !nombresExplicitos.has(Number(etiqueta[2]))) {
            nombresExplicitos.set(Number(etiqueta[2]), escaparNombreLocal(nombre));
        }
    }
    const productos = variables.map((variable, i) => {
        const siguiente = variables[i + 1];
        const segmento = textoProduccion.slice(variable.posicion, siguiente ? siguiente.posicion : textoProduccion.length);
        const campos = _extraerCampos(segmento);
        const minimo = segmento.match(/(?:m[ií]nim[oa](?:\s+obligatori[oa])?|al menos|por lo menos|no menos de)[^.;,\n]{0,50}?(\d+(?:[.,]\d+)*)/i);
        return {
            nombre: nombresExplicitos.get(variable.indice) || nombreVariableLocal(textoProduccion, variable) || `X${variable.indice}`,
            indice: variable.indice,
            util: campos.util,
            min: minimo ? numeroLocal(minimo[1]) : (campos.min === null ? 0 : campos.min),
            vol: campos.vol,
            horas: campos.horas,
            segmento
        };
    });

    const funcionObjetivo = /\b(?:maximizar|maximiza|max(?:imize)?)\b[^;\n]{0,60}?(?:Z|utilidad|beneficio|ganancia)?\s*(?:=|:)\s*([^;\n]*?)(?=\s+(?:restricciones?|sujeto\s+a|subject\s+to|constraints?)\b|;|\n|\.(?=\s|$)|$)/i.exec(textoProduccion);
    const coefObjetivo = funcionObjetivo
        ? coeficientesLinealesLocales(funcionObjetivo[1], variables.length)
        : null;
    productos.forEach((producto, i) => {
        if (coefObjetivo) producto.util = coefObjetivo[i];
    });
    const restricciones = extraerRestriccionesLocales(textoProduccion, variables);
    if (!restricciones.length) {
        const capVol = capacidadLocal(textoProduccion, 'vol');
        const capHoras = capacidadLocal(textoProduccion, 'horas');
        if (capVol !== null && productos.every(producto => producto.vol !== null)) {
            restricciones.push({ nombre: 'Capacidad volumetrica', a: productos.map(producto => producto.vol), tipo: '<=', b: capVol });
        }
        if (capHoras !== null && productos.every(producto => producto.horas !== null)) {
            restricciones.push({ nombre: 'Disponibilidad de horas', a: productos.map(producto => producto.horas), tipo: '<=', b: capHoras });
        }
    }
    productos.forEach((producto, i) => {
        if (producto.min > 0) {
            const a = Array(variables.length).fill(0);
            a[i] = 1;
            restricciones.push({ nombre: `Minimo ${producto.nombre}`, a, tipo: '>=', b: producto.min });
        }
    });
    const raw = {
        sentido: /\bminimizar\b|\bmin(?:imize)?\s+Z\b/i.test(textoProduccion) && !funcionObjetivo ? 'min' : 'max',
        enteras: /\b(?:enteras?|integer|unidades indivisibles)\b/i.test(textoProduccion),
        productos: productos.map(producto => ({
            nombre: producto.nombre,
            util: producto.util,
            min: producto.min
        })),
        restricciones
    };
    return validarProduccionLocal(raw);
}

function extraerEntidadesCantidadLocal(texto, tipo) {
    const palabra = tipo === 'oferta' ? /or[ií]genes?|plantas?|centros? de (?:abastecimiento|distribuci[oó]n)/i : /destinos?|sucursales?|clientes?|demandas?/i;
    const limite = tipo === 'oferta' ? /destinos?|demandas?|costos?|tarifas?/i : /costos?|tarifas?|desde\s+/i;
    const inicio = palabra.exec(texto);
    if (!inicio) return { nombres: [], valores: [] };
    const contenido = texto.slice(inicio.index + inicio[0].length).replace(/^\s*[:\-]?\s*/, '');
    const fin = limite.exec(contenido);
    const segmento = fin ? contenido.slice(0, fin.index) : contenido;
    const nombres = [], valores = [];
    segmento.split(/[,;\n]|\s+y\s+/i).forEach(parte => {
        const regex = tipo === 'oferta'
            ? /(.+?)\s+(?:con\s+(?:(?:una\s+)?oferta(?:\s+de)?\s*)?|oferta(?:\s+de)?\s*)(\d+(?:[.,]\d+)*)\s*(?:unidades?|tarimas?|cajas?|pallets?|toneladas?|ton|camiones?|viajes?)?/i
            : /(.+?)\s*(?:\(\s*)?(?:con\s+)?(?:una\s+)?demanda(?:\s+de)?\s*(\d+(?:[.,]\d+)*)/i;
        const coincidencia = regex.exec(parte.trim());
        if (!coincidencia) return;
        let nombre = coincidencia[1].replace(/^[^:]*:\s*/, '').replace(/\([^)]*$/, '').trim();
        nombre = nombre.replace(/^(?:y\s+)?(?:los\s+)?(?:destinos?|or[ií]genes?)\s*/i, '').trim();
        const valor = numeroLocal(coincidencia[2]);
        if (!nombre || valor === null || nombres.some(actual => mismoNombre(actual, nombre))) return;
        nombres.push(escaparNombreLocal(nombre));
        valores.push(valor);
    });
    return { nombres, valores };
}

function extraerCostosTransporteLocal(texto, origenes, destinos) {
    const costos = origenes.map(() => Array(destinos.length).fill(null));
    const destinosOrdenados = [...destinos].sort((a, b) => b.length - a.length);
    origenes.forEach((origen, i) => {
        const patron = new RegExp(`desde\\s+${origen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:,-]?`, 'i');
        const inicio = patron.exec(texto);
        if (!inicio) return;
        const siguiente = /\bdesde\s+/ig;
        siguiente.lastIndex = inicio.index + inicio[0].length;
        const otro = siguiente.exec(texto);
        const fila = texto.slice(inicio.index + inicio[0].length, otro ? otro.index : texto.length);
        destinosOrdenados.forEach(destino => {
            const destinoRegex = new RegExp(`(?:Q|\\$)?\\s*(\\d+(?:[.,]\\d+)*)\\s*(?:hacia|a|para)\\s*${destino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\b|\\s*[,.;)]|$)`, 'i');
            const coincidencia = destinoRegex.exec(fila);
            if (coincidencia) {
                const j = destinos.findIndex(nombre => mismoNombre(nombre, destino));
                costos[i][j] = numeroLocal(coincidencia[1]);
            }
        });
    });
    return costos;
}

function extraerTransporteLocal(texto) {
    if (!/\b(?:transporte|distribuci[oó]n|costos?\s+unitarios?|matriz\s+de\s+costos)\b/i.test(texto)) return null;
    const encabezadoTransporte = /(?:^|\s)\d+\s*[.)]\s*(?:problema\s+de\s+)?(?:transporte|distribuci[oó]n)\b/i.exec(texto);
    const inicioTema = encabezadoTransporte
        ? encabezadoTransporte.index
        : texto.search(/\b(?:transporte|distribuci[oó]n|costos?\s+unitarios?|matriz\s+de\s+costos)\b/i);
    const resto = texto.slice(inicioTema);
    const siguienteTema = /\b(?:asignaci[oó]n|h[uú]ngaro|cuadrillas?|tareas?|PERT|CPM|ruta\s+cr[ií]tica|actividades?\s+(?:del\s+)?proyecto|teor[ií]a\s+de\s+colas?|(?<!-)colas?|lambda|mu|tasa\s+de\s+(?:llegadas?|servicio)|servidores?)\b/i.exec(resto);
    const contextoTransporte = siguienteTema ? resto.slice(0, siguienteTema.index) : resto;
    const oferta = extraerEntidadesCantidadLocal(contextoTransporte, 'oferta');
    const demanda = extraerEntidadesCantidadLocal(contextoTransporte, 'demanda');
    let origenes = oferta.nombres;
    let destinos = demanda.nombres;
    const filaRegex = /\bdesde\s+([^:;,\n]+?)\s*:/gi;
    const filasCosto = [...contextoTransporte.matchAll(filaRegex)].map(match => escaparNombreLocal(match[1].trim()));
    if (!origenes.length && filasCosto.length) origenes = filasCosto;
    if (!destinos.length) {
        const destinoDesdeCosto = [];
        const regex = /\d+(?:[.,]\d+)*\s*(?:hacia|a|para)\s+([^,.;\n]+?)(?=,|\s+y\s+|;|\.|$)/gi;
        let match;
        while ((match = regex.exec(contextoTransporte))) {
            const nombre = escaparNombreLocal(match[1].trim());
            if (nombre && !destinoDesdeCosto.some(actual => mismoNombre(actual, nombre))) destinoDesdeCosto.push(nombre);
        }
        destinos = destinoDesdeCosto;
    }
    const costos = extraerCostosTransporteLocal(contextoTransporte, origenes, destinos);
    return validarTransporteLocal({
        sentido: /\bmaximizar\b|\bmax(?:imize)?\s+(?:el\s+)?beneficio/i.test(contextoTransporte) ? 'max' : 'min',
        origenes, destinos,
        ofertas: oferta.valores,
        demandas: demanda.valores,
        costos
    });
}

function extraerAsignacionLocal(texto) {
    if (!/\b(?:asignaci[oó]n|h[uú]ngaro|cuadrillas?|tareas?)\b/i.test(texto)) return null;
    const seccionAsignacion = seccionTemaLocal(texto,
        /\b(?:problema\s+de\s+)?(?:asignaci[oó]n|m[eé]todo\s+h[uú]ngaro|h[uú]ngaro)\b/i,
        /\b(?:programaci[oó]n\s+lineal|producci[oó]n|transporte|distribuci[oó]n|PERT|CPM|teor[ií]a\s+de\s+colas?|(?<!-)colas?)\b/i);
    const contextoAsignacion = seccionAsignacion || texto;
    const regexId = /\b(cuadrilla|persona|trabajador|empleado|operario|equipo)\s+([A-Z]|\d+)\b/gi;
    const marcas = [...contextoAsignacion.matchAll(regexId)];
    if (!marcas.length) return null;
    const filas = [], columnas = [], costos = [];
    marcas.forEach((marca, i) => {
        const fila = `${marca[1]} ${marca[2]}`;
        const bloque = contextoAsignacion.slice(marca.index + marca[0].length, marcas[i + 1]?.index ?? contextoAsignacion.length);
        const entradas = [];
        const regexEntrada = /(\d+(?:[.,]\d+)*)\s*(?:minutos?|mins?|horas?|hrs?)?\s*(?:en|para|a)\s+(?:la\s+)?(ruta|tarea|trabajo|destino)\s+([A-Z]|\d+)(?:\s*\(([^)]*)\))?/gi;
        let coincidencia;
        while ((coincidencia = regexEntrada.exec(bloque))) {
            const id = `${coincidencia[2]} ${coincidencia[3]}`;
            const nombre = escaparNombreLocal(coincidencia[4] ? `${id} (${coincidencia[4]})` : id);
            const valor = numeroLocal(coincidencia[1]);
            if (valor !== null) entradas.push({ nombre, id, valor });
        }
        if (!entradas.length) return;
        filas.push(escaparNombreLocal(fila));
        entradas.forEach(entrada => {
            if (!columnas.some(nombre => mismoNombre(nombre, entrada.id))) columnas.push(entrada.id);
        });
        costos.push(entradas);
    });
    if (!filas.length || !columnas.length) return null;
    const matriz = filas.map((_, i) => columnas.map(columna => {
        const entrada = costos[i].find(valor => mismoNombre(valor.id, columna));
        return entrada ? entrada.valor : null;
    }));
    return validarAsignacionLocal({
        filas,
        columnas,
        costos: matriz,
        maximizar: !!seccionAsignacion && /\bmaximizar\b|\bmayor\s+(?:beneficio|utilidad)\b/i.test(contextoAsignacion),
        unidad: /\bmin(?:utos?)?\b/i.test(contextoAsignacion) ? 'minutos' : 'horas'
    });
}

function extraerPertLocal(texto) {
    if (!/\b(?:PERT|CPM|ruta\s+cr[ií]tica|actividades?\s+(?:del\s+)?proyecto)\b/i.test(texto)) return null;
    const marca = /(?:\bactividad\s+|(?:^|[;,\n:.]\s*)(?:y\s+)?)([A-Z][A-Z0-9_]*)\s*\(([^)]*)\)/gi;
    const hallazgos = [...texto.matchAll(marca)];
    const actividades = hallazgos.map(match => {
        const contenido = match[2];
        const nombreDetectado = contenido.split(/,\s*(?:precedid[ao]s?\s+por|predecesor(?:as?|es)?|duraci[oó]n|o\s*=)|(?:\s+duraci[oó]n|\s+precedid[ao])/i)[0].trim();
        const nombre = /^(?:o|optimista)\s*[:=]/i.test(nombreDetectado) ? '' : nombreDetectado;
        const predecesoras = [];
        const pred = /(?:precedid[ao]s?\s+por|predecesor(?:as?|es)?|despu[eé]s\s+de|depende\s+de)\s+(.+?)(?=,|\bduraci[oó]n|\s*$)/i.exec(contenido);
        if (pred) predecesoras.push(...(pred[1].match(/\b[A-Z][A-Z0-9_]*\b/gi) || [])
            .map(id => id.toUpperCase()).filter(id => !['Y', 'AND'].includes(id)));
        const optimista = /(?:optimista|o)\s*[:=]?\s*(\d+(?:[.,]\d+)*)/i.exec(contenido);
        const probable = /(?:m[aá]s\s+probable|probable|m)\s*[:=]?\s*(\d+(?:[.,]\d+)*)/i.exec(contenido);
        const pesimista = /(?:pesimista|p)\s*[:=]?\s*(\d+(?:[.,]\d+)*)/i.exec(contenido);
        const duracion = /(?:duraci[oó]n(?:\s+(?:fija|CPM))?(?:\s+de)?|tarda(?:\s+)?|lleva(?:\s+)?|de)\s*(\d+(?:[.,]\d+)*)\s*(?:d[ií]as?|horas?|semanas?)?/i.exec(contenido)
            || /(\d+(?:[.,]\d+)*)\s*(?:d[ií]as?|horas?|semanas?)/i.exec(contenido);
        const id = match[1].toUpperCase();
        const actividad = { id, nombre: escaparNombreLocal(nombre) || id, pred: predecesoras };
        if (optimista && probable && pesimista) {
            actividad.o = numeroLocal(optimista[1]);
            actividad.m = numeroLocal(probable[1]);
            actividad.p = numeroLocal(pesimista[1]);
            if (duracion) actividad.dur = numeroLocal(duracion[1]);
        } else if (duracion) {
            actividad.dur = numeroLocal(duracion[1]);
        } else {
            return null;
        }
        return actividad;
    });
    const plazoMatch = /(?:plazo(?:\s+m[aá]ximo)?|fecha\s+l[ií]mite|terminar\s+el\s+proyecto\s+en|finalizar\s+el\s+proyecto\s+en|completar\s+el\s+proyecto\s+en)[^.;\n]{0,50}?(\d+(?:[.,]\d+)*)\s*(?:d[ií]as?|horas?|semanas?)/i.exec(texto);
    const plazo = plazoMatch ? numeroLocal(plazoMatch[1]) : null;
    if (actividades.length) return validarPertLocal(actividades, plazo);

    const datos = _parsearPert(texto);
    return datos.length ? validarPertLocal(datos, plazo) : null;
}

function revisarModelosLocalmente(textoOriginal) {
    const texto = normalizarEnunciadoLocal(textoOriginal);
    if (!texto) throw new Error('Escribe el enunciado antes de analizarlo.');
    const produccion = extraerProduccionLocal(texto);
    const transporte = extraerTransporteLocal(texto);
    const asignacion = extraerAsignacionLocal(texto);
    const pert = extraerPertLocal(texto);
    const colas = extraerColasLocal(texto);
    const avisos = [];
    if (!produccion?.disponible && /\b(?:producci[oó]n|maximizar|utilidad|beneficio)\b/i.test(texto)) {
        avisos.push('Produccion: verifica que el objetivo, las variables y todas las restricciones esten escritos con claridad.');
    }
    if (!transporte?.disponible && /\b(?:transporte|distribuci[oó]n|or[ií]genes?|destinos?|ofertas?|demandas?)\b/i.test(texto)) {
        avisos.push('Transporte: indica cada origen con su oferta, cada destino con su demanda y cada costo origen-destino.');
    }
    if (!asignacion?.disponible && /\b(?:asignaci[oó]n|h[uú]ngaro|cuadrillas?|tareas?)\b/i.test(texto)) {
        avisos.push('Asignacion: escribe la matriz completa o cada fila con sus tareas y costos.');
    }
    if (!pert?.disponible && /\b(?:PERT|CPM|ruta\s+cr[ií]tica|actividades?\s+(?:del\s+)?proyecto)\b/i.test(texto)) {
        avisos.push('PERT/CPM: identifica cada actividad, su duracion y sus predecesoras.');
    }
    if (!colas?.disponible && /\b(?:(?<!-)colas?|lambda|mu|tasa\s+de\s+llegadas?|tasa\s+de\s+servicio)\b|[λμ]/i.test(texto)) {
        avisos.push('Colas: indica λ y μ en la misma unidad de tiempo y separa los datos de cada servicio o destino.');
    }
    return {
        produccion: produccion || { disponible: false, motivo: 'No se detecto un modelo de produccion.' },
        transporte: transporte || { disponible: false, motivo: 'No se detecto un problema de transporte.' },
        asignacion: asignacion || { disponible: false, motivo: 'No se detecto una matriz de asignacion.' },
        pert: pert || { disponible: false, motivo: 'No se detecto un problema PERT/CPM.' },
        colas: colas || { disponible: false, motivo: 'No se detecto un modelo de colas.' },
        avisos
    };
}

function mostrarResumenLocal(extraccion, estados) {
    const container = document.getElementById('localExtractionSummary');
    if (!container) return;
    container.replaceChildren();
    const titulo = document.createElement('p');
    titulo.innerHTML = '<strong>Analisis local — revisa los datos detectados:</strong>';
    container.appendChild(titulo);
    const lista = document.createElement('ul');
    lista.style.marginLeft = '20px';
    estados.forEach(estado => {
        const item = document.createElement('li');
        item.textContent = `${estado.tema}: ${estado.disponible ? 'datos completos.' : estado.motivo}`;
        lista.appendChild(item);
    });
    container.appendChild(lista);
    if (extraccion.avisos.length) {
        const avisos = document.createElement('p');
        avisos.textContent = extraccion.avisos.join(' ');
        container.appendChild(avisos);
    }
}

function renderTablasDatosLocal(extraccion) {
    const bodyProduccion = document.getElementById('bodyProduccion');
    const bodyRestricciones = document.getElementById('bodyProductionConstraints');
    const bodyTransporte = document.getElementById('bodyDistribucion');
    const footerTransporte = document.getElementById('footerDistribucion');
    const modelo = extraccion.produccion?.datos;
    if (bodyProduccion) {
        bodyProduccion.replaceChildren();
        const productos = modelo?.productos || [];
        if (!productos.length) {
            const row = bodyProduccion.insertRow();
            row.insertCell().colSpan = 4;
            row.cells[0].textContent = 'No se reconocio un modelo de produccion completo.';
        } else {
            productos.forEach((producto, i) => {
                const row = bodyProduccion.insertRow();
                [String(i + 1), producto.nombre, String(producto.util), String(producto.min)].forEach(valor => {
                    row.insertCell().textContent = valor;
                });
            });
        }
    }
    if (bodyRestricciones) {
        bodyRestricciones.replaceChildren();
        if (!modelo?.restricciones?.length) {
            const row = bodyRestricciones.insertRow();
            row.insertCell().colSpan = 4;
            row.cells[0].textContent = 'No se reconocieron restricciones completas.';
        } else {
            modelo.restricciones.forEach(restriccion => {
                const row = bodyRestricciones.insertRow();
                [restriccion.nombre, restriccion.coeficientes.join(', '), restriccion.tipo, String(restriccion.b)]
                    .forEach(valor => { row.insertCell().textContent = valor; });
            });
        }
    }

    if (!bodyTransporte || !footerTransporte) return;
    const transporte = extraccion.transporte?.datos;
    const table = bodyTransporte.closest('table');
    const head = table?.querySelector('thead');
    if (head) {
        const row = document.createElement('tr');
        ['Origen', ...(transporte?.destinos || []).map(nombre => `Costo a ${nombre}`), 'Oferta'].forEach(nombre => {
            const cell = document.createElement('th');
            cell.textContent = nombre;
            row.appendChild(cell);
        });
        head.replaceChildren(row);
    }
    bodyTransporte.replaceChildren();
    footerTransporte.replaceChildren();
    if (!transporte) {
        const row = bodyTransporte.insertRow();
        row.insertCell().colSpan = 3;
        row.cells[0].textContent = 'No se reconocio un problema de transporte completo.';
        return;
    }
    transporte.origenes.forEach((nombre, i) => {
        const row = bodyTransporte.insertRow();
        [nombre, ...transporte.costos[i].map(String), String(transporte.ofertas[i])].forEach(valor => {
            row.insertCell().textContent = valor;
        });
    });
    const demanda = footerTransporte.insertRow();
    demanda.insertCell().textContent = 'Demanda';
    transporte.demandas.forEach(valor => { demanda.insertCell().textContent = String(valor); });
    demanda.insertCell().textContent = '';
}

function parsearYLlenarEnunciado() {
    const texto = document.getElementById('txtEnunciado')?.value.trim();
    const summary = document.getElementById('localExtractionSummary');
    if (!texto) {
        mostrarNotificacion('Escribe o pega el enunciado antes de analizarlo.');
        return;
    }
    try {
        limpiarExtraccionLocal();
        const extraccion = revisarModelosLocalmente(texto);
        const estados = [
            { tema: 'Programacion lineal', disponible: extraccion.produccion.disponible, motivo: extraccion.produccion.motivo },
            { tema: 'Programacion entera', disponible: extraccion.produccion.disponible && extraccion.produccion.enteras, motivo: 'El enunciado no especifica que las variables sean enteras.' },
            { tema: 'Transporte / MODI', disponible: extraccion.transporte.disponible, motivo: extraccion.transporte.motivo },
            { tema: 'Asignacion / Hungaro', disponible: extraccion.asignacion.disponible, motivo: extraccion.asignacion.motivo },
            { tema: 'PERT / CPM', disponible: extraccion.pert.disponible, motivo: extraccion.pert.motivo },
            { tema: 'Teoria de colas', disponible: extraccion.colas.disponible, motivo: extraccion.colas.motivo }
        ];
        extraccion.estados = estados;
        window.extraccionLocal = extraccion;
        window.enunciadoAnalizado = texto;
        window.datosProduccion = extraccion.produccion.disponible ? extraccion.produccion.datos : null;
        window.datosTransporte = extraccion.transporte.disponible ? extraccion.transporte.datos : null;
        window.datosAsignacion = extraccion.asignacion.disponible ? extraccion.asignacion.datos : null;
        window.datosPert = extraccion.pert.disponible ? extraccion.pert.datos : null;
        window.datosColas = extraccion.colas.disponible ? extraccion.colas.datos : null;
        mostrarResumenLocal(extraccion, estados);
        renderTablasDatosLocal(extraccion);
        const disponibles = estados.filter(estado => estado.disponible).length;
        if (!disponibles) {
            mostrarNotificacion('El analizador local no reconocio modelos completos. Revisa las indicaciones.');
        } else {
            mostrarNotificacion(`Analisis local listo: ${disponibles} tema(s) con datos completos.`);
            registrarLogAuditoria('Analisis local de enunciado', `${disponibles} tema(s) completos`);
        }
    } catch (error) {
        if (summary) summary.textContent = `No fue posible analizar el enunciado: ${error.message}`;
        mostrarNotificacion(`Error en el analisis local: ${error.message}`, 7000);
    }
}
