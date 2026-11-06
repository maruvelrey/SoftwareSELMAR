/* ==========================================================================
   CAPA 2 - Archivo: app.js (Controlador, Validación y Renderizado de Grafos Actualizado a Cajas AON)
   ========================================================================== */

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const loginView = document.getElementById('view-login');
        if (loginView && loginView.classList.contains('active')) {
            intentarLogin();
        }
    }
});

function mostrarNotificacion(mensaje, duracion = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = mensaje;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

function validarLogin(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    
    const uInput = document.getElementById('usuario');
    const pInput = document.getElementById('password');
    if (!uInput || !pInput) return;
    
    const u = uInput.value.trim();
    const p = pInput.value.trim();

    if (usuariosValidos[u] && usuariosValidos[u] === p) {
        usuarioActual = u;
        rolUsuario = (u === 'Mariana' || u === 'Ingenieria') ? 'ADMIN' : 'USER';
        
        mostrarNotificacion(`¡Bienvenido al sistema, ${u}!`);
        registrarLogAuditoria('Inicio de Sesión Exitoso', `Rol: ${rolUsuario}`);
        
        const loginView = document.getElementById('view-login');
        if (loginView) {
            loginView.style.display = 'none';
            loginView.classList.remove('active');
            loginView.remove();
        }

        const dashboard = document.getElementById('appDashboard');
        if (dashboard) dashboard.style.display = 'flex';
        
        iniciarApp();
    } else {
        mostrarNotificacion('⚠️ Usuario o contraseña incorrectos.');
        registrarLogAuditoria('Intento Fallido Login', `Usuario intentado: ${u}`);
    }
}

function intentarLogin() { validarLogin(); }

function iniciarApp() {
    const dash = document.getElementById('appDashboard');
    if (dash) dash.style.display = 'flex';

    const badge = document.getElementById('userBadge');
    if (badge) badge.textContent = `${usuarioActual} [${rolUsuario}]`;

    if (rolUsuario === 'ADMIN' || usuarioActual === 'Ingenieria') {
        const menuAdmin = document.getElementById('menuAdminOnly');
        if (menuAdmin) menuAdmin.style.display = 'block';
        renderAdminAuditTable();
    } else {
        const menuAdmin = document.getElementById('menuAdminOnly');
        if (menuAdmin) menuAdmin.style.display = 'none';
    }
    switchView('view-menu');
    cargarArchivosGuardadosEnTabla();
}

function cerrarSesion() {
    registrarLogAuditoria('Cierre de Sesión', 'Salida');
    window.location.reload();
}

function switchView(viewId) {
    document.querySelectorAll('.view-screen').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    if (viewId === 'view-buscar') cargarArchivosGuardadosEnTabla();
}

function toggleAcordeon(id) {
    const contenido = document.getElementById(id);
    if (contenido) {
        contenido.style.display = contenido.style.display === 'none' ? 'block' : 'none';
    }
}

function verificarCoherenciaTablasYEnunciado() {
    const extraction = window.extraccionLocal;
    if (!extraction) {
        return { valido: false, error: 'Analiza localmente el enunciado y revisa los datos detectados antes de calcular.' };
    }
    if (window.enunciadoAnalizado !== document.getElementById('txtEnunciado').value.trim()) {
        return { valido: false, error: 'El enunciado cambio despues del analisis. Vuelve a analizarlo antes de calcular.' };
    }
    if (!extraction.estados.some(estado => estado.disponible)) {
        return { valido: false, error: 'No hay ningun modelo completo. Revisa los datos faltantes en el resumen de extraccion.' };
    }
    return { valido: true };
}

function exportarPDF() {
    window.print();
}

function guardarProyectoEnMemoria() {
    const fileName = document.getElementById('inputFileName').value.trim();
    const operador = document.getElementById('inputOperatorName').value.trim();
    const enunciado = document.getElementById('txtEnunciado').value.trim();

    if (!fileName || !operador || !enunciado) {
        mostrarNotificacion("⚠️ Todos los campos son obligatorios.");
        return;
    }

    const proyectos = JSON.parse(localStorage.getItem('proyectos_SELMAR_Fase3')) || [];
    const index = proyectos.findIndex(p => p.fileName === fileName);

    const datosProyecto = {
        fileName: fileName,
        operador: operador,
        enunciado: enunciado,
        fechaModificacion: new Date().toLocaleString('es-GT')
    };

    if (index >= 0) {
        proyectos[index] = datosProyecto;
        mostrarNotificacion(`📝 ¡Archivo '${fileName}' actualizado con éxito!`);
        registrarLogAuditoria('Modificar Archivo', fileName);
    } else {
        proyectos.push(datosProyecto);
        mostrarNotificacion(`💾 ¡Archivo '${fileName}' guardado con éxito!`);
        registrarLogAuditoria('Guardar Archivo', fileName);
    }

    localStorage.setItem('proyectos_SELMAR_Fase3', JSON.stringify(proyectos));
    cargarArchivosGuardadosEnTabla();
}

function cargarProyectoParaModificar(fileName) {
    const proyectos = JSON.parse(localStorage.getItem('proyectos_SELMAR_Fase3')) || [];
    const p = proyectos.find(item => item.fileName === fileName);
    if (p) {
        document.getElementById('inputFileName').value = p.fileName;
        document.getElementById('inputOperatorName').value = p.operador;
        document.getElementById('txtEnunciado').value = p.enunciado;
        switchView('view-ingresar');
        mostrarNotificacion(`📂 Archivo '${fileName}' cargado.`);
    }
}

function eliminarProyectoGuardado(fileName) {
    let proyectos = JSON.parse(localStorage.getItem('proyectos_SELMAR_Fase3')) || [];
    proyectos = proyectos.filter(p => p.fileName !== fileName);
    localStorage.setItem('proyectos_SELMAR_Fase3', JSON.stringify(proyectos));
    cargarArchivosGuardadosEnTabla();
    mostrarNotificacion(`🗑️ Archivo '${fileName}' eliminado.`);
}

function cargarArchivosGuardadosEnTabla() {
    const container = document.getElementById('searchFilesResultContainer');
    if (!container) return;
    const proyectos = JSON.parse(localStorage.getItem('proyectos_SELMAR_Fase3')) || [];

    if (proyectos.length === 0) {
        container.innerHTML = `<p style="color:#666;">No hay archivos guardados en el sistema actualmente.</p>`;
        return;
    }

    let html = `<table class="excel-table" style="text-align:left;">
        <tr><th>Archivo</th><th>Responsable</th><th>Última Modificación</th><th style="text-align:center;">Acciones</th></tr>`;
    
    proyectos.forEach(f => {
        html += `<tr>
            <td><b>${f.fileName}</b></td>
            <td>${f.operador}</td>
            <td>${f.fechaModificacion}</td>
            <td style="text-align:center;">
                <button class="btn-action-small" onclick="cargarProyectoParaModificar('${f.fileName}')" style="background:#1976d2;">✏️ Modificar</button>
                <button class="btn-action-small" onclick="eliminarProyectoGuardado('${f.fileName}')" style="background:#d32f2f; margin-left:5px;">🗑️ Borrar</button>
            </td>
        </tr>`;
    });
    html += `</table>`;
    container.innerHTML = html;
}

function filtrarArchivosGuardados() {
    const query = document.getElementById('inputSearchQuery').value.toLowerCase();
    const proyectos = JSON.parse(localStorage.getItem('proyectos_SELMAR_Fase3')) || [];
    const container = document.getElementById('searchFilesResultContainer');
    
    const filtrados = proyectos.filter(l => l.fileName.toLowerCase().includes(query) || l.operador.toLowerCase().includes(query));
    
    if (filtrados.length === 0) {
        container.innerHTML = `<p style="color:#666;">No se encontraron archivos que coincidan con la búsqueda.</p>`;
        return;
    }

    let html = `<table class="excel-table" style="text-align:left;">
        <tr><th>Archivo</th><th>Responsable</th><th>Última Modificación</th><th style="text-align:center;">Acciones</th></tr>`;
    
    filtrados.forEach(f => {
        html += `<tr>
            <td><b>${f.fileName}</b></td>
            <td>${f.operador}</td>
            <td>${f.fechaModificacion}</td>
            <td style="text-align:center;">
                <button class="btn-action-small" onclick="cargarProyectoParaModificar('${f.fileName}')" style="background:#1976d2;">✏️ Modificar</button>
                <button class="btn-action-small" onclick="eliminarProyectoGuardado('${f.fileName}')" style="background:#d32f2f; margin-left:5px;">🗑️ Borrar</button>
            </td>
        </tr>`;
    });
    html += `</table>`;
    container.innerHTML = html;
}

/* ==========================================================================
   VIS-NETWORK: CONFIGURACIÓN GENERAL FORZADA A CAJAS (BOX) Y FLECHAS
   ========================================================================== */
function renderVisGraphCustom(containerId, nodesData, edgesData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = {
        nodes: new vis.DataSet(nodesData),
        edges: new vis.DataSet(edgesData)
    };

    const options = {
        nodes: {
            shape: 'box',
            font: { size: 13, face: 'Poppins', color: '#333333', strokeWidth: 2, strokeColor: '#ffffff' },
            color: { background: '#ffffff', border: '#333333', highlight: { background: '#ffebee', border: '#d32f2f' } },
            borderWidth: 2,
            margin: 14
        },
        edges: {
            width: 2,
            color: { color: '#333333', highlight: '#d32f2f' },
            font: { size: 11, align: 'top', face: 'Poppins', color: '#d32f2f', background: '#ffffff' },
            arrows: { to: { enabled: true, scaleFactor: 0.9 } },
            smooth: { type: 'cubicBezier', roundness: 0.2 }
        },
        physics: {
            enabled: false
        },
        interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true
        }
    };

    new vis.Network(container, data, options);
}

