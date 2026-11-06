/* ==========================================================================
   CAPA 2 - Archivo: io-models.js  (Motor matemático 100% dinámico, v2)
   --------------------------------------------------------------------------
   - Nada de resultados escritos a mano: todo sale de los datos de entrada.
   - Cada tema muestra TODO el procedimiento matemático (planteamiento,
     tablas, operaciones, verificación y conclusión).
   - La interfaz solo resuelve modelos completos extraídos del enunciado.
     Los motores reciben window.datosProduccion, datosTransporte,
     datosAsignacion y datosPert; los datos incompletos generan un error y
     nunca se sustituyen por ejemplos predeterminados.
   ========================================================================== */

const EPS = 1e-9;
const RESULTADOS = {};
const FUENTES = {};

const sumar = (arr) => arr.reduce((a, b) => a + b, 0);
const num = (v, def) => { const x = parseFloat(v); return Number.isFinite(x) ? x : def; };
const f2 = (n) => Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f3 = (n) => String(Number(Number(n).toFixed(3)));
const limpio = (x) => Math.round(Number(x) * 1e9) / 1e9;

/* Tiempos (PERT): enteros sin decimales; si el valor es fraccionario exacto se muestra como fracción (p. ej. 16/3) */
function fmtT(x) {
    x = limpio(x);
    if (Number.isInteger(x)) return String(x);
    const neg = x < 0, ax = Math.abs(x);
    for (let d = 2; d <= 12; d++) {
        const n = ax * d;
        if (Math.abs(n - Math.round(n)) < 1e-7) return `${neg ? '-' : ''}${Math.round(n)}/${d}`;
    }
    return String(Number(x.toFixed(3)));
}

function avisoFuente(clave) {
    const f = FUENTES[clave];
    return f ? `<p style="font-size:12px; color:#666; margin-bottom:10px;">📥 Datos tomados de: <b>${f}</b></p>` : '';
}

/* ==========================================================================
   1. LECTURA DE DATOS DE LA INTERFAZ
   ========================================================================== */

function obtenerDatosDinamicosTablas() {
    const wp = window.datosProduccion;
    if (wp && Array.isArray(wp.productos) && wp.productos.length) {
        const productos = wp.productos.map(p => ({
            nombre: String(p.nombre || '').trim(),
            util: Number(p.util),
            min: Number(p.min || 0),
            vol: Number(p.vol || 0),
            horas: Number(p.horas || 0)
        }));
        FUENTES.pl = 'window.datosProduccion';
        return {
            productos,
            restricciones: Array.isArray(wp.restricciones) ? wp.restricciones : null,
            sentido: wp.sentido || 'max'
        };
    }
    FUENTES.pl = 'SIN DATOS';
    throw new Error('No hay un modelo de producción extraído y completo.');
}

function construirModeloPL(d) {
    const n = d.productos.length;
    const c = d.productos.map(p => p.util);
    if (!Array.isArray(d.restricciones) || !d.restricciones.length) {
        throw new Error('El modelo de producción no tiene restricciones completas.');
    }
    const rest = d.restricciones.map((r, i) => ({
        nombre: r.nombre || `Restricción ${i + 1}`,
        a: [...r.coeficientes],
        tipo: r.tipo,
        b: r.b
    }));
    d.productos.forEach((p, i) => {
        if (p.min > 0) {
            const a = Array(n).fill(0); a[i] = 1;
            rest.push({ nombre: `Demanda mínima ${p.nombre}`, a, tipo: '>=', b: p.min });
        }
    });
    return { n, c, rest, nombres: d.productos.map(p => p.nombre) };
}

function planteamientoHTML(modelo, entera) {
    const objetivo = modelo.c.map((v, j) => `${f2(v)} X${j + 1}`).join(' + ');
    const restHTML = modelo.rest.map(r => {
        const lhs = r.a.map((v, j) => `${v} X${j + 1}`).join(' + ');
        const simb = r.tipo === '<=' ? '≤' : (r.tipo === '>=' ? '≥' : '=');
        return `<li><b>${r.nombre}:</b> <code>${lhs} ${simb} ${f2(r.b)}</code></li>`;
    }).join('');
    return `<p><b>Variables de decisión:</b> ${modelo.nombres.map((nm, j) => `X${j + 1} = cantidad de ${nm}`).join('; ')}</p>
        <div class="formula-box">Max Z = ${objetivo}</div>
        <p style="margin-top:10px;"><b>Sujeto a:</b></p>
        <ol style="margin-left:20px;">${restHTML}<li>${modelo.nombres.map((_, j) => `X${j + 1}`).join(', ')} ≥ 0${entera ? ' y <b>enteras</b>' : ''}</li></ol>`;
}

/* ==========================================================================
   2. SIMPLEX GRAN M (genérico, M simbólica: cada valor = k + m·M)
   ========================================================================== */

function simplexBigM(c, restOriginal, guardarPasos = true) {
    const n = c.length;
    const rest = restOriginal.map(r => ({ ...r, a: [...r.a] }));
    rest.forEach(r => {
        if (r.b < 0) {
            r.a = r.a.map(v => -v); r.b = -r.b;
            r.tipo = r.tipo === '<=' ? '>=' : (r.tipo === '>=' ? '<=' : '=');
        }
    });
    const m = rest.length;

    const cols = c.map((v, j) => ({ nombre: `X${j + 1}`, cm: 0, ck: v }));
    const extra = [];
    const base = Array(m).fill(-1);
    let cs = 0, ce = 0, ca = 0;
    const filaVars = [];

    rest.forEach((r, i) => {
        const nombres = [];
        if (r.tipo === '<=') {
            cols.push({ nombre: `S${++cs}`, cm: 0, ck: 0 });
            extra.push({ fila: i, valor: 1, col: cols.length - 1 });
            base[i] = cols.length - 1; nombres.push(`S${cs}`);
        } else {
            if (r.tipo === '>=') {
                cols.push({ nombre: `E${++ce}`, cm: 0, ck: 0 });
                extra.push({ fila: i, valor: -1, col: cols.length - 1 });
                nombres.push(`E${ce}`);
            }
            cols.push({ nombre: `A${++ca}`, cm: -1, ck: 0 });
            extra.push({ fila: i, valor: 1, col: cols.length - 1 });
            base[i] = cols.length - 1; nombres.push(`A${ca}`);
        }
        filaVars.push(nombres);
    });

    const N = cols.length;
    const T = rest.map(r => { const f = Array(N).fill(0); r.a.forEach((v, j) => f[j] = v); return f; });
    extra.forEach(e => { T[e.fila][e.col] = e.valor; });
    const b = rest.map(r => r.b);

    const zm = Array(N).fill(0), zk = Array(N).fill(0);
    let zmb = 0, zkb = 0;
    for (let j = 0; j < N; j++) {
        zm[j] = -cols[j].cm; zk[j] = -cols[j].ck;
        for (let i = 0; i < m; i++) {
            zm[j] += cols[base[i]].cm * T[i][j];
            zk[j] += cols[base[i]].ck * T[i][j];
        }
    }
    for (let i = 0; i < m; i++) { zmb += cols[base[i]].cm * b[i]; zkb += cols[base[i]].ck * b[i]; }

    const pasos = [];
    const snap = (ent, sal, ratios) => {
        if (!guardarPasos) return;
        const p = {
            T: T.map(f => [...f]), b: [...b], zm: [...zm], zk: [...zk], zmb, zkb,
            base: base.map(j => cols[j].nombre), ent, sal, ratios
        };
        if (ent != null && sal != null) {
            p.pivote = T[sal][ent];
            p.factores = T.map(f => f[ent]);
        }
        pasos.push(p);
    };

    let estado = 'optimo';
    for (let iter = 0; iter < 200; iter++) {
        let e = -1;
        for (let j = 0; j < N; j++) {
            const neg = zm[j] < -EPS || (Math.abs(zm[j]) <= EPS && zk[j] < -EPS);
            if (!neg) continue;
            if (e < 0 || zm[j] < zm[e] - EPS || (Math.abs(zm[j] - zm[e]) <= EPS && zk[j] < zk[e] - EPS)) e = j;
        }
        if (e < 0) { snap(null, null, null); break; }

        let l = -1, mejor = Infinity;
        const ratios = Array(m).fill(undefined);
        for (let i = 0; i < m; i++) {
            if (T[i][e] > EPS) {
                ratios[i] = b[i] / T[i][e];
                if (ratios[i] < mejor - EPS) { mejor = ratios[i]; l = i; }
            }
        }
        if (l < 0) { snap(e, null, ratios); estado = 'no_acotado'; break; }
        snap(e, l, ratios);

        const piv = T[l][e];
        for (let j = 0; j < N; j++) T[l][j] /= piv;
        b[l] /= piv;
        for (let i = 0; i < m; i++) {
            if (i === l) continue;
            const fct = T[i][e];
            if (Math.abs(fct) < EPS) continue;
            for (let j = 0; j < N; j++) T[i][j] -= fct * T[l][j];
            b[i] -= fct * b[l];
        }
        const fm = zm[e], fk = zk[e];
        for (let j = 0; j < N; j++) { zm[j] -= fm * T[l][j]; zk[j] -= fk * T[l][j]; }
        zmb -= fm * b[l]; zkb -= fk * b[l];
        base[l] = e;
    }

    const x = Array(n).fill(0);
    base.forEach((bj, i) => { if (bj < n) x[bj] = Math.max(0, b[i]); });
    base.forEach((bj, i) => { if (cols[bj].nombre.startsWith('A') && b[i] > 1e-7) estado = 'infactible'; });

    const z = x.reduce((s, v, j) => s + v * c[j], 0);
    return { estado, x, z, pasos, cols, filaVars, rest };
}

function fmtM(m, k) {
    const mz = Math.abs(m) < 1e-9, kz = Math.abs(k) < 1e-9;
    if (mz) return f3(k);
    const am = Math.abs(m);
    const txtM = (am === 1 ? '' : f3(am)) + 'M';
    if (kz) return (m < 0 ? '-' : '') + txtM;
    return `${f3(k)} ${m < 0 ? '-' : '+'} ${txtM}`;
}

/* Explicación escrita de cada iteración del simplex */
function narrativaSimplexHTML(p, cols) {
    if (p.ent == null) {
        return `<p style="margin-top:6px;"><b>Prueba de optimalidad:</b> todos los Z<sub>j</sub> − C<sub>j</sub> ≥ 0 → ninguna variable puede mejorar Z. <b>Solución óptima alcanzada.</b></p>`;
    }
    const ent = cols[p.ent].nombre;
    let h = `<p style="margin-top:6px;"><b>1) Variable que entra:</b> ${ent} (Z<sub>j</sub> − C<sub>j</sub> = ${fmtM(p.zm[p.ent], p.zk[p.ent])}, el más negativo).</p>`;
    if (p.sal == null) return h + `<p><span class="hl-alert">Ningún elemento de la columna ${ent} es positivo → el problema es NO ACOTADO.</span></p>`;
    const razones = p.ratios.map((r, i) => r === undefined ? null : `${p.base[i]}: ${f3(p.b[i])} / ${f3(p.T[i][p.ent])} = ${f3(r)}`).filter(Boolean).join(' ; ');
    h += `<p><b>2) Razón mínima</b> (b<sub>i</sub> / a<sub>i,${ent}</sub>, solo con a<sub>i</sub> &gt; 0): ${razones} → sale <b>${p.base[p.sal]}</b>.</p>`;
    h += `<p><b>3) Elemento pivote</b> = ${f3(p.pivote)} (fila ${p.base[p.sal]}, columna ${ent}).</p>`;
    const ops = [`F(${ent}) ← F(${p.base[p.sal]}) ÷ ${f3(p.pivote)}  (fila pivote normalizada)`];
    p.T.forEach((f, i) => {
        if (i === p.sal || Math.abs(p.factores[i]) < EPS) return;
        ops.push(`F(${p.base[i]}) ← F(${p.base[i]}) − (${f3(p.factores[i])})·F(${ent})`);
    });
    ops.push(`Fila Z ← Fila Z − (${fmtM(p.zm[p.ent], p.zk[p.ent])})·F(${ent})`);
    h += `<p><b>4) Operaciones entre filas:</b></p><ul style="margin-left:20px;">${ops.map(o => `<li>${o}</li>`).join('')}</ul>`;
    return h;
}

function tablaSimplexHTML(p, cols, titulo) {
    const head = `<tr style="background:#f2f2f2;"><th>Base</th>${cols.map(c => `<th>${c.nombre}</th>`).join('')}<th>b_i</th><th>Razón mínima</th></tr>`;
    const filas = p.T.map((fila, i) => {
        let razon = '—';
        if (p.ratios && p.ratios[i] !== undefined) {
            razon = `${f3(p.b[i])} / ${f3(fila[p.ent])} = ${f3(p.ratios[i])}`;
            if (i === p.sal) razon = `<span class="hl-result">${razon} (sale ${p.base[i]})</span>`;
        }
        const celdas = fila.map((v, j) => {
            const esPivote = (j === p.ent && i === p.sal);
            const st = esPivote ? ' style="background:#ffebee; color:#d32f2f; font-weight:bold;"' : '';
            return `<td${st}>${f3(v)}</td>`;
        }).join('');
        return `<tr><td><b>${p.base[i]}</b></td>${celdas}<td>${f3(p.b[i])}</td><td>${razon}</td></tr>`;
    }).join('');
    const zfila = `<tr style="background:#fafafa;"><td><b>Z_j - C_j</b></td>${cols.map((_, j) => `<td>${fmtM(p.zm[j], p.zk[j])}</td>`).join('')}<td><b>${fmtM(p.zmb, p.zkb)}</b></td><td><b>${p.ent != null ? 'Entra ' + cols[p.ent].nombre : '✔ Óptimo'}</b></td></tr>`;
    return `
        <div class="procedure-step" style="margin-bottom: 20px;">
            <h4 style="color:#d32f2f; margin-bottom:8px;">${titulo}</h4>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px;">${head}${filas}${zfila}</table></div>
            ${narrativaSimplexHTML(p, cols)}
        </div>`;
}

