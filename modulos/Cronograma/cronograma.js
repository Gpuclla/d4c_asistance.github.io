(async function () {
  const U = Utils, esc = U.esc, C = Cronograma, T = Tareas, E = Equipo;
  const $ = s => document.querySelector(s);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ui = { q: '', mostrar: '', etapa: '', depto: '', persona: '', orden: 'inicio', dir: 1 };
  const cal = { vista: 'semana', ancla: U.hoy(), color: 'depto', venc: true };
  const PX = 48; // alto de una hora en el calendario
  // [fondo, borde]; el último es el gris para lo que no tiene etapa o departamento
  const PALETA = [['#DCEEF0', '#1F6F78'], ['#F6E3C8', '#B7791F'], ['#E4DDF3', '#6B4FB3'], ['#DDEBD3', '#4F8A2E'], ['#F5D9DD', '#B23A48'], ['#D9E4F5', '#2F5FA8'], ['#EFE1D4', '#8A5A33'], ['#E6E6E6', '#666666']];
  let d, ind, cf = new Map();

  // ---------- Ayudas ----------
  const act = ref => d.cronograma.find(a => a.id === ref || norm(a.codigo) === norm(ref));
  const persona = id => E.persona(d, id);
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const nombre = id => { const p = persona(id); return !id ? 'Sin asignar' : !p ? 'Persona eliminada' : p.nombre + (E.activa(p) ? '' : ' (ya no participa)'); };
  const etapaNombre = id => (d.etapas.find(e => e.id === id) || {}).nombre || '';
  const nEstado = k => (C.estados[k] || [k])[0];
  const tagEstado = k => `<span class="etiqueta ${(C.estados[k] || [])[1] || ''}">${esc(nEstado(k))}</span>`;
  const texto = s => esc(s).replace(/\n/g, '<br>');
  const cuando = ts => new Date(ts).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const aviso = t => { $('#aviso').innerHTML = `<p class="aviso-datos">${esc(t)}</p>`; };
  const opcion = (valor, t, sel) => `<option value="${esc(valor)}"${valor === sel ? ' selected' : ''}>${esc(t)}</option>`;
  const codTarea = t => t.codigo || t.id;
  const dt = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const iso = x => C.aStr(x).slice(0, 10);
  const sumar = (i, n) => { const x = dt(i); x.setDate(x.getDate() + n); return iso(x); };
  const lunes = i => { const x = dt(i); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
  const confirmadasTxt = a => a.participantes.length ? `${a.participantes.length - C.sinConfirmar(a).length}/${a.participantes.length} confirmaron` : '';

  // Insignias de una actividad abierta (se ven en la lista, el detalle y el panel)
  function insignias(a) {
    const r = [], cs = cf.get(a.id) || [];
    if (C.retrasada(a)) r.push(['bloqueada', 'Retrasada']);
    if (cs.some(c => c.n === 'alta')) r.push(['bloqueada', 'Conflicto']);
    if (C.abierta(a) && !C.retrasada(a)) {
      if (a.estado === 'provisional') r.push(['pendiente', 'Por confirmar']);
      else if (C.sinConfirmar(a).length) r.push(['pendiente', `${C.sinConfirmar(a).length} sin confirmar`]);
    }
    if (C.abierta(a) && a.reprogramaciones.length) r.push(['curso', 'Reprogramada']);
    return r;
  }
  const insigniasHtml = a => insignias(a).map(([c, x]) => `<span class="etiqueta ${c}">${esc(x)}</span>`).join(' ');

  async function recargar() {
    d = await DB.cargarTodo();
    const ops = C.migrar(d); // pone al día los hitos de la versión anterior
    if (ops.length) { await DB.lote(ops); d = await DB.cargarTodo(); }
    d.cronograma = d.cronograma.map(C.completa);
    d.tareas = d.tareas.map(T.completa);
    pintar();
  }

  // ---------- Guardado ----------
  async function guardarActividad(nueva, previa) {
    const ops = [];
    if (!previa) { const c = C.nuevoCodigo(d); nueva = { ...nueva, codigo: c.codigo, creada: U.hoy() }; ops.push(c.op); }
    const r = C.registrar(d, previa, nueva);
    if (!r) return false;
    const n = r.cambios.length;
    const resumen = previa ? `Actividad ${nueva.codigo}: ${r.cambios[0]}${n > 1 ? ` (y ${n - 1} ${n > 2 ? 'cambios' : 'cambio'} más)` : ''}` : `Se creó la actividad ${nueva.codigo} «${nueva.titulo}»`;
    ops.push(['guardar', 'cronograma', r.actividad], ['guardar', 'configuracion', DB.entrada(resumen)]);
    await DB.lote(ops);
    return true;
  }
  async function aplicar(nueva, previa) {
    try { await guardarActividad(nueva, previa); await recargar(); }
    catch (x) { console.warn(x); aviso('No se pudo guardar el cambio: la base local no está disponible.'); pintar(); }
  }
  function cambiarEstado(a, estado, dlg) {
    if (estado === 'cancelada' && !confirm(`¿Cancelar la actividad ${a.codigo} «${a.titulo}»?`)) return;
    if (dlg) dlg.close();
    aplicar(C.conEstado(a, estado), a);
  }

  // ---------- Filtros ----------
  function filtradas(conMostrar) {
    const q = norm(ui.q);
    const rapido = { hoy: ind.hoy, prox7: ind.prox7, confirmar: ind.porConfirmar, conflictos: ind.conflictos, retrasadas: ind.retrasadas, reprogramadas: ind.reprogramadas };
    const ids = conMostrar && rapido[ui.mostrar] ? new Set(rapido[ui.mostrar].map(a => a.id)) : null;
    return d.cronograma.filter(a => {
      if (ui.etapa && a.etapa !== ui.etapa) return false;
      if (ui.depto && a.departamento !== ui.depto) return false;
      if (ui.persona && !C.personasDe(a).includes(ui.persona)) return false;
      if (conMostrar && ui.mostrar) { if (ids ? !ids.has(a.id) : a.estado !== ui.mostrar) return false; }
      if (!q) return true;
      return norm([a.codigo, a.titulo, a.descripcion, a.lugar, a.departamento, etapaNombre(a.etapa), a.observaciones, ...C.personasDe(a).map(i => (persona(i) || {}).nombre)].join(' ')).includes(q);
    });
  }
  function filtros() {
    $('#f-mostrar').innerHTML = opcion('', 'Todas las actividades', ui.mostrar) + opcion('hoy', 'De hoy', ui.mostrar) + opcion('prox7', 'Próximos 7 días', ui.mostrar) +
      opcion('confirmar', 'Pendientes de confirmar', ui.mostrar) + opcion('conflictos', 'Con conflictos de disponibilidad', ui.mostrar) + opcion('retrasadas', 'Retrasadas', ui.mostrar) +
      opcion('reprogramadas', 'Reprogramadas', ui.mostrar) + Object.keys(C.estados).map(k => opcion(k, `Estado: ${nEstado(k)}`, ui.mostrar)).join('');
    $('#f-etapa').innerHTML = opcion('', 'Todas las etapas', ui.etapa) + d.etapas.map(e => opcion(e.id, e.nombre, ui.etapa)).join('');
    $('#f-depto').innerHTML = opcion('', 'Todos los departamentos', ui.depto) + C.departamentos(d).map(x => opcion(x, x, ui.depto)).join('');
    $('#f-persona').innerHTML = opcion('', 'Cualquier participante', ui.persona) + d.personas.slice().sort(porNombre).map(p => opcion(p.id, p.nombre + (E.activa(p) ? '' : ' (ya no participa)'), ui.persona)).join('');
    $('#q').value = ui.q;
  }

  // ---------- A. Panel del cronograma ----------
  function resumen() {
    const datos = [
      ['hoy', ind.hoy.length, 'Para hoy', 'actividades programadas'],
      ['prox7', ind.prox7.length, 'Próximos 7 días', 'incluye hoy'],
      ['confirmar', ind.porConfirmar.length, 'Por confirmar', 'horario o asistencia'],
      ['conflictos', ind.conflictos.length, 'Conflictos', 'de disponibilidad'],
      ['reprogramadas', ind.reprogramadas.length, 'Reprogramadas', 'con horario movido'],
      ['retrasadas', ind.retrasadas.length, 'Retrasadas', 'pasaron sin cerrarse']
    ];
    $('#resumen').innerHTML = datos.map(([f, n, t, s]) =>
      `<button class="dato${['conflictos', 'retrasadas'].includes(f) && n ? ' alerta' : ''}" data-filtro="${f}"><span class="dato-n">${n}</span><span class="dato-t">${t}</span><span class="dato-s">${s}</span></button>`).join('');

    const hoy = U.hoy();
    $('#proximas').innerHTML = ind.proximas.length ? ind.proximas.map(a => {
      const f = C.dia(a.inicio) < hoy ? hoy : C.dia(a.inicio);
      return `<li><button class="fila-boton" data-ver="${a.id}"><div class="fecha"><b>${U.dia(f)}</b><span>${U.mes(f)}</span></div>
        <div class="tarea"><strong>${esc(a.titulo)}</strong><span>${C.hora(a.inicio)}–${C.hora(a.fin)} · ${esc(a.lugar || a.departamento || a.codigo)}</span></div>
        <span class="vence">${a.estado === 'curso' ? 'en curso' : U.relativo(U.diasHasta(f))}</span></button></li>`;
    }).join('') : '<li class="vacio">No hay actividades próximas.</li>';

    const pronto = U.enDias(3), items = [];
    d.cronograma.filter(C.abierta).forEach(a => {
      if (C.retrasada(a)) items.push({ a, n: 'alta', t: `retrasada: terminaba el ${C.rango({ inicio: a.fin, fin: a.fin }).replace(/ \d\d:\d\d–\d\d:\d\d$/, '')} y sigue abierta` });
      else (cf.get(a.id) || []).filter(c => c.n === 'alta').forEach(c => items.push({ a, n: 'alta', t: c.t }));
      if (!C.retrasada(a) && C.dia(a.inicio) <= pronto) {
        if (a.estado === 'provisional') items.push({ a, n: 'aviso', t: 'horario provisional, a menos de 3 días' });
        else if (C.sinConfirmar(a).length) items.push({ a, n: 'aviso', t: `${C.sinConfirmar(a).length} participante(s) sin confirmar asistencia` });
      }
    });
    items.sort((x, y) => (x.n === 'alta' ? 0 : 1) - (y.n === 'alta' ? 0 : 1) || C.porInicio(x.a, y.a));
    $('#atencion').innerHTML = items.length ? items.slice(0, 12).map(({ a, n, t }) =>
      `<li class="${n}"><button class="fila-boton" data-ver="${a.id}"><strong>${esc(a.codigo)} · ${esc(a.titulo)}</strong><small>${esc(t)}</small></button></li>`).join('')
      : '<li class="vacio" style="border:0;background:none">Nada requiere atención por ahora.</li>';
  }

  // ---------- B. Calendario ----------
  function calendario() {
    const dias = cal.vista === 'dia' ? [cal.ancla] : Array.from({ length: 7 }, (_, i) => sumar(lunes(cal.ancla), i));
    $('#cal-titulo').textContent = cal.vista === 'dia' ? U.larga(dt(cal.ancla)) : `${U.corta(dias[0])} – ${U.corta(dias[6])} ${dt(dias[6]).getFullYear()}`;
    document.querySelectorAll('[data-vista]').forEach(b => b.setAttribute('aria-pressed', b.dataset.vista === cal.vista));
    const evs = filtradas(false).filter(a => a.estado !== 'cancelada');
    const pr = d.proyecto[0] || {}, hoy = U.hoy();

    let h0 = 8, h1 = 19;
    dias.forEach(i => C.delDia(evs, i).forEach(a => { const [s, e] = C.tramo(a, i); h0 = Math.min(h0, Math.floor(s / 60)); h1 = Math.max(h1, Math.ceil(e / 60)); }));
    const alto = (h1 - h0) * PX;

    const claves = cal.color === 'etapa' ? d.etapas.map(e => e.id) : C.departamentos(d);
    const clave = a => cal.color === 'etapa' ? a.etapa : a.departamento;
    const color = a => { const k = claves.indexOf(clave(a)); return k < 0 ? PALETA[7] : PALETA[k % 7]; };
    const usadas = [...new Set(evs.map(clave))];
    $('#leyenda').innerHTML = usadas.map(k => { const [bg, bd] = color({ etapa: k, departamento: k }); return `<span><i style="--bg:${bg};--bd:${bd}"></i>${esc(cal.color === 'etapa' ? etapaNombre(k) || 'Sin etapa' : k || 'Sin departamento')}</span>`; }).join('')
      + '<span><i class="punteada" style="--bd:#666"></i>Provisional (borde punteado)</span><span><i style="--bg:#e6e6e6;--bd:#666"></i>Confirmada</span>';

    let h = `<div class="cal-rejilla" style="--n:${dias.length}"><div class="cal-esq"></div>`;
    h += dias.map(i => `<div class="cal-cab${i === hoy ? ' hoy' : ''}"><button data-dia="${i}" title="Ver solo este día">${dt(i).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })}</button>${pr.inicioRodaje === i ? '<span class="etiqueta curso">Inicio de rodaje</span>' : ''}</div>`).join('');
    if (cal.venc) {
      h += '<div class="cal-esq cal-venc-t">Vencen</div>' + dias.map(i => `<div class="cal-venc">${d.tareas.filter(t => T.abierta(t) && t.vence === i)
        .map(t => `<a href="../tareas/tareas.html#${encodeURIComponent(codTarea(t))}" title="${esc(t.titulo)}">${esc(codTarea(t))}</a>`).join('')}</div>`).join('');
    }
    h += `<div class="cal-horas" style="height:${alto}px">${Array.from({ length: h1 - h0 + 1 }, (_, k) => `<span class="cal-h" style="top:${k * PX}px">${String(h0 + k).padStart(2, '0')}:00</span>`).join('')}</div>`;
    const ahoraMin = C.mins(C.hora(C.ahora()));
    h += dias.map(i => {
      const evsDia = carriles(C.delDia(evs, i), i);
      return `<div class="cal-dia${i === hoy ? ' hoy' : ''}" data-fecha="${i}" data-h0="${h0}" style="height:${alto}px">` +
        evsDia.map(({ a, s, e, l, n }) => {
          const [bg, bd] = color(a), alta = (cf.get(a.id) || []).some(c => c.n === 'alta'), px = Math.max(22, (e - s) * PX / 60);
          return `<button class="ev est-${a.estado}" data-ver="${a.id}" title="${esc(`${a.codigo} · ${a.titulo} · ${nEstado(a.estado)} · ${C.rango(a)}${a.lugar ? ' · ' + a.lugar : ''}`)}"
            style="top:${(s - h0 * 60) * PX / 60}px;height:${px}px;left:${l / n * 100}%;width:${100 / n}%;--bg:${bg};--bd:${bd}">
            ${alta ? '<span class="ev-x" aria-label="Con conflicto">!</span>' : ''}<span class="ev-h">${C.hora(a.inicio)}–${C.hora(a.fin)}</span><b>${esc(a.titulo)}</b>${px >= 62 && a.lugar ? `<small>${esc(a.lugar)}</small>` : ''}</button>`;
        }).join('') +
        (i === hoy && ahoraMin >= h0 * 60 && ahoraMin <= h1 * 60 ? `<div class="ahora" style="top:${(ahoraMin - h0 * 60) * PX / 60}px"></div>` : '') + '</div>';
    }).join('');
    $('#cal').innerHTML = h + '</div>';
  }

  // Reparte en carriles las actividades que se superponen en un mismo día
  function carriles(lista, dia) {
    const items = lista.map(a => { const [s, e] = C.tramo(a, dia); return { a, s, e }; }).sort((x, y) => x.s - y.s || y.e - x.e);
    const out = []; let grupo = [], fin = -1;
    const cerrar = () => { const n = Math.max(...grupo.map(g => g.l)) + 1; grupo.forEach(g => { g.n = n; out.push(g); }); grupo = []; };
    for (const it of items) {
      if (grupo.length && it.s >= fin) { cerrar(); fin = -1; }
      const usados = grupo.filter(g => g.e > it.s).map(g => g.l);
      let l = 0; while (usados.includes(l)) l++;
      it.l = l; grupo.push(it); fin = Math.max(fin, it.e);
    }
    if (grupo.length) cerrar();
    return out;
  }

  // ---------- C. Lista de actividades ----------
  function comparar(a, b) {
    const k = ui.orden; let r = 0;
    if (k === 'duracion') r = (C.minutos(a) || 0) - (C.minutos(b) || 0);
    else if (k === 'etapa') r = etapaNombre(a.etapa).localeCompare(etapaNombre(b.etapa), 'es');
    else if (k === 'depto') r = a.departamento.localeCompare(b.departamento, 'es');
    else if (k === 'estado') r = Object.keys(C.estados).indexOf(a.estado) - Object.keys(C.estados).indexOf(b.estado);
    else if (k === 'titulo') r = a.titulo.localeCompare(b.titulo, 'es');
    else if (k === 'codigo') r = a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    else r = a.inicio.localeCompare(b.inicio);
    return r * ui.dir || C.porInicio(a, b);
  }
  function lista() {
    const as = filtradas(true).sort(comparar);
    document.querySelectorAll('th .orden').forEach(b => b.parentElement.setAttribute('aria-sort', b.dataset.orden === ui.orden ? (ui.dir > 0 ? 'ascending' : 'descending') : 'none'));
    $('#lista-filas').innerHTML = as.length ? as.map(a => {
      const nombres = a.participantes.map(i => (persona(i) || {}).nombre || '?');
      return `<tr data-ver="${a.id}">
        <td><span class="codigo">${esc(a.codigo)}</span></td>
        <td><strong>${esc(a.titulo)}</strong><br><small class="tenue">${esc([a.departamento, etapaNombre(a.etapa)].filter(Boolean).join(' · ') || 'Sin departamento')}</small></td>
        <td>${esc(C.rango(a))}</td><td>${esc(C.durTxt(C.minutos(a)))}</td><td>${esc(a.lugar) || '<span class="tenue">—</span>'}</td>
        <td>${nombres.length ? `${esc(nombres.slice(0, 2).join(', '))}${nombres.length > 2 ? ` +${nombres.length - 2}` : ''}<br><small class="tenue">${esc(confirmadasTxt(a))}</small>` : '<span class="tenue">—</span>'}</td>
        <td>${tagEstado(a.estado)}<div class="t-avisos">${insigniasHtml(a)}</div></td>
        <td><button class="btn" data-editar="${a.id}">Editar</button></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="vacio tenue">Ninguna actividad coincide con los filtros.</td></tr>';
    $('#lista-total').textContent = `${as.length} de ${d.cronograma.length} actividades`;
  }

  function vistas() { calendario(); lista(); }
  function pintar() {
    cf = new Map(d.cronograma.map(a => [a.id, C.conflictos(d, a)]));
    ind = C.indicadores(d);
    Lateral.proyecto(d.proyecto[0]); resumen(); filtros(); vistas();
  }
  function pestana(id) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    ['panel', 'calendario', 'lista'].forEach(t => { $('#tab-' + t).hidden = t !== id; });
    $('#filtros').hidden = id === 'panel';
    $('#f-mostrar').hidden = id !== 'lista';
  }
  function irALista(mostrar) {
    Object.assign(ui, { q: '', mostrar, etapa: '', depto: '', persona: '' });
    filtros(); pestana('lista'); vistas();
  }

  // ---------- Detalle ----------
  function detalle(id) {
    const a = act(id); if (!a) return;
    const dlg = document.createElement('dialog');
    const fila = (k, v) => `<dt>${k}</dt><dd>${v || '<span class="tenue">—</span>'}</dd>`;
    const chipAct = x => `<button type="button" class="etq-tarea" data-abrir="${x.id}">${esc(x.codigo)} · ${esc(x.titulo)}</button>`;
    const preds = a.predecesoras.map(p => ({ b: C.porId(d, p.id), tipo: p.tipo })).filter(p => p.b);
    const tareas = a.tareas.map(i => d.tareas.find(t => t.id === i)).filter(Boolean);
    const cs = cf.get(a.id) || [];
    const rapidas = {
      provisional: [['confirmada', 'Confirmar horario']], confirmada: [['curso', 'Iniciar'], ['provisional', 'Volver a provisional']],
      curso: [['realizada', 'Marcar como realizada']], realizada: [['confirmada', 'Reabrir']], cancelada: [['confirmada', 'Reabrir']]
    }[a.estado] || [];
    const botones = rapidas.map(([e, t]) => `<button type="button" class="btn" data-estado="${e}">${t}</button>`).join('') + (C.abierta(a) ? '<button type="button" class="btn" data-estado="cancelada">Cancelar actividad</button>' : '');
    dlg.innerHTML = `<div class="formulario detalle">
      <p class="tenue">${esc(a.codigo)}${a.etapa ? ' · ' + esc(etapaNombre(a.etapa)) : ''}${a.departamento ? ' · ' + esc(a.departamento) : ''}</p>
      <h2 style="margin-bottom:8px">${esc(a.titulo)}</h2>
      <p>${tagEstado(a.estado)} ${insigniasHtml(a)}</p>
      <div class="rapidas">${botones}</div>
      ${cs.length ? `<h3>Conflictos</h3><ul class="alertas" style="margin-top:8px">${cs.map(c => `<li class="${c.n}" style="padding:7px 12px">${esc(c.t)}</li>`).join('')}</ul>` : ''}
      <h3>Identificación</h3><dl class="ficha">${fila('Descripción', texto(a.descripcion))}${fila('Lugar', esc(a.lugar))}${fila('Etapa', esc(etapaNombre(a.etapa)))}${fila('Departamento', esc(a.departamento))}</dl>
      <h3>Planificación temporal</h3><dl class="ficha">${fila('Horario', esc(C.rango(a)))}${fila('Duración', esc(C.durTxt(C.minutos(a))))}
        ${a.inicioReal || a.finReal ? fila('Real', esc(`${a.inicioReal ? a.inicioReal.replace('T', ' ') : '—'} → ${a.finReal ? a.finReal.replace('T', ' ') : '—'}`)) : ''}</dl>
      <h3>Participantes</h3><dl class="ficha">${fila('Responsable', esc(a.responsable ? nombre(a.responsable) : ''))}
        ${fila('Participantes', a.participantes.map(i => `${esc(nombre(i))} ${a.confirmados.includes(i) ? '<span class="etiqueta confirmada">Confirmó</span>' : '<span class="etiqueta pendiente">Sin confirmar</span>'}`).join('<br>'))}</dl>
      <h3>Dependencias y relaciones</h3><dl class="ficha">
        ${fila('Tareas vinculadas', tareas.map(t => `<a class="etq-tarea" href="../tareas/tareas.html#${encodeURIComponent(codTarea(t))}">${esc(codTarea(t))} · ${esc(t.titulo)}${t.estado === 'hecha' ? ' (hecha)' : ''}</a>`).join(''))}
        ${fila('Predecesoras', preds.map(p => `${chipAct(p.b)}<small class="tenue">${esc(C.relaciones[p.tipo] || '')}</small>`).join('<br>'))}
        ${fila('Le siguen', C.sucesoras(d, a).map(chipAct).join(''))}</dl>
      <h3>Seguimiento</h3><dl class="ficha">${fila('Estado', esc(nEstado(a.estado)))}${fila('Observaciones', texto(a.observaciones))}${fila('Última actualización', esc(a.actualizada ? U.corta(a.actualizada) : ''))}
        ${a.reprogramaciones.length ? fila('Reprogramaciones', a.reprogramaciones.map(r => `${esc(cuando(r.ts))}: ${esc(C.rango({ inicio: r.deInicio, fin: r.deFin }))} → ${esc(C.rango({ inicio: r.aInicio, fin: r.aFin }))}<br><small class="tenue">Motivo: ${esc(r.motivo)}</small>`).join('<br>')) : ''}</dl>
      <h3>Registro de cambios</h3>
      <ul class="cambios">${a.cambios.length ? a.cambios.slice(-15).reverse().map(c => `<li><span>${esc(cuando(c.ts))}</span>${esc(c.texto)}</li>`).join('') : '<li class="tenue">Sin cambios registrados.</li>'}</ul>
      <div class="acciones"><button type="button" class="btn peligro" data-eliminar>Eliminar</button><button type="button" class="btn" data-x>Cerrar</button><button type="button" class="btn primario" data-editar-det>Editar</button></div></div>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.abrir) { dlg.close(); detalle(b.dataset.abrir); }
      else if (b.dataset.estado) cambiarEstado(a, b.dataset.estado, dlg);
      else if ('x' in b.dataset) dlg.close();
      else if ('editarDet' in b.dataset) { dlg.close(); formActividad(a); }
      else if ('eliminar' in b.dataset) eliminar(a, dlg);
    });
    dlg.showModal();
  }

  async function eliminar(a, dlg) {
    const suc = C.sucesoras(d, a);
    if (!confirm(`¿Eliminar la actividad ${a.codigo} «${a.titulo}»?${suc.length ? `\n\nDejará de ser predecesora de: ${suc.map(x => x.codigo).join(', ')}.` : ''}\n\nEsta acción no se puede deshacer.`)) return;
    const ops = [['borrar', 'cronograma', a.id]];
    suc.forEach(x => { const r = C.registrar(d, x, { ...x, predecesoras: x.predecesoras.filter(p => p.id !== a.id) }); if (r) ops.push(['guardar', 'cronograma', r.actividad]); });
    ops.push(['guardar', 'configuracion', DB.entrada(`Se eliminó la actividad ${a.codigo} «${a.titulo}»`)]);
    try { await DB.lote(ops); dlg.close(); await recargar(); }
    catch (x) { console.warn(x); aviso('No se pudo eliminar la actividad.'); }
  }

  // ---------- D. Registro de actividades (formulario en cinco grupos) ----------
  // Lee el formulario y devuelve la actividad que describe (sin validar)
  function leer(f, base) {
    const v = Object.fromEntries(new FormData(f)), marcados = n => [...f.querySelectorAll(`[name=${n}]:checked`)].map(x => x.value);
    const part = marcados('part');
    if (v.responsable && !part.includes(v.responsable)) part.push(v.responsable); // el responsable siempre participa
    return { ...base, titulo: (v.titulo || '').trim(), descripcion: (v.descripcion || '').trim(), etapa: v.etapa, departamento: v.departamento, lugar: (v.lugar || '').trim(),
      inicio: v.inicio || '', fin: v.fin || '', inicioReal: v.inicioReal || '', finReal: v.finReal || '',
      responsable: v.responsable, participantes: part, confirmados: marcados('conf').filter(i => part.includes(i)),
      tareas: marcados('tarea'), predecesoras: marcados('pred').map(i => ({ id: i, tipo: f.elements['tipo_' + i].value })),
      estado: v.estado, observaciones: (v.observaciones || '').trim() };
  }
  const conReemplazo = (previa, n) => ({ ...d, cronograma: previa ? d.cronograma.map(x => x.id === previa.id ? n : x) : [...d.cronograma, n] });

  function formActividad(previa, prefijo = {}) {
    const pr = d.proyecto[0] || {};
    const a = previa || { ...C.vacia(), etapa: pr.etapa || '', ...prefijo };
    const ids = new Set([a.responsable, ...a.participantes]);
    const personas = d.personas.filter(p => E.activa(p) || ids.has(p.id)).sort(porNombre);
    const deptos = [...new Set(C.departamentos(d).concat(a.departamento ? [a.departamento] : []))].sort((x, y) => x.localeCompare(y, 'es'));
    const etapas = !a.etapa || d.etapas.some(e => e.id === a.etapa) ? d.etapas : d.etapas.concat([{ id: a.etapa, nombre: a.etapa }]);
    const otras = d.cronograma.filter(x => x.id !== a.id && !(previa && C.creaCiclo(d, previa.id, [x.id]))).sort(C.porInicio);
    const cod = previa ? a.codigo : C.nuevoCodigo(d).codigo;
    const grupos = ['Identificación', 'Horario', 'Participantes', 'Relaciones', 'Seguimiento'];

    const campos = `<div class="pestanas" role="tablist">${grupos.map((g, i) => `<button type="button" role="tab" data-g="${i + 1}" aria-selected="${i === 0}">${g}</button>`).join('')}</div>
      <div data-panel="1">
        <p class="tenue" style="margin-bottom:12px">ID de actividad: <strong style="color:var(--tinta)">${esc(cod)}</strong>${previa ? '' : ' (se asigna al guardar y no cambia nunca)'}</p>
        <label>Nombre<input name="titulo" maxlength="140" autocomplete="off" placeholder="Ej. Prueba de cámara"></label>
        <label>Descripción: qué se realizará<textarea name="descripcion" rows="2"></textarea></label>
        <div class="par">
          <label>Etapa<select name="etapa"><option value="">Sin etapa</option>${etapas.map(e => opcion(e.id, e.nombre, a.etapa)).join('')}</select></label>
          <label>Departamento<select name="departamento"><option value="">Sin departamento</option>${deptos.map(x => opcion(x, x, a.departamento)).join('')}</select></label>
        </div>
        <label>Lugar<input name="lugar" maxlength="140" autocomplete="off" placeholder="Si corresponde"></label>
      </div>
      <div data-panel="2" hidden>
        <div class="par"><label>Inicio<input name="inicio" type="datetime-local"></label><label>Finalización<input name="fin" type="datetime-local"></label></div>
        <p class="nota" id="duracion" style="margin:-4px 0 12px"></p>
        <div id="b-reales" hidden><div class="par"><label>Inicio real<input name="inicioReal" type="datetime-local"></label><label>Finalización real<input name="finReal" type="datetime-local"></label></div></div>
        <p class="nota">La duración se calcula sola con el inicio y el fin. Si el horario es provisional o confirmado se elige con el estado, en el grupo Seguimiento.</p>
      </div>
      <div data-panel="3" hidden>
        <label>Responsable de la actividad<select name="responsable"><option value="">Sin responsable</option>${personas.map(p => opcion(p.id, p.nombre + (E.activa(p) ? '' : ' (ya no participa)'), a.responsable)).join('')}</select></label>
        <fieldset class="lista-check"><legend>Participantes</legend>
          ${personas.map(p => `<div class="fila-part"><label><input type="checkbox" name="part" value="${p.id}"${a.participantes.includes(p.id) ? ' checked' : ''}> <span>${esc(p.nombre)}${E.activa(p) ? '' : ' (ya no participa)'}</span></label>
            <label><input type="checkbox" name="conf" value="${p.id}"${a.confirmados.includes(p.id) ? ' checked' : ''}> <span>Confirmó</span></label></div>`).join('') || '<span class="tenue">No hay personas registradas.</span>'}
        </fieldset>
        <p class="nota">Las personas salen del módulo Equipo y cargos. El responsable se incluye siempre entre los participantes. Marca «Confirmó» cuando la persona ya avisó que asistirá.</p>
      </div>
      <div data-panel="4" hidden>
        <fieldset class="lista-check"><legend>Tareas vinculadas (de Gestión de tareas)</legend>
          ${d.tareas.slice().sort((x, y) => codTarea(x).localeCompare(codTarea(y), undefined, { numeric: true })).map(t => `<label><input type="checkbox" name="tarea" value="${t.id}"${a.tareas.includes(t.id) ? ' checked' : ''}> <span>${esc(codTarea(t))} · ${esc(t.titulo)}${t.estado === 'hecha' ? ' (hecha)' : ''}</span></label>`).join('') || '<span class="tenue">Aún no hay tareas.</span>'}
        </fieldset>
        <fieldset class="lista-check"><legend>Actividades predecesoras (opcional)</legend>
          ${otras.map(x => { const p = a.predecesoras.find(q => q.id === x.id); return `<div class="fila-part"><label><input type="checkbox" name="pred" value="${x.id}"${p ? ' checked' : ''}> <span>${esc(x.codigo)} · ${esc(x.titulo)}</span></label>
            <select name="tipo_${x.id}" aria-label="Tipo de relación con ${esc(x.codigo)}">${Object.entries(C.relaciones).map(([k, t]) => opcion(k, t, p ? p.tipo : 'fin')).join('')}</select></div>`; }).join('') || '<span class="tenue">Aún no hay otras actividades.</span>'}
        </fieldset>
        <p class="nota">Ninguna dependencia es obligatoria. «Depende de su finalización» significa que no puede empezar antes de que la otra termine.</p>
      </div>
      <div data-panel="5" hidden>
        <label>Estado<select name="estado">${Object.keys(C.estados).map(k => opcion(k, nEstado(k), a.estado)).join('')}</select></label>
        <label id="l-motivo" hidden>Motivo de la reprogramación<textarea name="motivo" rows="2" placeholder="Por qué cambió el horario"></textarea></label>
        <label>Observaciones: restricciones, necesidades, incidencias y acuerdos<textarea name="observaciones" rows="3"></textarea></label>
        <p class="nota">Última actualización: ${previa && a.actualizada ? esc(U.corta(a.actualizada)) : 'se registrará al guardar'}. Se completa sola en cada cambio.</p>
        ${previa && a.reprogramaciones.length ? `<h4>Reprogramaciones</h4><ul class="cambios">${a.reprogramaciones.slice().reverse().map(r => `<li><span>${esc(cuando(r.ts))}</span>${esc(C.rango({ inicio: r.deInicio, fin: r.deFin }))} → ${esc(C.rango({ inicio: r.aInicio, fin: r.aFin }))} · ${esc(r.motivo)}</li>`).join('')}</ul>` : ''}
        <h4>Registro de cambios</h4>
        <ul class="cambios">${previa && a.cambios.length ? a.cambios.slice(-15).reverse().map(c => `<li><span>${esc(cuando(c.ts))}</span>${esc(c.texto)}</li>`).join('') : '<li class="tenue">Los cambios quedarán registrados desde que guardes la actividad.</li>'}</ul>
      </div>
      <div id="conflictos" role="status"></div>`;

    const dlg = Formulario.abrir(previa ? `Editar ${a.codigo}` : 'Nueva actividad', campos, a, async (v, f) => {
      const fallo = (g, m) => { irAGrupo(g); return m; };
      let n = leer(f, previa || { ...C.vacia(), id: U.id('a') });
      if (!n.titulo) return fallo(1, 'Escribe el nombre de la actividad.');
      if (!n.inicio || !n.fin) return fallo(2, 'Indica el inicio y la finalización.');
      if (n.fin <= n.inicio) return fallo(2, 'La finalización debe ser posterior al inicio.');
      if (n.inicioReal && n.finReal && n.finReal < n.inicioReal) return fallo(2, 'La finalización real no puede ser anterior al inicio real.');
      if (previa && C.creaCiclo(d, previa.id, n.predecesoras.map(p => p.id))) return fallo(4, 'Esas predecesoras crean un ciclo entre actividades.');
      n = C.ajustarReales(n);
      if (C.esReprogramacion(previa, n)) {
        const motivo = (v.motivo || '').trim();
        if (!motivo) return fallo(5, 'Indica el motivo de la reprogramación.');
        n = C.conReprogramacion(previa, n, motivo);
      }
      const antes = new Set(previa ? C.conflictos(d, previa).filter(c => c.n === 'alta').map(c => c.t) : []);
      const nuevos = C.conflictos(conReemplazo(previa, n), n).filter(c => c.n === 'alta' && !antes.has(c.t));
      if (nuevos.length && !confirm(`Esta actividad tiene conflictos:\n\n• ${nuevos.map(c => c.t).join('\n• ')}\n\n¿Guardarla igualmente?`)) return fallo(3, 'No se guardó: revisa los conflictos.');
      await guardarActividad(n, previa);
    }, recargar);

    const f = dlg.querySelector('form'), $d = s => dlg.querySelector(s), g = n => f.elements[n].value;
    function irAGrupo(n) {
      dlg.querySelectorAll('[data-g]').forEach(b => b.setAttribute('aria-selected', b.dataset.g == n));
      dlg.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel != n; });
    }
    function refrescar() {
      dlg.querySelectorAll('[name=part]').forEach(p => { const c = f.querySelector(`[name=conf][value="${p.value}"]`); c.disabled = !p.checked; if (!p.checked) c.checked = false; });
      f.querySelectorAll('[name=pred]').forEach(p => { f.elements['tipo_' + p.value].disabled = !p.checked; });
      const t = leer(f, previa || { ...C.vacia(), id: '__nueva' }), min = C.minutos(t);
      $d('#duracion').textContent = !t.inicio || !t.fin ? '' : min > 0 ? `Duración: ${C.durTxt(min)}` : 'La finalización debe ser posterior al inicio.';
      $d('#b-reales').hidden = !(g('estado') === 'curso' || g('estado') === 'realizada');
      $d('#l-motivo').hidden = !(t.inicio && t.fin && C.esReprogramacion(previa, t));
      const cs = t.inicio && t.fin && t.fin > t.inicio ? C.conflictos(conReemplazo(previa, t), t) : [];
      $d('#conflictos').innerHTML = cs.length ? `<ul class="alertas">${cs.map(c => `<li class="${c.n}">${esc(c.t)}</li>`).join('')}</ul>` : '';
    }
    dlg.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) irAGrupo(b.dataset.g); });
    dlg.addEventListener('change', e => {
      if (e.target.name === 'estado' && (g('estado') === 'curso' || g('estado') === 'realizada')) {
        const r = C.ajustarReales(leer(f, a)); // propone las horas reales; se pueden corregir
        if (!g('inicioReal')) f.elements.inicioReal.value = r.inicioReal;
        if (!g('finReal')) f.elements.finReal.value = r.finReal;
      }
      refrescar();
    });
    dlg.addEventListener('input', refrescar);
    refrescar();
  }

  // ---------- Eventos ----------
  const mover = n => { cal.ancla = n === 0 ? U.hoy() : sumar(cal.ancla, n * (cal.vista === 'dia' ? 1 : 7)); calendario(); };
  document.addEventListener('click', e => {
    const b = e.target.closest('button'), ds = b ? b.dataset : {};
    if (b && ds.tab) return pestana(ds.tab);
    if (b && 'nueva' in ds) return formActividad();
    if (b && 'filtro' in ds) return irALista(ds.filtro);
    if (b && ds.editar) return formActividad(act(ds.editar));
    if (b && ds.orden) { if (ui.orden === ds.orden) ui.dir *= -1; else { ui.orden = ds.orden; ui.dir = 1; } return lista(); }
    if (b && 'nav' in ds) return mover(+ds.nav);
    if (b && ds.vista) { cal.vista = ds.vista; return calendario(); }
    if (b && ds.dia) { cal.ancla = ds.dia; cal.vista = 'dia'; return calendario(); }
    if (b && b.id === 'limpiar') { Object.assign(ui, { q: '', mostrar: '', etapa: '', depto: '', persona: '' }); filtros(); return vistas(); }
    const v = e.target.closest('[data-ver]');
    if (v && !e.target.closest('dialog')) return detalle(v.dataset.ver);
    // clic en un hueco del calendario: nueva actividad a esa hora (redondeada a 30 min)
    const col = e.target.closest('.cal-dia');
    if (col && !e.target.closest('.ev')) {
      const m = +col.dataset.h0 * 60 + Math.floor((e.clientY - col.getBoundingClientRect().top) / PX * 2) * 30, hh = x => `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
      formActividad(null, { inicio: `${col.dataset.fecha}T${hh(m)}`, fin: `${col.dataset.fecha}T${hh(Math.min(m + 60, 1439))}` });
    }
  });
  [['#q', 'q', 'input'], ['#f-mostrar', 'mostrar', 'change'], ['#f-etapa', 'etapa', 'change'], ['#f-depto', 'depto', 'change'], ['#f-persona', 'persona', 'change']]
    .forEach(([s, k, ev]) => $(s).addEventListener(ev, e => { ui[k] = e.target.value; vistas(); }));
  $('#cal-color').addEventListener('change', e => { cal.color = e.target.value; calendario(); });
  $('#ver-venc').addEventListener('change', e => { cal.venc = e.target.checked; calendario(); });

  // ---------- Arranque ----------
  try { await DB.iniciar(); await recargar(); }
  catch (x) {
    console.warn('Base local no disponible:', x);
    d = SEMILLAS; d.cronograma = d.cronograma.map(C.completa); d.tareas = d.tareas.map(T.completa);
    aviso('No se pudo abrir la base local. Se muestran datos de ejemplo y los cambios no se guardarán.');
    pintar();
  }
  pestana('panel');
  const ref = decodeURIComponent(location.hash.slice(1)); // enlaces del tipo cronograma.html#A-003
  if (ref && act(ref)) detalle(act(ref).id);
})();