let mapaRutasSELMAR = null;
let intervaloAlertasGuatemala = null;

function coordenadasMapaSELMAR(nombre, tipo, indice, total) {
    const texto = String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const ubicaciones = [
        { patron: /kalu/, coordenadas: [14.6100, -90.5300] },
        { patron: /las tunas/, coordenadas: [14.6400, -90.5100] },
        { patron: /san juan/, coordenadas: [14.6300, -90.5500] },
        { patron: /carretera.*salvador/, coordenadas: [14.5800, -90.4500] },
        { patron: /miraflores/, coordenadas: [14.6200, -90.5600] },
        { patron: /san cristobal/, coordenadas: [14.6000, -90.5800] }
    ];
    const conocida = ubicaciones.find(ubicacion => ubicacion.patron.test(texto));
    if (conocida) return { coordenadas: conocida.coordenadas, aproximada: true };

    const paso = (indice - (total - 1) / 2) * 0.035;
    return {
        coordenadas: tipo === 'origen'
            ? [14.6500 + paso, -90.5200 - paso]
            : [14.5850 + paso, -90.4650 + paso],
        aproximada: true
    };
}

function inicializarMapaRutasSELMAR() {
    const container = document.getElementById('mapContainer');
    if (!container) return;
    if (typeof L === 'undefined') {
        container.textContent = 'No se pudo cargar el mapa. Revisa tu conexión a internet.';
        return;
    }

    if (mapaRutasSELMAR) {
        mapaRutasSELMAR.remove();
        mapaRutasSELMAR = null;
    }

    const modelo = window.datosTransporte;
    const origenes = modelo?.origenes?.length ? modelo.origenes : ['CEDI Kalú', 'CEDI Las Tunas', 'CEDI San Juan'];
    const destinos = modelo?.destinos?.length ? modelo.destinos : ['Carretera a El Salvador', 'Miraflores', 'San Cristóbal'];
    const puntosOrigen = origenes.map((nombre, indice) => ({
        nombre,
        ...coordenadasMapaSELMAR(nombre, 'origen', indice, origenes.length)
    }));
    const puntosDestino = destinos.map((nombre, indice) => ({
        nombre,
        ...coordenadasMapaSELMAR(nombre, 'destino', indice, destinos.length)
    }));
    const ubicaciones = [...puntosOrigen, ...puntosDestino];

    mapaRutasSELMAR = L.map(container).setView([14.615, -90.535], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(mapaRutasSELMAR);

    const iconos = {
        origen: { color: '#1565c0', fillColor: '#42a5f5' },
        destino: { color: '#e65100', fillColor: '#ff9800' }
    };
    puntosOrigen.forEach(punto => {
        const marcador = L.circleMarker(punto.coordenadas, { ...iconos.origen, radius: 9, weight: 2, fillOpacity: 0.9 })
            .addTo(mapaRutasSELMAR)
            .bindPopup(`<strong>Bodega / origen:</strong> ${escaparHtml(punto.nombre)}<br><small>Ubicación referencial</small>`);
        const etiqueta = document.createElement('span');
        etiqueta.textContent = punto.nombre;
        marcador.bindTooltip(etiqueta, { permanent: true, direction: 'top', offset: [0, -8] });
    });
    puntosDestino.forEach(punto => {
        const marcador = L.circleMarker(punto.coordenadas, { ...iconos.destino, radius: 8, weight: 2, fillOpacity: 0.9 })
            .addTo(mapaRutasSELMAR)
            .bindPopup(`<strong>Sucursal / destino:</strong> ${escaparHtml(punto.nombre)}<br><small>Ubicación referencial</small>`);
        const etiqueta = document.createElement('span');
        etiqueta.textContent = punto.nombre;
        marcador.bindTooltip(etiqueta, { permanent: true, direction: 'top', offset: [0, -8] });
    });

    const asignacion = typeof RESULTADOS !== 'undefined' ? RESULTADOS.transporte : null;
    const coloresRuta = ['#7b1fa2', '#00897b', '#c62828', '#3949ab', '#ef6c00', '#2e7d32'];
    if (asignacion?.X) {
        asignacion.X.forEach((fila, i) => fila.forEach((cantidad, j) => {
            if (cantidad <= 0 || !puntosOrigen[i] || !puntosDestino[j]) return;
            const costo = asignacion.C?.[i]?.[j];
            const linea = L.polyline([puntosOrigen[i].coordenadas, puntosDestino[j].coordenadas], {
                color: coloresRuta[i % coloresRuta.length],
                weight: Math.min(7, 2 + cantidad / Math.max(1, asignacion.X.flat().reduce((a, b) => a + b, 0)) * 30),
                opacity: 0.82
            }).addTo(mapaRutasSELMAR);
            linea.bindPopup(
                `<strong>${escaparHtml(puntosOrigen[i].nombre)} → ${escaparHtml(puntosDestino[j].nombre)}</strong>` +
                `<br>Envío óptimo: ${escaparHtml(cantidad)} unidades` +
                (Number.isFinite(costo) ? `<br>Costo unitario: Q ${escaparHtml(costo)}` : '')
            );
        }));
    }

    mapaRutasSELMAR.fitBounds(
        L.latLngBounds(ubicaciones.map(punto => punto.coordenadas)),
        { padding: [24, 24], maxZoom: 13 }
    );
    setTimeout(() => mapaRutasSELMAR?.invalidateSize(), 100);
}

function actualizarAdvertenciaGuatemala() {
    const container = document.getElementById('gtEventAlert');
    if (!container) return;

    container.replaceChildren();
    const estado = document.createElement('p');
    estado.className = 'gt-alert-status';
    estado.textContent = 'Consultando titulares recientes sobre movilidad en Guatemala…';
    container.appendChild(estado);

    const terminos = 'Guatemala (bloqueo OR bloqueos OR manifestación OR manifestaciones OR protesta OR protestas OR "cierre vial" OR "cierres viales")';
    const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(terminos)}&hl=es-419&gl=GT&ceid=GT:es-419`;
    const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`;
    const enlaceNoticias = document.getElementById('gtNewsLink');
    if (enlaceNoticias) enlaceNoticias.href = `https://news.google.com/search?q=${encodeURIComponent(terminos)}&hl=es-419&gl=GT&ceid=GT:es-419`;

    const agregarFuentesOficiales = () => {
        const oficiales = document.createElement('p');
        oficiales.className = 'gt-official-links';
        oficiales.append('Verifica avisos oficiales: ');
        [
            ['PROVIAL', 'https://www.facebook.com/ProvialGuatemala/'],
            ['CONRED', 'https://conred.gob.gt/']
        ].forEach(([nombre, url], indice) => {
            if (indice) oficiales.append(' · ');
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            enlace.textContent = nombre;
            oficiales.appendChild(enlace);
        });
        container.appendChild(oficiales);
    };

    const cargar = async () => {
        const controlador = new AbortController();
        const timeout = setTimeout(() => controlador.abort(), 12000);
        try {
            const respuesta = await fetch(endpoint, { signal: controlador.signal });
            if (!respuesta.ok) throw new Error(`El servicio RSS respondió HTTP ${respuesta.status}.`);
            const datos = await respuesta.json();
            if (datos.status !== 'ok' || !Array.isArray(datos.items)) {
                throw new Error(datos.message || 'El servicio RSS no devolvió titulares válidos.');
            }

            const limite = Date.now() - 48 * 60 * 60 * 1000;
            const recientes = datos.items.filter(item => {
                const fecha = Date.parse(item.pubDate);
                return Number.isFinite(fecha) && fecha >= limite;
            }).slice(0, 4);

            container.replaceChildren();
            const titulo = document.createElement('strong');
            titulo.textContent = recientes.length
                ? '⚠ Reportes noticiosos recientes sobre movilidad'
                : 'No se encontraron titulares recientes sobre bloqueos o manifestaciones.';
            container.appendChild(titulo);

            if (!recientes.length) {
                const nota = document.createElement('p');
                nota.textContent = 'Esto no confirma que las vías estén despejadas; verifica avisos oficiales antes de salir.';
                container.appendChild(nota);
            }

            const lista = document.createElement('ul');
            recientes.forEach(item => {
                const fila = document.createElement('li');
                const tituloNormalizado = String(item.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const esCierre = /bloqueos?|cierres? viales?/.test(tituloNormalizado);
                const esManifestacion = /manifestaciones?|protestas?|marchas?/.test(tituloNormalizado);
                const categoria = esCierre
                    ? 'Bloqueo o cierre vial reportado'
                    : (esManifestacion
                        ? 'Manifestación o protesta reportada'
                        : 'Noticia de movilidad');
                const etiqueta = document.createElement('span');
                etiqueta.className = `gt-alert-tag ${esCierre ? 'gt-alert-tag-closure' : (esManifestacion ? 'gt-alert-tag-protest' : 'gt-alert-tag-news')}`;
                etiqueta.textContent = categoria;
                const enlace = document.createElement('a');
                try {
                    const url = new URL(item.link);
                    if (url.protocol !== 'https:') throw new Error('Protocolo no seguro');
                    enlace.href = url.href;
                    enlace.target = '_blank';
                    enlace.rel = 'noopener noreferrer';
                } catch {
                    enlace.removeAttribute('href');
                }
                enlace.textContent = item.title || 'Titular sin título';
                const fecha = new Date(item.pubDate);
                const detalle = document.createElement('small');
                detalle.textContent = ` ${item.author ? `— ${item.author} · ` : '· '}${fecha.toLocaleString('es-GT')}`;
                fila.append(etiqueta, document.createTextNode(' '), enlace, detalle);
                lista.appendChild(fila);
            });
            if (recientes.length) container.appendChild(lista);

            const pie = document.createElement('small');
            pie.textContent = 'Fuente: Google Noticias vía RSS público. Son reportes de prensa, no alertas oficiales ni confirmación de afectaciones vigentes.';
            container.appendChild(pie);
            agregarFuentesOficiales();
        } catch (error) {
            container.replaceChildren();
            const mensaje = document.createElement('p');
            mensaje.textContent = `No se pudieron actualizar los reportes automáticos (${error.name === 'AbortError' ? 'tiempo de espera agotado' : error.message}). Consulta las fuentes oficiales antes de planificar rutas.`;
            container.appendChild(mensaje);
            const enlace = document.createElement('a');
            enlace.href = `https://news.google.com/search?q=${encodeURIComponent(terminos)}&hl=es-419&gl=GT&ceid=GT:es-419`;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            enlace.textContent = 'Abrir búsqueda de noticias';
            container.appendChild(enlace);
            agregarFuentesOficiales();
        } finally {
            clearTimeout(timeout);
        }
    };

    cargar();
    clearInterval(intervaloAlertasGuatemala);
    intervaloAlertasGuatemala = setInterval(cargar, 15 * 60 * 1000);
}

function escaparHtml(valor) {
    return String(valor).replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);
}