/* ==========================================================================
   3. PROGRAMACIÓN LINEAL (SIMPLEX M-GRANDE)
   ========================================================================== */

/* Vértices de la región factible (2 variables) */
function verticesFactibles(modelo) {
    const rest = modelo.rest;
    const lineas = rest.map(r => ({ a1: r.a[0], a2: r.a[1], b: r.b }));
    lineas.push({ a1: 1, a2: 0, b: 0 }, { a1: 0, a2: 1, b: 0 });
    const factible = (x, y) => {
        if (x < -1e-7 || y < -1e-7) return false;
        return rest.every(r => {
            const v = r.a[0] * x + r.a[1] * y;
            return r.tipo === '<=' ? v <= r.b + 1e-6 : (r.tipo === '>=' ? v >= r.b - 1e-6 : Math.abs(v - r.b) < 1e-6);
        });
    };
    const vert = [];
    for (let i = 0; i < lineas.length; i++) for (let j = i + 1; j < lineas.length; j++) {
        const A = lineas[i], B = lineas[j];
        const det = A.a1 * B.a2 - A.a2 * B.a1;
        if (Math.abs(det) < 1e-12) continue;
        const x = (A.b * B.a2 - A.a2 * B.b) / det, y = (A.a1 * B.b - A.b * B.a1) / det;
        if (factible(x, y) && !vert.some(p => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6)) vert.push([x, y]);
    }
    if (vert.length) {
        const cx = vert.reduce((s, p) => s + p[0], 0) / vert.length, cy = vert.reduce((s, p) => s + p[1], 0) / vert.length;
        vert.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
    }
    return { vert, lineas };
}

function obtenerProcedimientoMGrande() {
    const d = obtenerDatosDinamicosTablas();
    const modelo = construirModeloPL(d);
    const res = simplexBigM(modelo.c, modelo.rest, true);
    RESULTADOS.pl = { d, modelo, res, firma: JSON.stringify([d, modelo.rest]) };

    const objetivo = modelo.c.map((v, j) => `${f2(v)} X${j + 1}`).join(' + ');
    const hayArt = res.cols.some(c => c.nombre.startsWith('A'));

    // Forma estándar: cada restricción con sus variables de holgura / exceso / artificial
    const estandarHTML = modelo.rest.map((r, i) => {
        const lhs = r.a.map((v, j) => `${v} X${j + 1}`).join(' + ');
        const v = res.filaVars[i];
        const extra = r.tipo === '<=' ? ` + ${v[0]}` : (r.tipo === '>=' ? ` − ${v[0]} + ${v[1]}` : ` + ${v[0]}`);
        const tipoTxt = r.tipo === '<=' ? 'se suma holgura' : (r.tipo === '>=' ? 'se resta exceso y se suma artificial (−M en Z)' : 'se suma artificial (−M en Z)');
        return `<li><b>${r.nombre}:</b> <code>${lhs}${extra} = ${f2(r.b)}</code> <small>(${tipoTxt})</small></li>`;
    }).join('');

    const baseIni = res.pasos[0] ? res.pasos[0].base.join(', ') : '';
    let calcIni = '';
    if (res.pasos[0]) {
        const p0 = res.pasos[0];
        const cB = p0.base.map(nm => { const c = res.cols.find(x => x.nombre === nm); return fmtM(c.cm, c.ck); });
        calcIni = modelo.nombres.map((nm, j) => {
            const terminos = p0.T.map((f, i) => `(${cB[i]})(${f3(f[j])})`).join(' + ');
            return `<li>Z<sub>${j + 1}</sub> − C<sub>${j + 1}</sub> = Σ c<sub>B</sub>·a<sub>i${j + 1}</sub> − c<sub>${j + 1}</sub> = ${terminos} − (${f2(modelo.c[j])}) = <b>${fmtM(p0.zm[j], p0.zk[j])}</b></li>`;
        }).join('');
    }

    const pasosHTML = res.pasos.map((p, k) => {
        const ultimo = k === res.pasos.length - 1 && p.ent == null;
        return tablaSimplexHTML(p, res.cols, ultimo ? '🏁 Tabla Simplex Óptima Final' : `📊 Tabla Simplex ${k}${k === 0 ? ' (Inicial con Penalización M)' : ''}`);
    }).join('');

    const verifHTML = modelo.rest.map(rr => {
        const lhs = rr.a.reduce((s, v, j) => s + v * res.x[j], 0);
        const expr = rr.a.map((v, j) => `${v}(${f2(res.x[j])})`).join(' + ');
        const simb = rr.tipo === '<=' ? '≤' : (rr.tipo === '>=' ? '≥' : '=');
        const ok = rr.tipo === '<=' ? lhs <= rr.b + 1e-6 : (rr.tipo === '>=' ? lhs >= rr.b - 1e-6 : Math.abs(lhs - rr.b) < 1e-6);
        return `<li><b>${rr.nombre}:</b> ${expr} = ${f3(lhs)} ${simb} ${f2(rr.b)} → ${ok ? '✔ cumple' : '✘ NO cumple'} (${rr.tipo === '>=' ? 'exceso' : 'holgura'} = ${f3(Math.abs(rr.b - lhs))})</li>`;
    }).join('');
    const zExpr = modelo.c.map((v, j) => `${f2(v)}(${f2(res.x[j])})`).join(' + ');

    // Precios sombra (de la fila Z_j − C_j de la tabla final)
    let sombraHTML = '';
    const ult = res.pasos[res.pasos.length - 1];
    if (res.estado === 'optimo' && ult && ult.ent == null) {
        const filas = modelo.rest.map((r, i) => {
            if (r.tipo === '=') return '';
            const idx = res.cols.findIndex(c => c.nombre === res.filaVars[i][0]);
            const y = (r.tipo === '>=' ? -1 : 1) * ult.zk[idx];
            return `<li><b>${r.nombre}:</b> ΔZ por cada +1 en el lado derecho = ${res.filaVars[i][0]} → <b>${f3(y)}</b> (Q por unidad)</li>`;
        }).join('');
        sombraHTML = `<p style="margin-top:8px;"><b>Precios sombra</b> (valor de Z_j − C_j bajo cada variable de holgura/exceso):</p><ul style="margin-left:20px; line-height:1.8;">${filas}</ul>`;
    }

    // Evaluación de vértices (método gráfico, solo 2 variables)
    let verticesHTML = '';
    if (modelo.n === 2) {
        const { vert } = verticesFactibles(modelo);
        if (vert.length) {
            const zs = vert.map(p => modelo.c[0] * p[0] + modelo.c[1] * p[1]);
            const zmax = Math.max(...zs);
            const filas = vert.map((p, k) => `<tr><td>V${k + 1}</td><td>(${f2(p[0])} ; ${f2(p[1])})</td><td>${f2(modelo.c[0])}(${f2(p[0])}) + ${f2(modelo.c[1])}(${f2(p[1])})</td><td>${Math.abs(zs[k] - zmax) < 1e-6 ? `<span class="hl-result">Q ${f2(zs[k])} ★</span>` : 'Q ' + f2(zs[k])}</td></tr>`).join('');
            verticesHTML = `<div class="procedure-step" style="margin-bottom:25px;">
                <h3 style="color:#d32f2f; margin-bottom:10px; font-size:15px;">📐 Verificación gráfica: evaluación de los vértices de la región factible</h3>
                <p>Las intersecciones de las rectas que cumplen todas las restricciones son los vértices; el óptimo está en uno de ellos.</p>
                <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
                <tr style="background:#f2f2f2;"><th>Vértice</th><th>(X₁ ; X₂)</th><th>Z = c₁X₁ + c₂X₂</th><th>Z</th></tr>${filas}</table></div></div>`;
        }
    }

    let conclusion;
    if (res.estado === 'optimo') {
        conclusion = `<div class="procedure-step" style="background:#e8f5e9; padding:18px; border-radius:8px; border:1px solid #a5d6a7;">
            <h3 style="color:#2e7d32; margin-bottom:8px; font-size:15px;">🏁 Solución Óptima</h3>
            <ul style="margin-left:20px; line-height:1.8;">
                ${modelo.nombres.map((nm, j) => `<li><b>X${j + 1}* (${nm}):</b> <span class="hl-result">${f2(res.x[j])} unidades</span></li>`).join('')}
                <li><b>Cálculo:</b> Z = ${zExpr}</li>
                <li><b>Z*:</b> <span class="hl-final">Q ${f2(res.z)}</span></li>
            </ul>
            <p style="margin-top:8px;"><b>Verificación de restricciones (reemplazo de la solución):</b></p>
            <ul style="margin-left:20px; line-height:1.8;">${verifHTML}</ul>
            ${sombraHTML}</div>`;
    } else if (res.estado === 'infactible') {
        conclusion = `<div class="procedure-step" style="background:#ffebee; padding:18px; border-radius:8px;"><b>⚠️ Modelo INFACTIBLE:</b> una variable artificial permanece en la base con valor positivo. Revisa las demandas mínimas y capacidades.</div>`;
    } else {
        conclusion = `<div class="procedure-step" style="background:#fff3e0; padding:18px; border-radius:8px;"><b>⚠️ Modelo NO ACOTADO.</b></div>`;
    }

    return `
        <div class="geo-graph-wrapper">
            <div class="geo-calc-panel" style="font-size:13px; line-height:1.7;">
                ${avisoFuente('pl')}
                <div class="procedure-step" style="margin-bottom:25px;">
                    <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">📌 1. Planteamiento del modelo</h3>
                    ${planteamientoHTML(modelo, false)}
                </div>
                <div class="procedure-step" style="margin-bottom:25px;">
                    <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🧱 2. Forma estándar (Método de la Gran M)</h3>
                    <div class="formula-box">Max Z = ${objetivo}${hayArt ? ' − M ΣAᵢ' : ''}</div>
                    <p style="margin-top:8px;">Cada restricción se convierte en igualdad:</p>
                    <ol style="margin-left:20px;">${estandarHTML}</ol>
                    <p><b>Base inicial:</b> ${baseIni} &nbsp;|&nbsp; <b>Z<sub>j</sub> − C<sub>j</sub> inicial</b> (c<sub>B</sub> = −M para artificiales, 0 para holguras):</p>
                    <ul style="margin-left:20px;">${calcIni}</ul>
                </div>
                ${pasosHTML}
                ${verticesHTML}
                ${conclusion}
            </div>
            <div class="geo-canvas-panel">
                <h4 style="color:#d32f2f; font-size:14px; margin-bottom:10px;">📐 Plano GeoGebra - Región Factible y Óptimo</h4>
                <canvas id="geogebraCanvas" style="max-height:300px; width:100%;"></canvas>
            </div>
        </div>
        <div style="margin-top:20px;">
            <h4 style="color:#d32f2f; font-size:14px;">🕸️ Red Estructural del Modelo Lineal:</h4>
            <div id="visGraphPL" class="graph-vis-container"></div>
        </div>`;
}

/* ==========================================================================
   4. PROGRAMACIÓN ENTERA (BRANCH & BOUND real sobre el simplex)
   ========================================================================== */

function branchAndBound(c, rest) {
    const n = c.length;
    let mejor = { z: -Infinity, x: null, id: null };
    const nodos = [];
    let id = 0;

    function resolver(restN, padre, etiqueta, ramas) {
        if (nodos.length > 300) return;
        const myId = id++;
        const r = simplexBigM(c, restN, true);
        const nodo = { id: myId, padre, etiqueta, ramas: [...ramas], estado: r.estado, cota: mejor.z, pasos: r.pasos, cols: r.cols };
        nodos.push(nodo);
        if (r.estado !== 'optimo') {
            nodo.nota = 'Infactible';
            nodo.decision = `El subproblema es ${r.estado === 'infactible' ? 'INFACTIBLE' : 'NO ACOTADO'} → no genera soluciones válidas: se <b>poda</b>.`;
            return;
        }
        nodo.x = r.x; nodo.z = r.z;
        if (r.z <= mejor.z + 1e-7) {
            nodo.nota = 'Podado';
            nodo.decision = `Z = ${f2(r.z)} ≤ mejor entera conocida (${f2(mejor.z)}) → ninguna solución de esta rama puede superarla: se <b>poda por cota</b>.`;
            return;
        }
        const k = r.x.findIndex(v => Math.abs(v - Math.round(v)) > 1e-6);
        if (k < 0) {
            nodo.nota = 'Entero';
            nodo.decision = `Todas las variables son enteras → es una solución entera factible. ${mejor.x ? `Mejora la anterior (${f2(mejor.z)}) → nueva <b>incumbente</b>.` : 'Primera solución entera encontrada → se guarda como <b>incumbente</b>.'}`;
            mejor = { z: r.z, x: r.x.map(Math.round), id: myId };
            return;
        }
        const a = Array(n).fill(0); a[k] = 1;
        const fl = Math.floor(r.x[k]);
        nodo.ramifica = { k, val: r.x[k], fl };
        nodo.decision = `X${k + 1} = ${f3(r.x[k])} no es entera → se ramifica creando dos subproblemas: <b>X${k + 1} ≤ ${fl}</b> y <b>X${k + 1} ≥ ${fl + 1}</b>. Cota superior de esta rama: Z = ${f2(r.z)}.`;
        resolver([...restN, { nombre: `X${k + 1} ≤ ${fl}`, a: [...a], tipo: '<=', b: fl }], myId, `X${k + 1} ≤ ${fl}`, [...ramas, `X${k + 1} ≤ ${fl}`]);
        resolver([...restN, { nombre: `X${k + 1} ≥ ${fl + 1}`, a: [...a], tipo: '>=', b: fl + 1 }], myId, `X${k + 1} ≥ ${fl + 1}`, [...ramas, `X${k + 1} ≥ ${fl + 1}`]);
    }
    resolver(rest, null, 'Raíz', []);
    return { mejor, nodos };
}

