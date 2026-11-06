/* ==========================================================================
   CAPA 2 - Archivo: config.js (Datos, Credenciales y Auditoría Multi-Dispositivo)
   ========================================================================== */

let usuarioActual = '';
let rolUsuario = 'USER';

// Credenciales oficiales completas
const usuariosValidos = {
    'Mariana': 'mariana2026',
    'Ingenieria': 'ingXiloj2026',
    'Luis': 'luis2026',
    'Sebas': 'sebas2026',
    'Rudy': 'rudy2026',
    'Axel': 'axel2026',
    'Nohemi': 'nohemi2026',
    'Angie': 'angie2026'
};

/* Función para registrar acciones y auditoría detectando navegador y dispositivo */
function registrarLogAuditoria(accion, detalle = '') {
    const logs = JSON.parse(localStorage.getItem('auditLogs_SELMAR_Fase3')) || [];
    const operador = document.getElementById('inputOperatorName')?.value.trim() || usuarioActual;
    const fileName = document.getElementById('inputFileName')?.value.trim() || 'Proyecto_Fase3';
    
    const infoDispositivo = navigator.userAgent;
    
    const nuevoLog = {
        fechaHora: new Date().toLocaleString('es-GT'),
        usuario: usuarioActual,
        rol: rolUsuario,
        operador: operador,
        fileName: fileName,
        accion: accion,
        detalle: detalle,
        dispositivo: infoDispositivo
    };
    
    logs.unshift(nuevoLog);
    localStorage.setItem('auditLogs_SELMAR_Fase3', JSON.stringify(logs));
    
    if (typeof renderAdminAuditTable === 'function' && (usuarioActual === 'Mariana' || usuarioActual === 'Ingenieria')) {
        renderAdminAuditTable();
    }
}