function generarEcuacionesYCalcular() {
    const operador = document.getElementById('inputOperatorName').value.trim();
    const fileName = document.getElementById('inputFileName').value.trim();
    const container = document.getElementById('resultsOutputContainer');

    if (!operador || !fileName) {
        mostrarNotificacion('Requerido: Nombre de Archivo y Responsable.');
        return;
    }

    const validacion = verificarCoherenciaTablasYEnunciado();
    if (!validacion.valido) {
        mostrarNotificacion('Calculo bloqueado: revisa los datos extraidos.');
        container.textContent = validacion.error;
        switchView('view-resultados');
        return;
    }

    const extraction = window.extraccionLocal;
    const estados = extraction.estados;
    const seccion = (id, titulo, contenido) => `
        <div class="op-card-block">
            <h3><span>${titulo}</span><button class="btn-action-small" onclick="toggleAcordeon('${id}')">Ver Detalle</button></h3>
            <div id="${id}" style="display:block" class="procedure-box">${contenido}</div>
        </div>`;
    const noDisponible = tema => `<div class="procedure-step" style="background:#fff3e0;padding:14px;border-radius:8px;">No se calculara este tema: ${escaparHtml(tema.motivo)} No se usaran datos de ejemplo.</div>`;
    const contenidoTema = (estado, calcular) => estado.disponible ? calcular() : noDisponible(estado);
    const porNombre = nombre => estados.find(e => e.tema === nombre);
    const partes = [];

    partes.push(`<div style="background:#e3f2fd;border:2px solid #1976d2;color:#0d47a1;padding:18px;border-radius:12px;margin-bottom:25px;width:100%;">
        <strong>Reporte de Investigacion de Operaciones:</strong><br>
        - <b>Proyecto:</b> ${escaparHtml(fileName)} | <b>Responsable:</b> ${escaparHtml(operador)}<br>
        - <b>Estado:</b> Datos detectados localmente; resultados calculados por los algoritmos locales.<br>
        - <b>Fecha:</b> ${escaparHtml(new Date().toLocaleString('es-GT'))}
    </div>`);

    const pl = porNombre('Programacion lineal');
    partes.push(seccion('detMGrande', 'Programacion Lineal, Simplex y plano 2D',
        contenidoTema(pl, () => obtenerProcedimientoMGrande())));

    const entera = porNombre('Programacion entera');
    partes.push(seccion('detEntera', 'Programacion Entera (Branch and Bound)',
        contenidoTema(entera, () => obtenerProcedimientoEntera())));

    const transporte = porNombre('Transporte / MODI');
    partes.push(seccion('detModi', 'Transporte y Metodo MODI',
        contenidoTema(transporte, () => obtenerProcedimientoMODI())));

    const asignacion = porNombre('Asignacion / Hungaro');
    partes.push(seccion('detHungaro', 'Metodo Hungaro (Asignacion)',
        contenidoTema(asignacion, () => obtenerProcedimientoHungaro())));

    const pert = porNombre('PERT / CPM');
    partes.push(seccion('detPert', 'Analisis PERT / CPM',
        contenidoTema(pert, () => obtenerProcedimientoPertCpm())));

    if (extraction.avisos.length) {
        partes.push(`<div class="procedure-step" style="background:#fff3e0;padding:14px;border-radius:8px;"><b>Observaciones de extraccion:</b><ul>${extraction.avisos.map(aviso => `<li>${escaparHtml(aviso)}</li>`).join('')}</ul></div>`);
    }
    partes.push(`
        <section class="op-card-block route-map-card" aria-labelledby="routeMapTitle">
            <h3 id="routeMapTitle">Mapa referencial de bodegas, sucursales y envíos</h3>
            <div id="gtEventAlert" class="gt-event-alert" role="status" aria-live="polite">
                <p>Consultando titulares recientes sobre movilidad en Guatemala…</p>
            </div>
            <p class="route-map-disclaimer">Las ubicaciones son referenciales y las líneas rectas representan asignaciones de transporte, no rutas viales ni tráfico en tiempo real.</p>
            <div class="route-map-legend"><span><i class="legend-origin"></i> Bodegas / orígenes</span><span><i class="legend-destination"></i> Sucursales / destinos</span><span><i class="legend-route"></i> Envíos asignados</span></div>
            <div id="mapContainer" class="route-map-container" role="img" aria-label="Mapa referencial con bodegas, sucursales y flujos calculados"></div>
            <a id="gtNewsLink" class="gt-news-link" href="https://news.google.com/" target="_blank" rel="noopener noreferrer">Abrir noticias de Guatemala</a>
        </section>`);
    container.innerHTML = partes.join('');

    registrarLogAuditoria('Calculo de modelos extraidos localmente', fileName);
    mostrarNotificacion('Modelos disponibles calculados. Revisa las indicaciones del parser y las tablas.');
    setTimeout(() => {
        if (typeof renderGeoGebraCanvas === 'function' && pl.disponible) renderGeoGebraCanvas();
        if (typeof inicializarGrafos === 'function') inicializarGrafos();
        inicializarMapaRutasSELMAR();
        actualizarAdvertenciaGuatemala();
    }, 300);
    switchView('view-resultados');
}

function renderAdminAuditTable() {
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const logs = JSON.parse(localStorage.getItem('auditLogs_SELMAR_Fase3')) || [];
    logs.forEach(log => {
        tbody.innerHTML += `
            <tr>
                <td style="padding:12px;">${log.fechaHora}</td>
                <td style="padding:12px;"><b>${log.usuario}</b> (${log.rol})</td>
                <td style="padding:12px;">${log.operador}</td>
                <td style="padding:12px;"><span style="font-size:11px; color:#555;">${log.dispositivo}</span></td>
                <td style="padding:12px;"><span class="user-badge" style="background:#ffebee; color:#d32f2f; padding:4px 8px;">${log.accion}</span></td>
                <td style="padding:12px;">${log.detalle}</td>
            </tr>
        `;
    });
}