function bloqueNodoHTML(nd, modelo, mejorId) {
    const esMejor = nd.id === mejorId;
    const color = esMejor ? '#2e7d32' : (nd.estado !== 'optimo' ? '#c62828' : '#d32f2f');
    const solTxt = nd.x ? modelo.nombres.map((nm, j) => `X${j + 1} (${nm}) = <b>${f3(nd.x[j])}</b>`).join(', ') + ` → Z = ${modelo.c.map((v, j) => `${f2(v)}(${f3(nd.x[j])})`).join(' + ')} = <b>Q ${f2(nd.z)}</b>` : '—';
    const tablas = nd.pasos.map((p, k) => tablaSimplexHTML(p, nd.cols, `Nodo ${nd.id} · Tabla Simplex ${k}${k === 0 ? ' (inicial)' : (k === nd.pasos.length - 1 && p.ent == null ? ' (final)' : '')}`)).join('');
    return `
        <div class="procedure-step" style="margin-bottom:18px; padding:12px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; line-height:1.7;">
            <h4 style="color:${color}; margin-bottom:6px;">Nodo ${nd.id}${nd.padre === null ? ' (Relajación lineal)' : ` · hijo del nodo ${nd.padre} · rama ${nd.etiqueta}`}${esMejor ? ' ★ MEJOR ENTERA' : ''}</h4>
            <p><b>Subproblema:</b> modelo original${nd.ramas.length ? ' + ' + nd.ramas.map(r => `<code>${r}</code>`).join(' + ') : ' sin restricciones de ramificación (se ignora la integralidad)'}.</p>
            <p><b>Solución simplex:</b> ${solTxt}</p>
            <p><b>Decisión:</b> ${nd.decision}</p>
            <details ${nd.id === 0 ? 'open' : ''}><summary style="cursor:pointer; color:#1976d2;">📊 Ver tablas Simplex de este nodo (${nd.pasos.length})</summary>${tablas}</details>
        </div>`;
}

function obtenerProcedimientoEntera() {
    const d = obtenerDatosDinamicosTablas();
    const modelo = construirModeloPL(d);
    const relajado = simplexBigM(modelo.c, modelo.rest, false);
    const bb = branchAndBound(modelo.c, modelo.rest);
    RESULTADOS.entera = { d, modelo, relajado, bb, firma: JSON.stringify([d, modelo.rest]) };

    if (relajado.estado !== 'optimo' || !bb.mejor.x) {
        return `${avisoFuente('pl')}<div class="procedure-step"><b>⚠️ No existe solución entera factible</b> (estado del modelo relajado: ${relajado.estado}).</div>
                <div id="visGraphEntera" class="graph-vis-container"></div>`;
    }

    const yaEntera = relajado.x.every(v => Math.abs(v - Math.round(v)) < 1e-6);
    const filasNodos = bb.nodos.map(nd => `<tr>
        <td>${nd.id}</td><td>${nd.padre === null ? '—' : nd.padre}</td><td>${nd.etiqueta}</td>
        <td>${nd.x ? '(' + nd.x.map(v => f2(v)).join(' ; ') + ')' : '—'}</td>
        <td>${nd.z !== undefined ? 'Q ' + f2(nd.z) : '—'}</td>
        <td>${nd.id === bb.mejor.id ? '<span class="hl-result">Entero ★ mejor</span>' : (nd.nota || 'Ramifica')}</td></tr>`).join('');

    const verif = modelo.rest.filter(r => !r.nombre.includes('≤ ') || r.nombre.startsWith('Volumen') || r.nombre.startsWith('Horas') || r.nombre.startsWith('Demanda')).map(rr => {
        const lhs = rr.a.reduce((s, v, j) => s + v * bb.mejor.x[j], 0);
        const expr = rr.a.map((v, j) => `${v}(${bb.mejor.x[j]})`).join(' + ');
        const simb = rr.tipo === '<=' ? '≤' : (rr.tipo === '>=' ? '≥' : '=');
        const ok = rr.tipo === '<=' ? lhs <= rr.b + 1e-6 : (rr.tipo === '>=' ? lhs >= rr.b - 1e-6 : Math.abs(lhs - rr.b) < 1e-6);
        return `<li><b>${rr.nombre}:</b> ${expr} = ${f3(lhs)} ${simb} ${f2(rr.b)} → ${ok ? '✔ cumple' : '✘ NO cumple'}</li>`;
    }).join('');

    const perdida = relajado.z - bb.mejor.z;
    const raiz = bb.nodos[0];

    return `
        ${avisoFuente('pl')}
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">📌 1. Planteamiento (Programación Lineal Entera)</h3>
            ${planteamientoHTML(modelo, true)}
            <p style="margin-top:8px;"><b>Método:</b> Ramificación y Acotamiento (Branch &amp; Bound). Se resuelve la <i>relajación lineal</i> (sin exigir enteros) con el Simplex; si alguna variable sale fraccionaria se crean dos subproblemas con <code>X ≤ ⌊v⌋</code> y <code>X ≥ ⌈v⌉</code>. Una rama se poda si es infactible, si su Z no supera la mejor solución entera (cota) o si ya es entera.</p>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🔢 2. Relajación Lineal (Nodo 0)</h3>
            <p>Solución continua: ${modelo.nombres.map((nm, j) => `<b>X${j + 1}</b> (${nm}) = ${f2(relajado.x[j])}`).join(', ')} — Z = Q ${f2(relajado.z)} (cota superior del problema entero).</p>
            <p>${yaEntera ? 'La solución relajada ya es entera: Branch & Bound termina en el nodo raíz.' : `La solución relajada NO es entera: se ramifica sobre la primera variable fraccionaria${raiz.ramifica ? ` (X${raiz.ramifica.k + 1} = ${f3(raiz.ramifica.val)} → X${raiz.ramifica.k + 1} ≤ ${raiz.ramifica.fl} ó X${raiz.ramifica.k + 1} ≥ ${raiz.ramifica.fl + 1})` : ''}.`}</p>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🌳 3. Desarrollo detallado de cada nodo (con sus tablas Simplex)</h3>
            ${bb.nodos.map(nd => bloqueNodoHTML(nd, modelo, bb.mejor.id)).join('')}
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">📋 4. Resumen de nodos explorados</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px;">
                <tr style="background:#f2f2f2;"><th>Nodo</th><th>Padre</th><th>Rama</th><th>Solución</th><th>Z</th><th>Estado</th></tr>${filasNodos}
            </table></div>
        </div>
        <div class="procedure-step" style="background:#e8f5e9; padding:18px; border-radius:8px; border:1px solid #a5d6a7; margin-bottom:20px; font-size:13px; line-height:1.7;">
            <h3 style="color:#2e7d32; margin-bottom:8px; font-size:15px;">🏁 Solución Entera Óptima Definitiva</h3>
            <ul style="margin-left:20px; line-height:1.8;">
                ${modelo.nombres.map((nm, j) => `<li><b>X${j + 1}* (${nm}):</b> <span class="hl-result">${bb.mejor.x[j]} unidades enteras</span></li>`).join('')}
                <li><b>Cálculo:</b> Z = ${modelo.c.map((v, j) => `${f2(v)}(${bb.mejor.x[j]})`).join(' + ')}</li>
                <li><b>Ganancia Total Z* Entera:</b> <span class="hl-final">Q ${f2(bb.mejor.z)}</span></li>
                <li><b>Costo de exigir enteros:</b> Z<sub>LP</sub> − Z<sub>entera</sub> = ${f2(relajado.z)} − ${f2(bb.mejor.z)} = Q ${f2(perdida)}</li>
            </ul>
            <p style="margin-top:8px;"><b>Verificación de restricciones con la solución entera:</b></p>
            <ul style="margin-left:20px; line-height:1.8;">${verif}</ul>
        </div>
        <div>
            <h4 style="color:#d32f2f; font-size:14px;">🕸️ Árbol de Ramificación (Branch & Bound):</h4>
            <div id="visGraphEntera" class="graph-vis-container"></div>
        </div>`;
}

/* ==========================================================================
   5. TRANSPORTE: Esquina Noroeste + MODI (iterativo, con balanceo y detalle)
   ========================================================================== */

function _transporteValido(o) {
    return !!(o && Array.isArray(o.ofertas) && Array.isArray(o.demandas) && Array.isArray(o.costos)
        && o.ofertas.length > 0 && o.demandas.length > 0
        && (!Array.isArray(o.origenes) || o.origenes.length === o.ofertas.length)
        && (!Array.isArray(o.destinos) || o.destinos.length === o.demandas.length)
        && o.ofertas.every(v => Number.isFinite(Number(v)) && Number(v) >= 0)
        && o.demandas.every(v => Number.isFinite(Number(v)) && Number(v) >= 0)
        && o.costos.length === o.ofertas.length
        && o.costos.every(f => Array.isArray(f) && f.length === o.demandas.length
            && f.every(v => Number.isFinite(Number(v)))));
}

function _completarTransporte(o, fuente) {
    if (!_transporteValido(o)) throw new Error('El modelo de transporte tiene datos faltantes o dimensiones incompatibles.');
    const ofertas = o.ofertas.map(Number), demandas = o.demandas.map(Number), costos = o.costos.map(f => f.map(Number));
    const origenes = ofertas.map((_, i) => (o.origenes && o.origenes[i]) || `Origen ${i + 1}`);
    const destinos = demandas.map((_, j) => (o.destinos && o.destinos[j]) || `Destino ${j + 1}`);
    let nota = o.notaDatos || '';
    FUENTES.transporte = fuente;
    return { origenes, destinos, ofertas, demandas, costos, notaDatos: nota.trim() };
}

function leerDatosTransporte() {
    if (_transporteValido(window.datosTransporte)) return _completarTransporte(window.datosTransporte, 'window.datosTransporte');
    FUENTES.transporte = 'SIN DATOS';
    throw new Error('No hay un modelo de transporte extraído y completo.');
}

function buscarCiclo(r0, c0, basicas, m, n) {
    const camino = [[r0, c0]];
    const enCamino = (r, c) => camino.some(p => p[0] === r && p[1] === c);
    function dfs(r, c, horizontal) {
        if (!horizontal) {
            if (c === c0 && camino.length >= 4) return true;
            for (let rr = 0; rr < m; rr++) {
                if (rr === r || !basicas.has(rr + ',' + c) || enCamino(rr, c)) continue;
                camino.push([rr, c]);
                if (dfs(rr, c, true)) return true;
                camino.pop();
            }
        } else {
            for (let cc = 0; cc < n; cc++) {
                if (cc === c || !basicas.has(r + ',' + cc) || enCamino(r, cc)) continue;
                camino.push([r, cc]);
                if (dfs(r, cc, false)) return true;
                camino.pop();
            }
        }
        return false;
    }
    return dfs(r0, c0, true) ? camino : null;
}

function resolverTransporte(dt) {
    let O = [...dt.ofertas], D = [...dt.demandas];
    let C = dt.costos.map(r => [...r]);
    const on = [...dt.origenes], dn = [...dt.destinos];
    const sO = sumar(O), sD = sumar(D);
    let nota = dt.notaDatos || '';
    if (sO > sD + EPS) {
        D.push(sO - sD); dn.push('Ficticio'); C.forEach(r => r.push(0));
        nota += ` Oferta (${f3(sO)}) > Demanda (${f3(sD)}): se agrega un destino ficticio con demanda ${f3(sO - sD)} y costos 0.`;
    } else if (sD > sO + EPS) {
        O.push(sD - sO); on.push('Ficticio'); C.push(Array(D.length).fill(0));
        nota += ` Demanda (${f3(sD)}) > Oferta (${f3(sO)}): se agrega un origen ficticio con oferta ${f3(sD - sO)} y costos 0.`;
    }
    const m = O.length, n = D.length;

    // ---- Esquina Noroeste ----
    const X = Array.from({ length: m }, () => Array(n).fill(0));
    const basicas = new Set();
    const pasosENO = [];
    const o = [...O], d = [...D];
    let i = 0, j = 0;
    while (i < m && j < n) {
        const q = Math.min(o[i], d[j]);
        pasosENO.push({ i, j, q, oAntes: o[i], dAntes: d[j], oDesp: o[i] - q, dDesp: d[j] - q });
        X[i][j] = q; basicas.add(i + ',' + j);
        o[i] -= q; d[j] -= q;
        const oc = o[i] < EPS, dc = d[j] < EPS;
        if (oc && dc) { if (i < m - 1 && j < n - 1) i++; else { i++; j++; } }
        else if (oc) i++;
        else j++;
    }
    const costo = (M) => M.reduce((s, fila, r) => s + fila.reduce((s2, v, c) => s2 + v * C[r][c], 0), 0);
    const Zinicial = costo(X);
    const Xinicial = X.map(f => [...f]);
    const nBasicasIni = basicas.size;

    // ---- MODI ----
    const iteraciones = [];
    for (let it = 0; it < 60; it++) {
        const u = Array(m).fill(null), v = Array(n).fill(null);
        const ecuaciones = [];
        u[0] = 0; ecuaciones.push(`u1 = 0 (se fija arbitrariamente)`);
        for (let guard = 0; guard < m + n + 2; guard++) {
            let cambio = true;
            while (cambio) {
                cambio = false;
                basicas.forEach(k => {
                    const [r, c] = k.split(',').map(Number);
                    if (u[r] !== null && v[c] === null) {
                        v[c] = C[r][c] - u[r];
                        ecuaciones.push(`Básica (${on[r]}, ${dn[c]}): u${r + 1} + v${c + 1} = ${f3(C[r][c])} → v${c + 1} = ${f3(C[r][c])} − ${f3(u[r])} = <b>${f3(v[c])}</b>`);
                        cambio = true;
                    } else if (u[r] === null && v[c] !== null) {
                        u[r] = C[r][c] - v[c];
                        ecuaciones.push(`Básica (${on[r]}, ${dn[c]}): u${r + 1} + v${c + 1} = ${f3(C[r][c])} → u${r + 1} = ${f3(C[r][c])} − ${f3(v[c])} = <b>${f3(u[r])}</b>`);
                        cambio = true;
                    }
                });
            }
            const iu = u.indexOf(null), iv = v.indexOf(null);
            if (iu < 0 && iv < 0) break;
            if (iu >= 0) { u[iu] = 0; ecuaciones.push(`(Base degenerada) u${iu + 1} = 0`); }
            else { v[iv] = 0; ecuaciones.push(`(Base degenerada) v${iv + 1} = 0`); }
        }

        let minD = -1e-7, ent = null;
        const delta = Array.from({ length: m }, () => Array(n).fill(null));
        const deltaLista = [];
        for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) {
            if (basicas.has(r + ',' + c)) continue;
            delta[r][c] = C[r][c] - u[r] - v[c];
            deltaLista.push(`Δ(${on[r]}, ${dn[c]}) = c − u${r + 1} − v${c + 1} = ${f3(C[r][c])} − (${f3(u[r])}) − (${f3(v[c])}) = <b>${f3(delta[r][c])}</b>`);
            if (delta[r][c] < minD) { minD = delta[r][c]; ent = [r, c]; }
        }
        const iter = { u: [...u], v: [...v], delta, ent, ecuaciones, deltaLista, Z: costo(X), X: X.map(f => [...f]), basicas: new Set(basicas) };
        iteraciones.push(iter);
        if (!ent) break;

        const ciclo = buscarCiclo(ent[0], ent[1], basicas, m, n);
        if (!ciclo) { iter.errorCiclo = true; break; }
        let theta = Infinity, sale = null;
        ciclo.forEach((p, idx) => {
            if (idx % 2 === 1 && X[p[0]][p[1]] < theta - EPS) { theta = X[p[0]][p[1]]; sale = p; }
        });
        iter.ciclo = ciclo.map((p, idx) => ({ r: p[0], c: p[1], signo: idx % 2 === 0 ? '+' : '−', val: X[p[0]][p[1]] }));
        iter.theta = theta; iter.sale = sale; iter.deltaEnt = minD;
        iter.Znueva = iter.Z + theta * minD;
        ciclo.forEach((p, idx) => { X[p[0]][p[1]] += (idx % 2 === 0 ? theta : -theta); });
        basicas.add(ent[0] + ',' + ent[1]);
        basicas.delete(sale[0] + ',' + sale[1]);
    }
    return { on, dn, O, D, C, m, n, nota: nota.trim(), Xinicial, Zinicial, X, Z: costo(X), iteraciones, sO, sD, pasosENO, nBasicasIni };
}

function tablaTransporteHTML(r, M, resaltar) {
    const head = `<tr style="background:#f2f2f2;"><th>Orígenes / Destinos</th>${r.dn.map(x => `<th>${x}</th>`).join('')}<th>Oferta</th></tr>`;
    const filas = r.on.map((nombre, i) => `<tr><td><b>${nombre}</b></td>${r.dn.map((_, j) => {
        const cel = `Q${f2(r.C[i][j])} [${f3(M[i][j])}]`;
        return `<td>${resaltar && M[i][j] > EPS ? `<span class="hl-result">${cel}</span>` : cel}</td>`;
    }).join('')}<td><b>${f3(r.O[i])}</b></td></tr>`).join('');
    const pie = `<tr style="background:#fafafa;"><th>Demanda</th>${r.D.map(x => `<th>${f3(x)}</th>`).join('')}<th>Σ = ${f3(sumar(r.O))}</th></tr>`;
    return `<div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:10px;">${head}${filas}${pie}</table></div>`;
}

function tablaDeltasHTML(r, it) {
    const head = `<tr style="background:#f2f2f2;"><th>Δᵢⱼ = cᵢⱼ − uᵢ − vⱼ</th>${r.dn.map((x, j) => `<th>${x}<br><small>v${j + 1} = ${f3(it.v[j])}</small></th>`).join('')}</tr>`;
    const filas = r.on.map((nm, i) => `<tr><td><b>${nm}</b><br><small>u${i + 1} = ${f3(it.u[i])}</small></td>${r.dn.map((_, j) => {
        if (it.basicas.has(i + ',' + j)) return `<td style="background:#f5f5f5;">básica</td>`;
        const dl = it.delta[i][j];
        return `<td>${dl < -1e-7 ? `<span class="hl-alert">${f3(dl)}</span>` : f3(dl)}</td>`;
    }).join('')}</tr>`).join('');
    return `<div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:10px;">${head}${filas}</table></div>`;
}

function formulaCosto(r, M) {
    const t = [];
    M.forEach((fila, i) => fila.forEach((q, j) => { if (q > EPS) t.push(`(${f3(q)} × ${f2(r.C[i][j])})`); }));
    return t.join(' + ');
}

function obtenerProcedimientoMODI() {
    const dt = leerDatosTransporte();
    const r = resolverTransporte(dt);
    RESULTADOS.transporte = r;

    // Protocolo vial: solo si la interfaz lo entrega (ya no es un texto fijo)
    const ev = window.estadoVial;
    const protocoloHTML = ev ? `
        <div class="procedure-step" style="background:#fff3e0; border-left:4px solid #f57c00; margin-bottom:25px;">
            <h3 style="color:#e65100; margin-bottom:8px; font-size:15px;">📡 Protocolo de Contingencia Vial Logística</h3>
            <p><b>${ev.tipo || ''}</b></p>
            <p style="margin-top:6px; color:#444; font-size:12.5px;">${ev.detalle || ''}</p>
            <ul style="margin-left:20px; line-height:1.7; margin-top:8px;">${(ev.acciones || []).map(a => `<li>${a}</li>`).join('')}</ul>
        </div>` : '';

    const pasosENOHTML = r.pasosENO.map((p, k) =>
        `<li>Paso ${k + 1}: celda (${r.on[p.i]}, ${r.dn[p.j]}) → min(oferta ${f3(p.oAntes)}, demanda ${f3(p.dAntes)}) = <b>${f3(p.q)}</b>. Quedan: oferta ${f3(p.oDesp)}, demanda ${f3(p.dDesp)}.</li>`).join('');

    const iterHTML = r.iteraciones.map((it, k) => {
        let cierre;
        if (it.ent) {
            const ciclo = it.ciclo ? it.ciclo.map(p => `(${r.on[p.r]}, ${r.dn[p.c]}) [${p.signo}${p.signo === '−' ? f3(p.val) : ''}]`).join(' → ') : '';
            const negativas = it.ciclo ? it.ciclo.filter(p => p.signo === '−').map(p => f3(p.val)) : [];
            cierre = it.errorCiclo
                ? `<p><span class="hl-alert">No se pudo formar el ciclo de la celda entrante (base degenerada).</span></p>`
                : `<p style="margin-top:8px;"><b>Celda que entra:</b> (${r.on[it.ent[0]]}, ${r.dn[it.ent[1]]}) con Δ = ${f3(it.deltaEnt)} (el más negativo).</p>
                   <p><b>Ciclo cerrado (+/−):</b> ${ciclo}</p>
                   <p><b>θ</b> = mín{ celdas con (−) } = mín{ ${negativas.join(', ')} } = <span class="hl-result">${f3(it.theta)}</span> → sale (${r.on[it.sale[0]]}, ${r.dn[it.sale[1]]}).</p>
                   <p>Se suma θ a las celdas (+) y se resta a las celdas (−) del ciclo.</p>
                   <p><b>Nuevo costo:</b> Z = Z_anterior + θ·Δ = ${f2(it.Z)} + (${f3(it.theta)} × ${f3(it.deltaEnt)}) = <span class="hl-final">Q ${f2(it.Znueva)}</span></p>`;
        } else {
            let alt = '';
            for (let a = 0; a < r.m; a++) for (let b2 = 0; b2 < r.n; b2++) {
                if (!it.basicas.has(a + ',' + b2) && it.delta[a][b2] !== null && Math.abs(it.delta[a][b2]) < 1e-7) alt = ' Nota: existe al menos una celda no básica con Δ = 0 → hay soluciones óptimas alternativas con el mismo costo.';
            }
            cierre = `<p style="margin-top:8px;"><span class="hl-result">Todos los Δᵢⱼ ≥ 0 → la solución actual es ÓPTIMA.</span>${alt}</p>`;
        }
        return `
        <div class="procedure-step" style="margin-top:12px;">
            <h4 style="color:#d32f2f; margin-bottom:8px;">Iteración ${k} — Z actual = Q ${f2(it.Z)}</h4>
            <p><b>Asignación actual:</b></p>${tablaTransporteHTML(r, it.X, true)}
            <p style="margin-top:6px;"><b>Costo:</b> Z = ${formulaCosto(r, it.X)} = <b>Q ${f2(it.Z)}</b></p>
            <p style="margin-top:10px;"><b>a) Multiplicadores (u<sub>i</sub> + v<sub>j</sub> = c<sub>ij</sub> en celdas básicas):</b></p>
            <ul style="margin-left:20px;">${it.ecuaciones.map(e => `<li>${e}</li>`).join('')}</ul>
            <p style="margin-top:10px;"><b>b) Costos reducidos de las celdas NO básicas:</b></p>
            <ul style="margin-left:20px;">${it.deltaLista.map(e => `<li>${e}</li>`).join('')}</ul>
            ${tablaDeltasHTML(r, it)}
            <p style="margin-top:10px;"><b>c) Prueba de optimalidad y mejora:</b></p>
            ${cierre}
        </div>`;
    }).join('');

    const ahorro = r.Zinicial - r.Z;
    const datosHTML = `<p style="margin-top:6px;"><b>Datos del problema:</b> ${r.on.map((nm, i) => `${nm} (oferta ${f3(r.O[i])})`).join(', ')}; ${r.dn.map((nm, j) => `${nm} (demanda ${f3(r.D[j])})`).join(', ')}.</p>`;

    return `
        ${avisoFuente('transporte')}
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">📦 1. ASIGNACIÓN INICIAL (Esquina Noroeste - Total: ${f3(r.sO)} unidades)</h3>
            ${datosHTML}
            <p><b>Balanceo:</b> Σ Oferta = ${f3(r.sO)}, Σ Demanda = ${f3(r.sD)} → ${Math.abs(r.sO - r.sD) < EPS ? 'problema balanceado.' : 'se requiere elemento ficticio.'}</p>
            ${r.nota ? `<p><i>${r.nota}</i></p>` : ''}
            <ol style="margin-left:20px; margin-top:8px;">${pasosENOHTML}</ol>
            ${tablaTransporteHTML(r, r.Xinicial, true)}
            <p style="margin-top:8px;"><b>Verificación:</b> celdas básicas = ${r.nBasicasIni}; se requieren m + n − 1 = ${r.m} + ${r.n} − 1 = ${r.m + r.n - 1}.</p>
            <p style="margin-top:6px;"><b>Fórmula:</b> Z_ENO = ${formulaCosto(r, r.Xinicial)}</p>
            <p style="margin-top:6px;"><b>Costo inicial Z_ENO:</b> <span class="hl-final">Q ${f2(r.Zinicial)}</span></p>
        </div>

        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">⚙️ 2. EVALUACIÓN MODI (u<sub>i</sub> + v<sub>j</sub> = c<sub>ij</sub>) — ${r.iteraciones.length} iteración(es)</h3>
            ${iterHTML}
        </div>

        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🚀 3. MATRIZ ÓPTIMA FINAL Y COSTO MÍNIMO</h3>
            ${tablaTransporteHTML(r, r.X, true)}
            <p style="margin-top:12px;"><b>Fórmula:</b> Z* = ${formulaCosto(r, r.X)}</p>
            <p style="margin-top:6px;"><b>Costo Mínimo Óptimo Z*:</b> <span class="hl-final">Q ${f2(r.Z)}</span></p>
            <p style="margin-top:6px;"><b>Ahorro frente a la solución inicial:</b> ${f2(r.Zinicial)} − ${f2(r.Z)} = <span class="hl-result">Q ${f2(ahorro)}</span></p>
        </div>

        ${protocoloHTML}

        <div>
            <h4 style="color:#d32f2f; font-size:14px;">🕸️ Red de Distribución Logística Óptima:</h4>
            <div id="visGraphTransporte" class="graph-vis-container"></div>
        </div>`;
}

/* ==========================================================================
   6. MÉTODO HÚNGARO CLÁSICO (asignación) con cobertura de ceros paso a paso
   ========================================================================== */

function _asignacionValida(o) {
    return !!(o && Array.isArray(o.costos) && o.costos.length > 0
        && o.costos.every(f => Array.isArray(f) && f.length === o.costos[0].length
            && f.length > 0 && f.every(v => Number.isFinite(Number(v)))));
}

function leerDatosAsignacion() {
    const completar = (o, fuente) => {
        FUENTES.hungaro = fuente;
        const nF = o.costos.length, nC = Math.max(...o.costos.map(f => f.length));
        const filas = Array.from({ length: nF }, (_, i) => (o.filas && o.filas[i]) || `Fila ${i + 1}`);
        const columnas = Array.from({ length: nC }, (_, j) => (o.columnas && o.columnas[j]) || `Col ${j + 1}`);
        const costos = o.costos.map(f => Array.from({ length: nC }, (_, j) => Number(f[j])));
        return { filas, columnas, costos, unidad: o.unidad || 'min', maximizar: !!o.maximizar };
    };
    if (_asignacionValida(window.datosAsignacion)) return completar(window.datosAsignacion, 'window.datosAsignacion');
    FUENTES.hungaro = 'SIN DATOS';
    throw new Error('No hay un modelo de asignación extraído y completo.');
}

/* Emparejamiento máximo sobre ceros + cobertura mínima de ceros (teorema de König) */
function _coberturaCeros(R, n) {
    const matchC = Array(n).fill(-1);
    const intentar = (i, vis) => {
        for (let j = 0; j < n; j++) {
            if (Math.abs(R[i][j]) < 1e-9 && !vis[j]) {
                vis[j] = true;
                if (matchC[j] < 0 || intentar(matchC[j], vis)) { matchC[j] = i; return true; }
            }
        }
        return false;
    };
    let tam = 0;
    for (let i = 0; i < n; i++) if (intentar(i, Array(n).fill(false))) tam++;
    const matchF = Array(n).fill(-1);
    matchC.forEach((i, j) => { if (i >= 0) matchF[i] = j; });
    const visF = Array(n).fill(false), visC = Array(n).fill(false);
    const dfs = (i) => {
        visF[i] = true;
        for (let j = 0; j < n; j++) {
            if (Math.abs(R[i][j]) < 1e-9 && !visC[j]) {
                visC[j] = true;
                if (matchC[j] >= 0 && !visF[matchC[j]]) dfs(matchC[j]);
            }
        }
    };
    for (let i = 0; i < n; i++) if (matchF[i] < 0 && !visF[i]) dfs(i);
    return { filasCub: visF.map(v => !v), colsCub: visC, lineas: tam, matchC };
}

function resolverHungaro(dt) {
    const filasN = dt.costos.length, colsN = dt.costos[0].length;
    const n = Math.max(filasN, colsN);
    const nombresF = [...dt.filas], nombresC = [...dt.columnas];
    while (nombresF.length < n) nombresF.push('Ficticia');
    while (nombresC.length < n) nombresC.push('Ficticia');
    const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (dt.costos[i] && dt.costos[i][j] !== undefined) ? dt.costos[i][j] : 0));

    // Maximización: se convierte a minimización restando cada valor del máximo
    const mx = Math.max(...M.flat());
    const A = dt.maximizar ? M.map(f => f.map(x => limpio(mx - x))) : M.map(f => [...f]);

    const minFilas = A.map(f => Math.min(...f));
    const redFilas = A.map((f, i) => f.map(x => limpio(x - minFilas[i])));
    const minCols = Array.from({ length: n }, (_, j) => Math.min(...redFilas.map(f => f[j])));
    const redCols = redFilas.map(f => f.map((x, j) => limpio(x - minCols[j])));

    // Iteraciones: cubrir ceros con el mínimo de líneas; si < n, ajustar la matriz
    const iteraciones = [];
    let R = redCols.map(f => [...f]);
    let asign = null;
    for (let it = 0; it < n * n + 10; it++) {
        const cov = _coberturaCeros(R, n);
        const paso = { R: R.map(f => [...f]), filasCub: cov.filasCub, colsCub: cov.colsCub, lineas: cov.lineas };
        if (cov.lineas >= n) {
            asign = Array(n).fill(-1);
            cov.matchC.forEach((i, j) => { if (i >= 0) asign[i] = j; });
            paso.final = true;
            iteraciones.push(paso);
            break;
        }
        let mn = Infinity;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!cov.filasCub[i] && !cov.colsCub[j]) mn = Math.min(mn, R[i][j]);
        paso.mn = mn;
        iteraciones.push(paso);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            if (!cov.filasCub[i] && !cov.colsCub[j]) R[i][j] = limpio(R[i][j] - mn);
            else if (cov.filasCub[i] && cov.colsCub[j]) R[i][j] = limpio(R[i][j] + mn);
        }
    }
    if (!asign) asign = Array.from({ length: n }, (_, i) => i);
    const total = asign.reduce((s, j, i) => s + M[i][j], 0);
    return { n, nombresF, nombresC, M, A, minFilas, minCols, redFilas, redCols, iteraciones, asign, total, unidad: dt.unidad, maximizar: dt.maximizar, mx };
}

function tablaMatrizHTML(nF, nC, M, opt) {
    opt = opt || {};
    const fc = opt.filasCub || [], cc = opt.colsCub || [], marcar = opt.marcar;
    const head = `<tr style="background:#f2f2f2;"><th></th>${nC.map((c, j) => `<th${cc[j] ? ' style="background:#fff9c4;"' : ''}>${c}${cc[j] ? ' ┃' : ''}</th>`).join('')}</tr>`;
    const filas = M.map((f, i) => `<tr><td${fc[i] ? ' style="background:#fff9c4;"' : ''}><b>${nF[i]}</b>${fc[i] ? ' ━' : ''}</td>${f.map((v, j) => {
        let st = (fc[i] || cc[j]) ? ' style="background:#fffde7;"' : '';
        let txt = f3(v);
        if (marcar && marcar[i] === j) txt = `<span class="hl-result">${txt}</span>`;
        else if (opt.resaltarCeros && Math.abs(v) < 1e-9) txt = `<b style="color:#d32f2f;">${txt}</b>`;
        return `<td${st}>${txt}</td>`;
    }).join('')}</tr>`).join('');
    return `<div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:10px;">${head}${filas}</table></div>`;
}

function obtenerProcedimientoHungaro() {
    const dt = leerDatosAsignacion();
    const r = resolverHungaro(dt);
    RESULTADOS.hungaro = r;

    const itHTML = r.iteraciones.map((p, k) => {
        const fc = r.nombresF.filter((_, i) => p.filasCub[i]), cc = r.nombresC.filter((_, j) => p.colsCub[j]);
        let txt = `<p><b>Líneas mínimas para cubrir todos los ceros:</b> ${p.lineas} (${fc.length ? 'filas: ' + fc.join(', ') : 'sin filas'}${cc.length ? '; columnas: ' + cc.join(', ') : ''}).</p>`;
        if (p.final) {
            txt += `<p><span class="hl-result">${p.lineas} líneas = n = ${r.n} → existe una asignación óptima sobre los ceros.</span></p>`;
        } else {
            txt += `<p>${p.lineas} líneas &lt; n = ${r.n} → <b>aún no es óptima</b>. Menor valor no cubierto = <b>${f3(p.mn)}</b>: se resta a los elementos no cubiertos y se suma a los cubiertos dos veces (intersecciones).</p>`;
        }
        return `<div class="procedure-step" style="margin-top:12px;">
            <h4 style="color:#d32f2f; margin-bottom:4px;">Iteración ${k + 1}</h4>
            ${tablaMatrizHTML(r.nombresF, r.nombresC, p.R, { filasCub: p.filasCub, colsCub: p.colsCub, resaltarCeros: true, marcar: p.final ? r.asign : null })}
            ${txt}</div>`;
    }).join('');

    return `
        ${avisoFuente('hungaro')}
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">👥 1. INICIO: Matriz de ${r.maximizar ? 'Beneficios' : 'Costos'} Original (${r.n}×${r.n})</h3>
            ${tablaMatrizHTML(r.nombresF, r.nombresC, r.M)}
            ${r.maximizar ? `<p style="margin-top:8px;">Es un problema de <b>maximización</b>: se convierte a minimización con c' = ${f3(r.mx)} − c (el mayor valor menos cada elemento).</p>${tablaMatrizHTML(r.nombresF, r.nombresC, r.A)}` : ''}
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">➖ 2. Reducción por filas y por columnas</h3>
            <p><b>Mínimo de cada fila:</b> ${r.nombresF.map((nm, i) => `${nm} = ${f3(r.minFilas[i])}`).join('; ')}. Se resta a cada fila su mínimo:</p>${tablaMatrizHTML(r.nombresF, r.nombresC, r.redFilas, { resaltarCeros: true })}
            <p style="margin-top:10px;"><b>Mínimo de cada columna:</b> ${r.nombresC.map((nm, j) => `${nm} = ${f3(r.minCols[j])}`).join('; ')}. Se resta a cada columna su mínimo:</p>${tablaMatrizHTML(r.nombresF, r.nombresC, r.redCols, { resaltarCeros: true })}
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">📏 3. Cobertura de ceros y ajuste de la matriz</h3>
            <p><small>Las filas/columnas cubiertas se marcan con ━ / ┃ y fondo amarillo.</small></p>
            ${itHTML}
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🎯 4. Asignación sobre los ceros (matriz original)</h3>
            ${tablaMatrizHTML(r.nombresF, r.nombresC, r.M, { marcar: r.asign })}
        </div>
        <div class="procedure-step" style="background:#e8f5e9; padding:18px; border-radius:8px; border:1px solid #a5d6a7; margin-bottom:20px; font-size:13px; line-height:1.7;">
            <h3 style="color:#2e7d32; margin-bottom:8px; font-size:15px;">🏁 FIN: Asignación Óptima Húngara Definitiva</h3>
            <ul style="margin-left:20px; line-height:1.8;">
                ${r.asign.map((j, i) => `<li><b>${r.nombresF[i]} ➔ ${r.nombresC[j]}:</b> ${f3(r.M[i][j])} ${r.unidad}</li>`).join('')}
                <li><b>Cálculo:</b> Z* = ${r.asign.map((j, i) => f3(r.M[i][j])).join(' + ')}</li>
                <li><b>${r.maximizar ? 'Beneficio Máximo' : 'Costo Mínimo'} Global Z*:</b> <span class="hl-final">${f3(r.total)} ${r.unidad}</span>.</li>
            </ul>
        </div>
        <div>
            <h4 style="color:#d32f2f; font-size:14px;">🕸️ Red Bipartita de Asignación:</h4>
            <div id="visGraphHungaro" class="graph-vis-container"></div>
        </div>`;
}

/* ==========================================================================
   7. PERT / CPM (pasada hacia adelante y hacia atrás, SIN decimales)
      Duraciones enteras se muestran enteras; si t_e = (o+4m+p)/6 es
      fraccionario se muestra como fracción exacta (ej. 16/3).
      Para forzar enteros: window.pertRedondear = true  (redondea t_e).
   ========================================================================== */

function leerDatosPert() {
    const normaliza = (arr) => arr.map(a => ({ ...a, pred: (a.pred || []).map(String) }));
    const w = window.datosPert;
    const lista = Array.isArray(w) ? w : (w && Array.isArray(w.actividades) ? w.actividades : null);
    if (lista && lista.length) { FUENTES.pert = 'window.datosPert'; return normaliza(lista); }
    FUENTES.pert = 'SIN DATOS';
    throw new Error('No hay un modelo PERT/CPM extraído y completo.');
}

function resolverPert(actividades) {
    const act = {};
    actividades.forEach(a => {
        const tres = a.o !== undefined && a.m !== undefined && a.p !== undefined;
        let te = tres ? (a.o + 4 * a.m + a.p) / 6 : num(a.dur, 0);
        te = limpio(te);
        if (window.pertRedondear) te = Math.round(te);
        act[a.id] = { id: a.id, nombre: a.nombre, deriv: a.deriv, pred: [...(a.pred || [])], te, suc: [], tres, o: a.o, m: a.m, p: a.p, varianza: tres ? Math.pow((a.p - a.o) / 6, 2) : 0 };
    });
    if (!Object.keys(act).length) return { error: 'No hay actividades para analizar.' };
    Object.values(act).forEach(a => { a.pred = a.pred.filter(p => act[p]); });
    Object.values(act).forEach(a => a.pred.forEach(p => act[p].suc.push(a.id)));

    const grado = {}; Object.values(act).forEach(a => grado[a.id] = a.pred.length);
    const orden = []; const cola = Object.keys(grado).filter(k => grado[k] === 0);
    while (cola.length) {
        const k = cola.shift(); orden.push(k);
        act[k].suc.forEach(s => { if (--grado[s] === 0) cola.push(s); });
    }
    if (orden.length !== Object.keys(act).length) return { error: 'Hay un ciclo en las precedencias.' };

    orden.forEach(k => {
        const a = act[k];
        a.IT = a.pred.length ? limpio(Math.max(...a.pred.map(p => act[p].FT))) : 0;
        a.FT = limpio(a.IT + a.te);
    });
    const duracion = limpio(Math.max(...orden.map(k => act[k].FT)));
    [...orden].reverse().forEach(k => {
        const a = act[k];
        a.LF = a.suc.length ? limpio(Math.min(...a.suc.map(s => act[s].LS))) : duracion;
        a.LS = limpio(a.LF - a.te);
        a.holgura = limpio(a.LS - a.IT);
        a.critica = Math.abs(a.holgura) < 1e-6;
    });
    orden.forEach(k => { act[k].nivel = act[k].pred.length ? Math.max(...act[k].pred.map(p => act[p].nivel)) + 1 : 0; });

    // Todas las rutas inicio → fin
    const rutas = [];
    const rec = (k, cam) => {
        if (rutas.length > 200) return;
        const c = [...cam, k];
        if (!act[k].suc.length) { rutas.push({ cam: c, dur: limpio(sumar(c.map(x => act[x].te))) }); return; }
        act[k].suc.forEach(s => rec(s, c));
    };
    orden.filter(k => !act[k].pred.length).forEach(k => rec(k, []));
    rutas.forEach(rt => { rt.critica = Math.abs(rt.dur - duracion) < 1e-6; });

    const rutaCritica = orden.filter(k => act[k].critica);
    const hayTres = Object.values(act).some(a => a.tres);
    const rc = rutas.find(rt => rt.critica);
    const varRuta = hayTres && rc ? limpio(sumar(rc.cam.map(k => act[k].varianza))) : 0;
    return { act, orden, duracion, rutaCritica, rutas, hayTres, varRuta };
}

function obtenerProcedimientoPertCpm() {
    const r = resolverPert(leerDatosPert());
    RESULTADOS.pert = r;
    if (r.error) return `${avisoFuente('pert')}<div class="procedure-step"><b>⚠️ ${r.error}</b></div>`;

    const thS = 'style="background:#f2f2f2;"';

    // Tabla 0 (solo con 3 estimaciones): cálculo de t_e
    let tablaTe = '';
    if (r.hayTres) {
        const filas = r.orden.map(k => {
            const a = r.act[k];
            return a.tres
                ? `<tr><td><b>${k}</b></td><td>${fmtT(a.o)}</td><td>${fmtT(a.m)}</td><td>${fmtT(a.p)}</td><td>(${fmtT(a.o)} + 4·${fmtT(a.m)} + ${fmtT(a.p)}) / 6 = ${fmtT(a.o + 4 * a.m + a.p)}/6</td><td><b>${fmtT(a.te)}</b></td><td>((${fmtT(a.p)} − ${fmtT(a.o)}) / 6)² = ${fmtT(a.varianza)}</td></tr>`
                : `<tr><td><b>${k}</b></td><td colspan="3">Duración fija</td><td>—</td><td><b>${fmtT(a.te)}</b></td><td>0</td></tr>`;
        }).join('');
        tablaTe = `<div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🎲 0. Tiempo esperado (PERT): t<sub>e</sub> = (o + 4m + p) / 6</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px;">
            <tr ${thS}><th>Act.</th><th>o</th><th>m</th><th>p</th><th>Cálculo de t<sub>e</sub></th><th>t<sub>e</sub></th><th>Varianza σ²</th></tr>${filas}</table></div></div>`;
    }

    // Tabla 1: pasada hacia adelante
    const filasAd = r.orden.map(k => {
        const a = r.act[k];
        const calcIT = a.pred.length ? `máx{ ${a.pred.map(p => `FT(${p}) = ${fmtT(r.act[p].FT)}`).join(' ; ')} } = ${fmtT(a.IT)}` : '0 (sin predecesoras)';
        return `<tr><td><b>${k}</b></td><td>${a.pred.length ? a.pred.join(', ') : '—'}</td><td>${fmtT(a.te)}</td><td>${calcIT}</td><td><b>${fmtT(a.IT)}</b></td><td>${fmtT(a.IT)} + ${fmtT(a.te)}</td><td><b>${fmtT(a.FT)}</b></td></tr>`;
    }).join('');

    // Tabla 2: pasada hacia atrás (orden inverso)
    const filasAt = [...r.orden].reverse().map(k => {
        const a = r.act[k];
        const calcLF = a.suc.length ? `mín{ ${a.suc.map(s => `LS(${s}) = ${fmtT(r.act[s].LS)}`).join(' ; ')} } = ${fmtT(a.LF)}` : `Duración total = ${fmtT(r.duracion)} (sin sucesoras)`;
        return `<tr><td><b>${k}</b></td><td>${a.suc.length ? a.suc.join(', ') : '—'}</td><td>${fmtT(a.te)}</td><td>${calcLF}</td><td><b>${fmtT(a.LF)}</b></td><td>${fmtT(a.LF)} − ${fmtT(a.te)}</td><td><b>${fmtT(a.LS)}</b></td></tr>`;
    }).join('');

    // Tabla 3: holguras
    const filasH = r.orden.map(k => {
        const a = r.act[k];
        return `<tr><td><b>${k}</b></td><td>${fmtT(a.LS)} − ${fmtT(a.IT)} = <b>${fmtT(a.holgura)}</b></td><td>${fmtT(a.LF)} − ${fmtT(a.FT)} = ${fmtT(a.LF - a.FT)}</td><td>${a.critica ? '<span class="hl-result">0</span>' : `<b>${fmtT(a.holgura)}</b>`}</td><td>${a.critica ? '<span style="color:red; font-weight:bold;">Sí</span>' : 'No'}</td></tr>`;
    }).join('');

    // Tabla resumen
    const filasRes = r.orden.map(k => {
        const a = r.act[k];
        return `<tr><td><b>${a.id}</b></td><td>${a.pred.length ? a.pred.join(', ') : 'Ninguna'}</td><td><b>${fmtT(a.te)}</b></td>
            <td>${fmtT(a.IT)}</td><td>${fmtT(a.FT)}</td><td>${fmtT(a.LS)}</td><td>${fmtT(a.LF)}</td>
            <td>${a.critica ? `<span class="hl-result">0</span>` : `<b>${fmtT(a.holgura)}</b>`}</td>
            <td>${a.critica ? '<span style="color:red; font-weight:bold;">Sí</span>' : 'No'}</td></tr>`;
    }).join('');

    // Rutas
    const filasRutas = r.rutas.map(rt => `<tr><td>${rt.cam.join(' ➔ ')}</td><td>${rt.cam.map(k => fmtT(r.act[k].te)).join(' + ')} = <b>${fmtT(rt.dur)}</b></td><td>${rt.critica ? '<span class="hl-result">Crítica (máxima)</span>' : 'No crítica'}</td></tr>`).join('');

    const rutasCrit = r.rutas.filter(rt => rt.critica);
    const varHTML = r.hayTres ? `<li><b>Varianza de la ruta crítica:</b> σ² = ${rutasCrit[0].cam.map(k => fmtT(r.act[k].varianza)).join(' + ')} = ${fmtT(r.varRuta)}; σ = √${fmtT(r.varRuta)} = ${f2(Math.sqrt(r.varRuta))}</li>` : '';

    // Tabla de actividades (cuando traen nombre / derivación)
    let tablaActs = '';
    if (r.orden.some(k => r.act[k].nombre)) {
        const P = Object.assign({ horasDia: 8, unidDia: 50, m3Dia: 20 }, window.pertParametros || {});
        const filasA = r.orden.map(k => {
            const a = r.act[k];
            return `<tr><td><b>${k}</b></td><td>${a.nombre || ''}</td><td>${a.pred.length ? a.pred.join(', ') : '—'}</td><td><b>${fmtT(a.te)}</b></td><td>${a.deriv || 'Dato del enunciado'}</td></tr>`;
        }).join('');
        const supuestos = FUENTES.pert && FUENTES.pert.startsWith('derivado')
            ? `<p style="margin-top:8px;"><small>Supuestos: jornada de ${P.horasDia} h/día, ${P.unidDia} unidades cargadas/entregadas por día y ${P.m3Dia} m³ almacenados por día. Las cantidades producidas salen de la solución óptima de Programación Lineal y los envíos de la solución óptima del MODI. Se pueden cambiar con <code>window.pertParametros</code>.</small></p>` : '';
        tablaActs = `<div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:12px; font-size:16px;">🗂️ Actividades del proyecto y precedencias</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px;">
            <tr ${thS}><th>Act.</th><th>Descripción</th><th>Predecesoras</th><th>Duración (días)</th><th>Cómo se obtuvo</th></tr>${filasA}</table></div>${supuestos}</div>`;
    }

    return `
        ${avisoFuente('pert')}
        ${tablaActs}
        ${tablaTe}
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:6px; font-size:16px;">➡️ 1. PASADA HACIA ADELANTE (Inicio Temprano IT y Final Temprano FT)</h3>
            <p>IT = máx{FT de las predecesoras} (0 si no tiene) &nbsp;|&nbsp; FT = IT + t<sub>e</sub></p>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
            <tr ${thS}><th>Act.</th><th>Predecesoras</th><th>t<sub>e</sub></th><th>Cálculo de IT</th><th>IT</th><th>FT = IT + t<sub>e</sub></th><th>FT</th></tr>${filasAd}</table></div>
            <p style="margin-top:8px;"><b>Duración del proyecto</b> = máx{FT} = <b>${fmtT(r.duracion)}</b></p>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:6px; font-size:16px;">⬅️ 2. PASADA HACIA ATRÁS (Final Tardío LF e Inicio Tardío LS)</h3>
            <p>LF = mín{LS de las sucesoras} (= duración total si no tiene) &nbsp;|&nbsp; LS = LF − t<sub>e</sub>. Se recorre de la última actividad a la primera.</p>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
            <tr ${thS}><th>Act.</th><th>Sucesoras</th><th>t<sub>e</sub></th><th>Cálculo de LF</th><th>LF</th><th>LS = LF − t<sub>e</sub></th><th>LS</th></tr>${filasAt}</table></div>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:6px; font-size:16px;">🧮 3. HOLGURAS (H = LS − IT = LF − FT)</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
            <tr ${thS}><th>Act.</th><th>LS − IT</th><th>LF − FT</th><th>Holgura</th><th>¿Crítica?</th></tr>${filasH}</table></div>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:6px; font-size:16px;">🛤️ 4. RUTAS DEL PROYECTO (verificación)</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
            <tr ${thS}><th>Ruta</th><th>Suma de duraciones</th><th>Resultado</th></tr>${filasRutas}</table></div>
        </div>
        <div class="procedure-step" style="margin-bottom:25px; font-size:13px; line-height:1.7;">
            <h3 style="color:#d32f2f; margin-bottom:6px; font-size:16px;">📋 5. TABLA RESUMEN</h3>
            <div style="overflow-x:auto;"><table class="excel-table" style="font-size:13px; margin-top:8px;">
            <tr ${thS}><th>Actividad</th><th>Predecesoras</th><th>Duración (t<sub>e</sub>)</th><th>IT</th><th>FT</th><th>LS</th><th>LF</th><th>Holgura</th><th>¿Crítica?</th></tr>${filasRes}</table></div>
        </div>
        <div class="procedure-step" style="background:#ffebee; padding:18px; border-radius:8px; border:1px solid #ffcdd2; margin-bottom:20px; font-size:13px; line-height:1.7;">
            <h3 style="color:#c62828; margin-bottom:8px; font-size:15px;">🏁 CONCLUSIÓN PERT / CPM</h3>
            <ul style="margin-left:20px; line-height:1.8;">
                <li><b>Duración Total del Proyecto:</b> <span class="hl-final">${fmtT(r.duracion)} días</span>.</li>
                <li><b>Ruta Crítica (H = 0):</b> <span class="hl-result">${rutasCrit.map(rt => rt.cam.join(' ➔ ')).join('  |  ')}</span>.</li>
                ${varHTML}
            </ul>
        </div>
        <div>
            <h4 style="color:#d32f2f; font-size:14px;">🕸️ Diagrama de Red AON:</h4>
            <div id="visGraphPert" class="graph-vis-container"></div>
        </div>`;
}

/* ==========================================================================
   8. GRAFOS (todos construidos desde los resultados calculados)
   ========================================================================== */

function renderVisGraphCustom(containerId, nodesData, edgesData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const data = { nodes: new vis.DataSet(nodesData), edges: new vis.DataSet(edgesData) };
    const options = {
        nodes: {
            shape: 'box',
            font: { size: 13, face: 'Poppins', color: '#333333', strokeWidth: 2, strokeColor: '#ffffff' },
            color: { background: '#ffffff', border: '#333333', highlight: { background: '#ffebee', border: '#d32f2f' } },
            borderWidth: 2, margin: 16
        },
        edges: {
            width: 2,
            color: { color: '#333333', highlight: '#d32f2f' },
            font: { size: 11, align: 'top', face: 'Poppins', color: '#d32f2f', background: '#ffffff' },
            arrows: { to: { enabled: true, scaleFactor: 0.9 } },
            smooth: { type: 'cubicBezier', roundness: 0.2 }
        },
        physics: { enabled: false },
        interaction: { dragNodes: true, dragView: true, zoomView: true }
    };
    new vis.Network(container, data, options);
}

function inicializarGrafos() {
    const VERDE = { background: '#e8f5e9', border: '#2e7d32' };
    const AZUL = { background: '#e3f2fd', border: '#1976d2' };
    const ROJO = { background: '#ffebee', border: '#d32f2f' };
    const NARANJA = { background: '#fff3e0', border: '#ef6c00' };
    const MORADO = { background: '#f3e5f5', border: '#7b1fa2' };

    // --- PL ---
    if (document.getElementById('visGraphPL')) {
        const d = obtenerDatosDinamicosTablas();
        const modelo = construirModeloPL(d);
        const P = d.productos, n = P.length;
        const nodes = [{ id: 'Z', label: 'Max Z', x: 0, y: -160, color: AZUL }];
        const edges = [];
        P.forEach((p, i) => {
            const x = (i - (n - 1) / 2) * 200;
            nodes.push({ id: 'X' + i, label: `X${i + 1} (${p.nombre})`, x, y: -40, color: NARANJA });
            edges.push({ from: 'Z', to: 'X' + i, label: `${p.util}`, color: { color: '#1976d2' } });
            modelo.rest.forEach((r, j) => {
                edges.push({ from: 'X' + i, to: `R${j}`, label: `${r.a[i]}`, color: { color: '#78909c' } });
            });
        });
        modelo.rest.forEach((r, j) => {
            const x = (j - (modelo.rest.length - 1) / 2) * 180;
            nodes.push({ id: `R${j}`, label: `${r.nombre} ${r.tipo} ${r.b}`, x, y: 130, color: MORADO });
        });
        renderVisGraphCustom('visGraphPL', nodes, edges);
    }

    // --- Entera (árbol B&B) ---
    if (document.getElementById('visGraphEntera')) {
        obtenerProcedimientoEntera();
        const bb = RESULTADOS.entera.bb;
        const hijos = {}; bb.nodos.forEach(nd => { if (nd.padre !== null) (hijos[nd.padre] = hijos[nd.padre] || []).push(nd.id); });
        const pos = {}; let hoja = 0;
        const colocar = (id, prof) => {
            const k = hijos[id] || [];
            if (!k.length) pos[id] = { x: (hoja++) * 230, y: prof * 120 };
            else { k.forEach(h => colocar(h, prof + 1)); pos[id] = { x: k.reduce((s, h) => s + pos[h].x, 0) / k.length, y: prof * 120 }; }
        };
        colocar(0, 0);
        const nodes = bb.nodos.map(nd => ({
            id: nd.id,
            label: `Nodo ${nd.id}\n${nd.x ? '(' + nd.x.map(v => f2(v)).join('; ') + ')\nZ=' + f2(nd.z) : 'Infactible'}\n${nd.id === bb.mejor.id ? '★ Entero óptimo' : (nd.nota || '')}`,
            x: pos[nd.id].x, y: pos[nd.id].y,
            color: nd.id === bb.mejor.id ? VERDE : (nd.estado !== 'optimo' ? ROJO : (nd.padre === null ? AZUL : NARANJA))
        }));
        const edges = bb.nodos.filter(nd => nd.padre !== null).map(nd => ({
            from: nd.padre,
            to: nd.id,
            label: nd.etiqueta,
            color: { color: nd.etiqueta.includes('≤') ? '#1976d2' : '#ef6c00' }
        }));
        renderVisGraphCustom('visGraphEntera', nodes, edges);
    }

    // --- Transporte ---
    if (document.getElementById('visGraphTransporte')) {
        obtenerProcedimientoMODI();
        const r = RESULTADOS.transporte;
        const nodes = [], edges = [];
        const coloresFlujo = ['#7b1fa2', '#00897b', '#c62828', '#3949ab', '#ef6c00', '#2e7d32'];
        r.on.forEach((nm, i) => nodes.push({ id: 'O' + i, label: `${nm}\nOferta: ${f3(r.O[i])}`, x: -350, y: (i - (r.m - 1) / 2) * 100, color: AZUL }));
        r.dn.forEach((nm, j) => nodes.push({ id: 'D' + j, label: `${nm}\nDemanda: ${f3(r.D[j])}`, x: 180, y: (j - (r.n - 1) / 2) * 100, color: VERDE }));
        r.X.forEach((fila, i) => fila.forEach((q, j) => {
            if (q > EPS) edges.push({ from: 'O' + i, to: 'D' + j, label: `${f3(q)} [Q${f2(r.C[i][j])}]`, color: { color: coloresFlujo[i % coloresFlujo.length] }, width: 3 });
        }));
        renderVisGraphCustom('visGraphTransporte', nodes, edges);
    }

    // --- Húngaro ---
    if (document.getElementById('visGraphHungaro')) {
        obtenerProcedimientoHungaro();
        const r = RESULTADOS.hungaro;
        const nodes = [], edges = [];
        r.nombresF.forEach((nm, i) => nodes.push({ id: 'F' + i, label: nm, x: -200, y: (i - (r.n - 1) / 2) * 70, color: AZUL }));
        r.nombresC.forEach((nm, j) => nodes.push({ id: 'C' + j, label: nm, x: 200, y: (j - (r.n - 1) / 2) * 70, color: MORADO }));
        r.asign.forEach((j, i) => edges.push({ from: 'F' + i, to: 'C' + j, label: `${f3(r.M[i][j])} ${r.unidad}`, color: { color: '#2e7d32' }, width: 4 }));
        renderVisGraphCustom('visGraphHungaro', nodes, edges);
    }

    // --- PERT ---
    if (document.getElementById('visGraphPert')) {
        obtenerProcedimientoPertCpm();
        const r = RESULTADOS.pert;
        if (!r.error) {
            const porNivel = {};
            const nodes = r.orden.map(k => {
                const a = r.act[k];
                const idx = porNivel[a.nivel] = (porNivel[a.nivel] === undefined ? 0 : porNivel[a.nivel] + 1);
                return { id: k, label: `${k} (${fmtT(a.te)}d)\nIT:${fmtT(a.IT)}|FT:${fmtT(a.FT)}\nLS:${fmtT(a.LS)}|LF:${fmtT(a.LF)}`, x: a.nivel * 190 - 300, y: idx * 140, color: a.critica ? ROJO : AZUL };
            });
            const edges = [];
            r.orden.forEach(k => r.act[k].suc.forEach(s => {
                const crit = r.act[k].critica && r.act[s].critica;
                edges.push(crit ? { from: k, to: s, label: 'Ruta crítica', color: { color: '#d32f2f' }, width: 4 } : { from: k, to: s, label: 'Precedencia', color: { color: '#78909c' } });
            }));
            renderVisGraphCustom('visGraphPert', nodes, edges);
        }
    }
}


/* ==========================================================================
   9. LECTOR AUTOMÁTICO DE ENUNCIADOS (cualquier redacción)
      parsearEnunciadoTexto(texto) -> { productos, capVol, capHoras,
                                        origenes, destinos, ofertas, demandas, costos, avisos }
      Cualquier dato que no se logre detectar queda en null y se reporta en "avisos".
   ========================================================================== */

const _SUBS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const _NUM = '\\d+(?:[.,]\\d+)*';
const _TOK = '(?!Q\\d)[\\p{Lu}\\d][\\p{L}\\d\\-]*';
const _NOMBRE = `${_TOK}(?:\\s+(?:(?:de|del|la|el|los|las)\\s+)?${_TOK})*`;
const _CONEC = '(?:\\s+(?:con|de|tiene|ofrece|aporta|requiere|necesita|demanda|dispone de|produce)\\s+|\\s*[:=]\\s*|\\s*\\(\\s*)';
const _UNI = '(?:unidades|unidad|tarimas|tarima|cajas|caja|pallets|toneladas|ton|camiones|viajes)';
const _INICIOS_IGNORABLES = new Set(['por', 'su', 'parte', 'además', 'ademas', 'asimismo', 'también', 'tambien', 'finalmente',
    'desde', 'hacia', 'hasta', 'en', 'para', 'con', 'según', 'segun', 'respecto', 'mientras', 'entonces', 'sin']);

function normalizarTexto(t) {
    return String(t || '')
        .replace(/[₀-₉]/g, c => _SUBS[c])
        .replace(/\u00A0/g, ' ')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function aNumero(s) {
    s = String(s).trim();
    if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ''));
    return parseFloat(s.replace(',', '.'));
}

function _norm(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function mismoNombre(a, b) {
    a = _norm(a); b = _norm(b);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
}

function limpiarNombre(s) {
    const t = s.trim().split(/\s+/);
    while (t.length > 1 && _INICIOS_IGNORABLES.has(t[0].toLowerCase())) t.shift();
    while (t.length && /^[Qq$]$/.test(t[t.length - 1])) t.pop();
    if (t.length === 1 && _INICIOS_IGNORABLES.has(t[0].toLowerCase())) return '';
    return t.join(' ');
}

/* Nombre del producto: palabras con mayúscula inicial justo antes de "(X1)" */
function nombreAntes(t, pos) {
    const antes = t.slice(Math.max(0, pos - 90), pos).trimEnd();
    const toks = antes.split(/\s+/);
    const out = [];
    const esCap = s => /^[\p{Lu}\d]/u.test(s);
    const conectores = new Set(['de', 'del', 'la', 'el', 'los', 'las']);
    for (let k = toks.length - 1; k >= 0 && out.length < 5; k--) {
        const tk = toks[k];
        if (/[,.;:()]/.test(tk)) break;
        if (esCap(tk)) { out.unshift(tk); continue; }
        if (conectores.has(tk.toLowerCase()) && out.length > 0 && k > 0 && esCap(toks[k - 1]) && !/[,.;:()]/.test(toks[k - 1])) { out.unshift(tk); continue; }
        break;
    }
    return limpiarNombre(out.join(' '));
}

function _salto(n) { return `(?:[^\\d]|\\bX\\d+\\b){0,${n}}?`; }
function _primero(re, txt) { const m = re.exec(txt); return m ? aNumero(m[1]) : null; }

/* ---------------- Sección de producción ---------------- */
function _indiceTransporte(t) {
    const ini = Math.max(0, t.search(/utilidad|margen|ganancia|beneficio/i));
    const cand = [
        /\bhoja\s*2\b/i, /\bII\.\s/, /\bofertas?\b/i,
        /desde\s+\S+(?:\s+\S+){0,3}\s+hacia/i,
        /\b(?:problema|red)\s+(?:de\s+)?(?:transporte|distribuci[oó]n|log[ií]stica)\b/i,
        /\b(?:or[ií]genes|destinos)\b/i,
        /\bplantas?\s*[:(]/i,
        new RegExp(`${_NOMBRE}\\s*(?:→|->|➔)`, 'u')
    ].map(re => { const m = re.exec(t.slice(ini)); return m ? ini + m.index : -1; }).filter(x => x > 0);
    return cand.length ? Math.min(...cand) : -1;
}

function _parsearDesigualdades(prod) {
    const term = `(?:(?:${_NUM})\\s*[*·]?\\s*)?[Xx]\\d+`;
    const re = new RegExp(`(${term}(?:\\s*\\+\\s*${term})*)\\s*(?:≤|<=|=<)\\s*(${_NUM})`, 'g');
    const lista = [];
    let m;
    while ((m = re.exec(prod))) {
        const coef = {};
        const reT = new RegExp(`(?:(${_NUM})\\s*[*·]?\\s*)?[Xx](\\d+)`, 'g');
        let t;
        while ((t = reT.exec(m[1]))) coef[parseInt(t[2], 10)] = t[1] !== undefined ? aNumero(t[1]) : 1;
        const ctx = prod.slice(Math.max(0, m.index - 150), m.index).toLowerCase();
        const lastV = Math.max(ctx.lastIndexOf('volum'), ctx.lastIndexOf('m³'), ctx.lastIndexOf('m3'), ctx.lastIndexOf('cúbic'), ctx.lastIndexOf('cubic'));
        const lastH = Math.max(ctx.lastIndexOf('hora'), ctx.lastIndexOf('personal'), ctx.lastIndexOf('mano de obra'), ctx.lastIndexOf('tiempo'));
        lista.push({ coef, b: aNumero(m[2]), tipo: lastV === lastH ? null : (lastV > lastH ? 'vol' : 'horas') });
    }
    const usados = new Set(lista.filter(x => x.tipo).map(x => x.tipo));
    lista.forEach(x => { if (!x.tipo) { const libre = ['vol', 'horas'].find(k => !usados.has(k)); if (libre) { x.tipo = libre; usados.add(libre); } } });
    return lista;
}

function _extraerCampos(txt) {
    const r = { util: null, vol: null, horas: null, min: null };
    r.util = _primero(new RegExp(`(?:utilidad|margen|ganancia|beneficio|contribuci[oó]n|rentabilidad)${_salto(90)}(?:Q|\\$)?\\s*(${_NUM})`, 'i'), txt);
    if (r.util === null) r.util = _primero(new RegExp(`(?:Q|\\$)\\s*(${_NUM})\\s*(?:de|por)?\\s*(?:utilidad|ganancia|margen)`, 'i'), txt);
    if (r.util === null) r.util = _primero(new RegExp(`(?:Q|\\$)\\s*(${_NUM})`), txt);

    r.vol = _primero(new RegExp(`(?:volumen|espacio|volum[eé]trico)${_salto(60)}(${_NUM})`, 'i'), txt);
    if (r.vol === null) r.vol = _primero(new RegExp(`(${_NUM})\\s*(?:m³|m3|m\\^3|metros?\\s*c[uú]bicos?)`, 'i'), txt);

    r.horas = _primero(new RegExp(`(?:tiempo|horas?|carga|mano de obra|personal)${_salto(60)}(${_NUM})\\s*(?:horas?|hrs?|h)\\b`, 'i'), txt);
    if (r.horas === null) r.horas = _primero(new RegExp(`(${_NUM})\\s*(?:horas?|hrs?)\\b`, 'i'), txt);

    r.min = _primero(new RegExp(`m[ií]nim[oa]${_salto(70)}(${_NUM})`, 'i'), txt);
    if (r.min === null) r.min = _primero(new RegExp(`(?:al menos|no menos de|como m[ií]nimo|por lo menos)\\s*(${_NUM})`, 'i'), txt);
    return r;
}

function _descubrirProductosSinMarcas(prod) {
    const nombres = [];
    prod.split(/[.!?;]\s+/).forEach(s => {
        if (!/(utilidad|margen|ganancia|beneficio)/i.test(s) || !/\d/.test(s)) return;
        const re = new RegExp(_NOMBRE, 'gu');
        let m;
        while ((m = re.exec(s))) {
            const n = limpiarNombre(m[0]);
            if (n && !nombres.some(x => mismoNombre(x, n))) { nombres.push(n); break; }
        }
    });
    return nombres.map((n, i) => ({ k: i + 1, nombre: n, pos: -1 }));
}

function _parsearProduccion(prod, res, avisos) {
    const marcas = [];
    const vistos = {};
    const reM = /\(\s*[Xx]\s*(\d+)\s*\)/g;
    let m;
    while ((m = reM.exec(prod))) {
        const k = parseInt(m[1], 10);
        if (!vistos[k]) { vistos[k] = true; marcas.push({ k, pos: m.index, nombre: nombreAntes(prod, m.index) || `Producto ${k}` }); }
    }
    marcas.sort((a, b) => a.k - b.k);
    let productos = marcas;
    if (!productos.length) productos = _descubrirProductosSinMarcas(prod);
    if (!productos.length) { avisos.push('No se detectaron productos en el enunciado (use el formato: Nombre (X1) ...).'); return; }

    const low = prod.toLowerCase();
    const menciones = [];
    productos.forEach((p, i) => {
        const nl = p.nombre.toLowerCase();
        let from = 0, j;
        while ((j = low.indexOf(nl, from)) >= 0) { menciones.push({ pos: j, end: j + nl.length, i }); from = j + nl.length; }
        const palabras = p.nombre.split(' ');
        const alias = palabras[0].toLowerCase();
        const unico = palabras.length > 1 && alias.length >= 4 && !productos.some((q, k) => k !== i && q.nombre.toLowerCase().startsWith(alias));
        if (unico) {
            const reA = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            let a;
            while ((a = reA.exec(prod))) menciones.push({ pos: a.index, end: a.index + alias.length, i });
        }
    });
    const reM2 = /\(\s*[Xx]\s*(\d+)\s*\)/g;
    while ((m = reM2.exec(prod))) {
        const idx = productos.findIndex(p => p.k === parseInt(m[1], 10));
        if (idx >= 0) menciones.push({ pos: m.index, end: m.index + m[0].length, i: idx });
    }
    menciones.sort((a, b) => a.pos - b.pos || b.end - a.end);
    const mencs = [];
    menciones.forEach(x => { if (!mencs.length || x.pos >= mencs[mencs.length - 1].end) mencs.push(x); });

    const cortes = [0];
    const reS = /[.!?;]\s+/g;
    while ((m = reS.exec(prod))) cortes.push(m.index + m[0].length);
    cortes.push(prod.length);
    const textos = productos.map(() => []);
    let dueno = null;
    const esCap = /(?:capacidad|disponibilidad)\b|restricciones? de (?:la )?planta|sujet[oa] a/i;
    for (let c = 0; c < cortes.length - 1; c++) {
        const s = cortes[c], e = cortes[c + 1];
        if (e <= s) continue;
        const frase = prod.slice(s, e);
        if (esCap.test(frase)) { dueno = null; continue; }
        const dentro = mencs.filter(x => x.pos >= s && x.pos < e);
        if (!dentro.length) { if (dueno !== null) textos[dueno].push(frase); continue; }
        dentro.forEach((x, k) => {
            const ini = k === 0 ? s : x.pos;
            const fin = k + 1 < dentro.length ? dentro[k + 1].pos : e;
            textos[x.i].push(prod.slice(ini, fin));
        });
        dueno = dentro[dentro.length - 1].i;
    }

    const des = _parsearDesigualdades(prod);
    const dVol = des.find(d => d.tipo === 'vol'), dHor = des.find(d => d.tipo === 'horas');
    if (dVol) res.capVol = dVol.b;
    if (dHor) res.capHoras = dHor.b;
    if (res.capVol === null) res.capVol = _primero(new RegExp(`capacidad\\s+volum[eé]trica${_salto(90)}(${_NUM})`, 'i'), prod);
    if (res.capHoras === null) {
        res.capHoras = _primero(new RegExp(`(?:disponibilidad|capacidad)[^.]{0,120}?(${_NUM})\\s*horas`, 'i'), prod);
        if (res.capHoras === null) res.capHoras = _primero(new RegExp(`(${_NUM})\\s*horas[- ]hombre`, 'i'), prod);
    }

    productos.forEach((p, i) => {
        const txt = textos[i].join(' ');
        const c = _extraerCampos(txt);
        const reMin = new RegExp(`[Xx]${p.k}\\s*(?:≥|>=|=>)\\s*(${_NUM})`);
        const minIneq = _primero(reMin, prod);
        const min = minIneq !== null ? minIneq : (c.min !== null ? c.min : 0);
        const vol = c.vol !== null ? c.vol : (dVol && dVol.coef[p.k] !== undefined ? dVol.coef[p.k] : null);
        const horas = c.horas !== null ? c.horas : (dHor && dHor.coef[p.k] !== undefined ? dHor.coef[p.k] : null);
        res.productos.push({ nombre: p.nombre, util: c.util, min, vol, horas });
        if (c.util === null) avisos.push(`No se detectó la utilidad de "${p.nombre}".`);
        if (vol === null) avisos.push(`No se detectó el volumen por unidad de "${p.nombre}".`);
        if (horas === null) avisos.push(`No se detectaron las horas por unidad de "${p.nombre}".`);
    });
    if (res.capVol === null) avisos.push('No se detectó la capacidad de volumen.');
    if (res.capHoras === null) avisos.push('No se detectó la disponibilidad de horas-hombre.');
}

/* ---------------- Sección de transporte ---------------- */
function _extraerItems(seg) {
    const out = [];
    const re = new RegExp(`(${_NOMBRE})${_CONEC}(${_NUM})\\s*(?:${_UNI})?\\s*\\)?`, 'gu');
    let m;
    while ((m = re.exec(seg))) {
        const nombre = limpiarNombre(m[1]);
        if (nombre && !out.some(x => mismoNombre(x.nombre, nombre))) out.push({ nombre, valor: aNumero(m[2]) });
    }
    return out;
}

function _extraerFilasCosto(seg) {
    const filas = [];
    const partes = seg.split(/\bdesde\b/i);
    partes.shift();
    partes.forEach(p => {
        const mo = p.match(new RegExp(`^\\s*(${_NOMBRE})\\s+(?:hacia|a|hasta|para|con destino a)\\s+`, 'u'));
        if (!mo) return;
        const origen = limpiarNombre(mo[1]);
        const resto = p.slice(mo[0].length);
        const re = new RegExp(`(${_NOMBRE})\\s*(?:[:=]\\s*)?(?:(?:Q|\\$)\\s*)?(${_NUM})`, 'gu');
        const items = [];
        let m;
        while ((m = re.exec(resto))) {
            const n = limpiarNombre(m[1]);
            if (n) items.push({ nombre: n, valor: aNumero(m[2]) });
        }
        filas.push({ origen, items });
    });
    if (filas.length) return filas;

    const re2 = new RegExp(`(${_NOMBRE})\\s*(?:→|->|➔|=>|hacia)\\s*(${_NOMBRE})\\s*[:=]?\\s*(?:(?:Q|\\$)\\s*)?(${_NUM})`, 'gu');
    let m;
    while ((m = re2.exec(seg))) {
        const o = limpiarNombre(m[1]), d = limpiarNombre(m[2]);
        if (!o || !d) continue;
        let f = filas.find(x => mismoNombre(x.origen, o));
        if (!f) { f = { origen: o, items: [] }; filas.push(f); }
        f.items.push({ nombre: d, valor: aNumero(m[3]) });
    }
    return filas;
}

function _parsearTransporte(tr, res, avisos) {
    if (!tr) return;
    const buscar = (...res) => { for (const re of res) { const i = tr.search(re); if (i >= 0) return i; } return -1; };
    const iS = buscar(/\bofertas?\b/i, /\bplantas?\s*[:(]/i, /\bor[ií]genes\b/i, /capacidad(?:es)? de (?:producci[oó]n|abastecimiento|suministro)/i);
    const iD = buscar(/\b(?:demandas?|requerimientos?|requieren)\b/i, /\bdestinos\b/i);
    const iC = buscar(/matriz de costos|costos? unitarios?|costos? de transporte|\bdesde\s+/i, new RegExp(`${_NOMBRE}\\s*(?:→|->|➔)`, 'u'));
    const marcas = [['s', iS], ['d', iD], ['c', iC]].filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]);
    const seg = (key) => {
        const k = marcas.findIndex(x => x[0] === key);
        if (k < 0) return '';
        return tr.slice(marcas[k][1], k + 1 < marcas.length ? marcas[k + 1][1] : tr.length);
    };
    const sup = _extraerItems(seg('s'));
    const dem = _extraerItems(seg('d'));
    const filasCosto = _extraerFilasCosto(seg('c') || tr);

    res.origenes = sup.map(x => x.nombre);
    res.ofertas = sup.map(x => x.valor);
    res.destinos = dem.map(x => x.nombre);
    res.demandas = dem.map(x => x.valor);
    if (!res.origenes.length && filasCosto.length) {
        res.origenes = filasCosto.map(f => f.origen);
        res.ofertas = res.origenes.map(() => null);
        avisos.push('No se detectaron las ofertas de los orígenes.');
    }
    if (!res.destinos.length && filasCosto.length) {
        res.destinos = filasCosto[0].items.map(x => x.nombre);
        res.demandas = res.destinos.map(() => null);
        avisos.push('No se detectaron las demandas de los destinos.');
    }
    res.costos = res.origenes.map(o => {
        const f = filasCosto.find(x => mismoNombre(x.origen, o));
        return res.destinos.map(d => {
            const it = f ? f.items.find(x => mismoNombre(x.nombre, d)) : null;
            return it ? it.valor : null;
        });
    });
    if (res.costos.some(f => f.some(v => v === null))) avisos.push('Faltan costos de transporte en la matriz detectada.');
    if (res.origenes.length && res.destinos.length) {
        const sO = sumar(res.ofertas.map(v => v || 0)), sD = sumar(res.demandas.map(v => v || 0));
        if (Math.abs(sO - sD) > 1e-9) avisos.push(`Oferta total (${sO}) ≠ demanda total (${sD}): el MODI agregará un elemento ficticio.`);
    }
}

/* ---------------- Sección PERT (opcional) ----------------
   Formatos aceptados, separados por ; o punto:
     "Actividad A: 3 días, sin predecesoras; B: 4 días, precede A; F: 2 días, predecesoras D, E"
     "C: o=4, m=6, p=8, requiere A"                                                          */
function _parsearPert(txt) {
    const out = [];
    txt.split(/;|\.\s+|\n/).forEach(cl => {
        let c = cl.replace(/^.*?\bactividad(?:es)?\s+(?=[A-Z][A-Z0-9]?\s*[:=])/i, '').trim();
        const m = c.match(/^([A-Z][A-Z0-9]?)\s*[:=]\s*(.*)$/);
        if (!m) return;
        const id = m[1], resto = m[2];
        const mp = resto.match(/(?:predecesor\w*|preced\w*(?:\s+por)?|requiere|depende de|despu[eé]s de)\s*[:\-]?\s*(.+)$/i);
        const pred = (mp && !/^\s*(?:ninguna|nada)/i.test(mp[1])) ? (mp[1].match(/\b[A-Z][A-Z0-9]?\b/g) || []) : [];
        const antes = mp ? resto.slice(0, mp.index) : resto;
        const m3 = antes.match(new RegExp(`o\\s*=\\s*(${_NUM})\\s*[,;]?\\s*m\\s*=\\s*(${_NUM})\\s*[,;]?\\s*p\\s*=\\s*(${_NUM})`, 'i'));
        if (m3) { out.push({ id, pred, o: aNumero(m3[1]), m: aNumero(m3[2]), p: aNumero(m3[3]) }); return; }
        const m1 = antes.match(new RegExp(`(${_NUM})`));
        if (m1) out.push({ id, pred, dur: aNumero(m1[1]) });
    });
    return out;
}

function parsearEnunciadoTexto(textoOriginal) {
    const avisos = [];
    const res = { productos: [], capVol: null, capHoras: null, origenes: [], destinos: [], ofertas: [], demandas: [], costos: [], pert: [], avisos };
    let t = normalizarTexto(textoOriginal);
    if (!t) return res;
    // Se separa la sección PERT (si existe) para que no se mezcle con producción/transporte
    const iPert = t.search(/\bactividad(?:es)?\s+[A-Z][A-Z0-9]?\s*[:=]|\bPERT\b|\bCPM\b|ruta cr[ií]tica/i);
    if (iPert > 0) {
        res.pert = _parsearPert(t.slice(iPert));
        t = t.slice(0, iPert).trim();
    }
    const idxTr = _indiceTransporte(t);
    const prod = idxTr > 0 ? t.slice(0, idxTr) : t;
    const trans = idxTr > 0 ? t.slice(idxTr) : (/\bofertas?\b|\bdesde\b/i.test(t) ? t : '');
    _parsearProduccion(prod, res, avisos);
    _parsearTransporte(trans, res, avisos);
    return res;
}

/* Carga un inciso nuevo: parsea el enunciado, limpia resultados viejos y deja
   los datos listos en window.datosProduccion / window.datosTransporte.
   Llamar ANTES de generar los procedimientos de cada inciso. */
function aplicarEnunciado(texto) {
    const p = parsearEnunciadoTexto(texto);
    Object.keys(RESULTADOS).forEach(k => delete RESULTADOS[k]);
    window.datosTransporte = (p.origenes.length && p.destinos.length)
        ? { origenes: p.origenes, destinos: p.destinos, ofertas: p.ofertas, demandas: p.demandas, costos: p.costos }
        : null;
    window.datosProduccion = p.productos.length
        ? { productos: p.productos, b1: p.capVol, b2: p.capHoras }
        : null;
    // PERT explícito del texto; si no hay, se deriva de producción + transporte
    window.datosPert = p.pert && p.pert.length ? p.pert : null;
    return p;
}

/* ==========================================================================
   10. PLANO GEOGEBRA DINÁMICO
   ========================================================================== */

function renderGeoGebraCanvas() {
    const ctx = document.getElementById('geogebraCanvas');
    if (!ctx || typeof Chart === 'undefined') return;
    obtenerProcedimientoMGrande();
    const { modelo, res, firma } = RESULTADOS.pl;
    if (modelo.n !== 2) { ctx.insertAdjacentHTML('afterend', '<p style="font-size:12px;color:#666;">El plano 2D solo aplica a modelos de 2 variables.</p>'); return; }

    const prev = typeof Chart.getChart === 'function' ? Chart.getChart(ctx) : null;
    if (prev) prev.destroy();

    const rest = modelo.rest;
    const { vert } = verticesFactibles(modelo);
    let xmax = vert.length ? Math.max(...vert.map(p => p[0])) : 0, ymax = vert.length ? Math.max(...vert.map(p => p[1])) : 0;
    rest.forEach(r => { if (!vert.length) { if (r.a[0]) xmax = Math.max(xmax, r.b / r.a[0]); if (r.a[1]) ymax = Math.max(ymax, r.b / r.a[1]); } });
    xmax = (xmax || 10) * 1.2; ymax = (ymax || 10) * 1.2;

    const colores = ['#1976d2', '#f57c00', '#d32f2f', '#7b1fa2', '#00796b'];
    const datasets = [];
    if (vert.length > 2) {
        datasets.push({ label: 'Región factible', data: [...vert, vert[0]].map(p => ({ x: p[0], y: p[1] })), showLine: true, fill: true,
            backgroundColor: 'rgba(76,175,80,0.18)', borderColor: 'rgba(46,125,50,0.8)', borderWidth: 1, pointRadius: 0 });
    }
    rest.forEach((r, k) => {
        const [a1, a2] = r.a;
        let pts;
        if (a1 && a2) pts = [{ x: 0, y: r.b / a2 }, { x: r.b / a1, y: 0 }];
        else if (!a2) pts = [{ x: r.b / a1, y: 0 }, { x: r.b / a1, y: ymax }];
        else pts = [{ x: 0, y: r.b / a2 }, { x: xmax, y: r.b / a2 }];
        datasets.push({ label: `${r.nombre}: ${a1}X₁ + ${a2}X₂ ${r.tipo === '<=' ? '≤' : (r.tipo === '>=' ? '≥' : '=')} ${r.b}`, data: pts, showLine: true,
            borderColor: colores[k % colores.length], borderDash: r.tipo === '>=' ? [6, 4] : [], borderWidth: 2, pointRadius: 0, fill: false });
    });
    if (res.estado === 'optimo') {
        datasets.push({ label: `Óptimo LP (${f2(res.x[0])}, ${f2(res.x[1])})`, data: [{ x: res.x[0], y: res.x[1] }], showLine: false,
            backgroundColor: '#2e7d32', borderColor: '#2e7d32', pointRadius: 8 });
        const E = RESULTADOS.entera;
        const ent = E && E.firma === firma && E.bb && E.bb.mejor.x;
        if (ent && (Math.abs(ent[0] - res.x[0]) > 1e-6 || Math.abs(ent[1] - res.x[1]) > 1e-6)) {
            datasets.push({ label: `Óptimo entero (${ent[0]}, ${ent[1]})`, data: [{ x: ent[0], y: ent[1] }], showLine: false,
                backgroundColor: '#fbc02d', borderColor: '#b71c1c', pointRadius: 7, pointStyle: 'rectRot' });
        }
    }
    new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            scales: {
                x: { min: 0, max: xmax, title: { display: true, text: `X₁ (${modelo.nombres[0]})` } },
                y: { min: 0, max: ymax, title: { display: true, text: `X₂ (${modelo.nombres[1]})` } }
            }
        }
    });
}