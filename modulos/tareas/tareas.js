(async function () {
  const U = Utils, esc = U.esc, T = Tareas, E = Equipo;
  const $ = s => document.querySelector(s);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ui = { q: '', estado: '', prioridad: '', depto: '', etapa: '', persona: '', orden: 'vence', dir: 1 };
  const ESTADOS = Object.keys(T.estados);
  let d;

  // ---------- Ayudas ----------
  const tarea = ref => d.tareas.find(t => t.id === ref || norm(t.codigo) === norm(ref));
  const persona = id => E.persona(d, id);
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
  const nombre = id => { const p = persona(id); return !id ? 'Sin asignar' : !p ? 'Persona eliminada' : p.nombre + (E.activa(p) ? '' : ' (ya no participa)'); };
  const etapaNombre = id => (d.etapas.find(e => e.id === id) || {}).nombre || '';
  const nEstado = k => (T.estados[k] || [k])[0];
  const nPrio = k => (T.prioridades[k] || [k])[0];
  const tagEstado = k => `<span class="etiqueta ${(T.estados[k] || [])[1] || ''}">${esc(nEstado(k))}</span>`;
  const tagPrio = k => `<span class="etiqueta ${(T.prioridades[k] || [])[1] || ''}">${esc(nPrio(k))}</span>`;
  const texto = s => esc(s).replace(/\n/g, '<br>');
  const cuando = ts => new Date(ts).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const aviso = t => { $('#aviso').innerHTML = `<p class="aviso-datos">${esc(t)}</p>`; };
  const opcion = (valor, texto, sel) => `<option value="${esc(valor)}"${valor === sel ? ' selected' : ''}>${esc(texto)}</option>`;

  async function recargar() {
    d = await DB.cargarTodo();
    const ops = T.migrar(d); // pone al día las tareas guardadas con la versión anterior
    if (ops.length) { await DB.lote(ops); d = await DB.cargarTodo(); }
    d.tareas = d.tareas.map(T.completa);
    pintar();
  }

  // ---------- Guardado ----------
  // Guarda la tarea, su registro de cambios, el contador de códigos y el historial general en una sola transacción
  async function guardarTarea(nueva, previa) {
    const ops = [];
    if (!previa) { const c = T.nuevoCodigo(d); nueva = { ...nueva, codigo: c.codigo, creada: U.hoy() }; ops.push(c.op); }
    const r = T.registrar(d, previa, nueva);
    if (!r) return false;
    const n = r.cambios.length;
    const resumen = previa ? `Tarea ${nueva.codigo}: ${r.cambios[0]}${n > 1 ? ` (y ${n - 1} ${n > 2 ? 'cambios' : 'cambio'} más)` : ''}` : `Se creó la tarea ${nueva.codigo} «${nueva.titulo}»`;
    ops.push(['guardar', 'tareas', r.tarea], ['guardar', 'configuracion', DB.entrada(resumen)]);
    await DB.lote(ops);
    return true;
  }
  async function aplicar(nueva, previa) {
    try { await guardarTarea(nueva, previa); await recargar(); }
    catch (x) { console.warn(x); aviso('No se pudo guardar el cambio: la base local no está disponible.'); pintar(); }
  }

  async function mover(id, estado) {
    const t = tarea(id);
    pintar(); // devuelve el selector a su valor si se cancela
    if (!t || t.estado === estado || !T.estados[estado]) return;
    if (estado === 'bloqueada') return pedirMotivo(t);
    const pend = T.pendientesDeps(d, t);
    if ((estado === 'curso' || estado === 'hecha') && pend.length &&
      !confirm(`${t.codigo} depende de ${pend.map(x => x.codigo).join(', ')}, que aún no está terminada. ¿Mover igualmente a «${nEstado(estado)}»?`)) return;
    await aplicar(T.conEstado(t, estado), t);
  }

  function pedirMotivo(t) {
    Formulario.abrir('Tarea bloqueada', `<p class="tenue" style="margin-bottom:10px">${esc(t.codigo)} · ${esc(t.titulo)}</p>
      <label>¿Qué impide continuar?<textarea name="motivo" rows="3" autocomplete="off"></textarea></label>`, { motivo: t.motivoBloqueo }, async v => {
      if (!v.motivo.trim()) return 'Indica el motivo del bloqueo.';
      await guardarTarea(T.conEstado(t, 'bloqueada', v.motivo.trim()), t);
    }, recargar);
  }

  // ---------- Filtros ----------
  function filtradas(conEstado) {
    const q = norm(ui.q);
    return d.tareas.filter(t => {
      if (ui.prioridad && t.prioridad !== ui.prioridad) return false;
      if (ui.depto && t.departamento !== ui.depto) return false;
      if (ui.etapa && t.etapa !== ui.etapa) return false;
      if (ui.persona === '__ninguna') { if (t.resp) return false; }
      else if (ui.persona && !T.personasDe(t).includes(ui.persona)) return false;
      if (conEstado && ui.estado) {
        if (ui.estado === 'vencidas') { if (!T.vencida(t)) return false; }
        else if (t.estado !== ui.estado) return false;
      }
      if (!q) return true;
      return norm([t.codigo, t.titulo, t.descripcion, t.criterio, t.observaciones, t.departamento, etapaNombre(t.etapa),
        ...T.personasDe(t).map(id => (persona(id) || {}).nombre)].join(' ')).includes(q);
    });
  }

  function filtros() {
    $('#f-estado').innerHTML = opcion('', 'Todos los estados', ui.estado) + ESTADOS.map(k => opcion(k, nEstado(k), ui.estado)).join('') + opcion('vencidas', 'Vencidas', ui.estado);
    $('#f-prioridad').innerHTML = opcion('', 'Toda prioridad', ui.prioridad) + Object.keys(T.prioridades).map(k => opcion(k, nPrio(k), ui.prioridad)).join('');
    $('#f-depto').innerHTML = opcion('', 'Todos los departamentos', ui.depto) + T.departamentos(d).map(x => opcion(x, x, ui.depto)).join('');
    $('#f-persona').innerHTML = opcion('', 'Cualquier persona', ui.persona) + opcion('__ninguna', 'Sin responsable', ui.persona) +
      d.personas.slice().sort(porNombre).map(p => opcion(p.id, p.nombre + (E.activa(p) ? '' : ' (ya no participa)'), ui.persona)).join('');
    $('#f-etapa').innerHTML = opcion('', 'Todas las etapas', ui.etapa) + d.etapas.map(e => opcion(e.id, e.nombre, ui.etapa)).join('');
    $('#q').value = ui.q;
  }

  // ---------- A. Panel de tareas ----------
  function resumen() {
    const i = T.indicadores(d);
    const datos = [
      ['', i.total, 'Total de tareas', `${i.abiertas} abiertas`],
      ['pendiente', i.pendientes, 'Pendientes', 'sin iniciar'],
      ['curso', i.curso, 'En curso', 'en marcha'],
      ['hecha', i.hechas, 'Completadas', i.total ? `${Math.round(i.hechas / i.total * 100)}% del total` : 'sin tareas'],
      ['vencidas', i.vencidas, 'Vencidas', 'abiertas con plazo pasado'],
      ['bloqueada', i.bloqueadas, 'Bloqueadas', 'esperan una solución']
    ];
    $('#resumen').innerHTML = datos.map(([f, n, t, s]) =>
      `<button class="dato${(f === 'vencidas' || f === 'bloqueada') && n ? ' alerta' : ''}" data-filtro="${f}"><span class="dato-n">${n}</span><span class="dato-t">${t}</span><span class="dato-s">${s}</span></button>`).join('');

    const prox = i.proximos;
    $('#proximos').innerHTML = prox.length ? prox.map(t =>
      `<li><button class="fila-boton" data-ver="${t.id}"><div class="fecha"><b>${U.dia(t.vence)}</b><span>${U.mes(t.vence)}</span></div>
        <div class="tarea"><strong>${esc(t.titulo)}</strong><span>${esc(t.codigo)} · ${esc(nombre(t.resp))}</span></div>
        <span class="vence">${U.relativo(T.dias(t))}</span></button></li>`).join('') : '<li class="vacio">No hay vencimientos próximos.</li>';

    const items = d.tareas.filter(T.abierta).flatMap(t => T.avisos(d, t).map(a => ({ t, a })))
      .sort((x, y) => (x.a.n === 'alta' ? 0 : 1) - (y.a.n === 'alta' ? 0 : 1) || T.porFecha(x.t, y.t)).slice(0, 12);
    $('#atencion').innerHTML = items.length ? items.map(({ t, a }) =>
      `<li class="${a.n}"><button class="fila-boton" data-ver="${t.id}"><strong>${esc(t.codigo)} · ${esc(t.titulo)}</strong><small>${esc(a.t)}</small></button></li>`).join('')
      : '<li class="vacio" style="border:0;background:none">Nada requiere atención por ahora.</li>';
  }

  // ---------- B. Tablero Kanban ----------
  function tarjeta(t) {
    const chips = [];
    if (T.abierta(t)) {
      const p = persona(t.resp);
      if (!t.resp) chips.push(['pendiente', 'Sin responsable']);
      else if (p && !E.activa(p)) chips.push(['bloqueada', 'Responsable ya no participa']);
      const pd = T.pendientesDeps(d, t);
      if (pd.length) chips.push(['', `Espera ${pd.map(x => x.codigo).join(', ')}`]);
    }
    return `<article class="tarjeta pr-${esc(t.prioridad)}" draggable="true" tabindex="0" data-ver="${t.id}" data-id="${t.id}" aria-label="${esc(t.codigo + ' ' + t.titulo)}">
      <div class="t-top"><span class="codigo">${esc(t.codigo)}</span>${tagPrio(t.prioridad)}</div>
      <strong>${esc(t.titulo)}</strong>
      <div class="t-meta"><span>${esc(nombre(t.resp))}</span>${t.departamento ? `<span>${esc(t.departamento)}</span>` : ''}</div>
      ${chips.length ? `<div class="t-avisos">${chips.map(([c, x]) => `<span class="etiqueta ${c}">${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="t-pie"><span class="vence ${T.vencida(t) ? 'vencida' : ''}">${esc(T.venceTxt(t))}</span>
        <select class="mover" aria-label="Cambiar el estado de ${esc(t.codigo)}">${ESTADOS.map(k => opcion(k, nEstado(k), t.estado)).join('')}</select></div></article>`;
  }

  function tablero() {
    const ts = filtradas(false);
    $('#kanban').innerHTML = ESTADOS.map(k => {
      let l = ts.filter(t => t.estado === k);
      const total = l.length;
      l = k === 'hecha' ? l.sort((a, b) => (b.fin || '').localeCompare(a.fin || '')).slice(0, 10)
        : l.sort((a, b) => (T.rango[a.prioridad] ?? 9) - (T.rango[b.prioridad] ?? 9) || T.porFecha(a, b));
      return `<section class="col" data-estado="${k}" aria-label="${esc(nEstado(k))}">
        <header><h3>${esc(nEstado(k))}</h3><span class="cuenta">${total}</span></header>
        <div class="col-cuerpo">${l.map(tarjeta).join('') || '<p class="vacio-col">Sin tareas</p>'}</div>
        ${total > l.length ? `<p class="nota">Mostrando las ${l.length} más recientes de ${total}. Ver todas en la lista.</p>` : ''}</section>`;
    }).join('');
  }

  // ---------- C. Lista de tareas ----------
  function comparar(a, b) {
    const k = ui.orden; let r = 0;
    if (k === 'prioridad') r = (T.rango[a.prioridad] ?? 9) - (T.rango[b.prioridad] ?? 9);
    else if (k === 'resp') r = nombre(a.resp).localeCompare(nombre(b.resp), 'es');
    else if (k === 'estado') r = ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado);
    else if (k === 'titulo') r = a.titulo.localeCompare(b.titulo, 'es');
    else if (k === 'vence') r = T.porFecha(a, b);
    else r = porCodigo(a, b);
    return r * ui.dir || T.porFecha(a, b) || porCodigo(a, b);
  }

  function lista() {
    const ts = filtradas(true).sort(comparar);
    document.querySelectorAll('th .orden').forEach(b => b.parentElement.setAttribute('aria-sort', b.dataset.orden === ui.orden ? (ui.dir > 0 ? 'ascending' : 'descending') : 'none'));
    $('#lista-filas').innerHTML = ts.length ? ts.map(t => {
      const pd = T.abierta(t) ? T.pendientesDeps(d, t) : [];
      return `<tr data-ver="${t.id}">
        <td><span class="codigo">${esc(t.codigo)}</span></td>
        <td><strong>${esc(t.titulo)}</strong><br><small class="tenue">${esc([t.departamento, etapaNombre(t.etapa)].filter(Boolean).join(' · ') || 'Sin departamento')}</small></td>
        <td>${esc(nombre(t.resp))}</td><td>${tagPrio(t.prioridad)}</td>
        <td>${tagEstado(t.estado)}${pd.length ? `<br><small class="tenue">Espera ${esc(pd.map(x => x.codigo).join(', '))}</small>` : ''}</td>
        <td class="${T.vencida(t) ? 'vencida' : ''}">${esc(T.venceTxt(t))}</td>
        <td><button class="btn" data-editar="${t.id}">Editar</button></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="vacio tenue">Ninguna tarea coincide con los filtros.</td></tr>';
    $('#lista-total').textContent = `${ts.length} de ${d.tareas.length} tareas`;
  }

  function vistas() { tablero(); lista(); }
  function pintar() { Lateral.proyecto(d.proyecto[0]); resumen(); filtros(); vistas(); }

  function pestana(id) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    ['panel', 'tablero', 'lista'].forEach(t => { $('#tab-' + t).hidden = t !== id; });
    $('#filtros').hidden = id === 'panel';
    $('#f-estado').hidden = id !== 'lista';
  }
  function irALista(estado) {
    Object.assign(ui, { q: '', estado, prioridad: '', depto: '', etapa: '', persona: '' });
    filtros(); pestana('lista'); vistas();
  }

  // ---------- Detalle de una tarea ----------
  function detalle(id) {
    const t = tarea(id); if (!t) return;
    const dlg = document.createElement('dialog');
    const fila = (k, v) => `<dt>${k}</dt><dd>${v || '<span class="tenue">—</span>'}</dd>`;
    const enlaces = l => l.map(x => `<button type="button" class="etq-tarea" data-abrir="${x.id}">${esc(x.codigo)} · ${esc(x.titulo)}</button>`).join('');
    const deps = t.dependencias.map(i => T.porId(d, i)).filter(Boolean);
    const unid = t.duracionUnidad === 'd' ? (t.duracion == 1 ? 'día de trabajo' : 'días de trabajo') : (t.duracion == 1 ? 'hora' : 'horas');
    const plazo = t.inicio && t.vence ? `${U.entre(t.inicio, t.vence) + 1} días de calendario` : '';
    const ref = /^https?:\/\//i.test(t.docRef) ? `<a href="${esc(t.docRef)}" target="_blank" rel="noopener">${esc(t.docRef)}</a>` : esc(t.docRef);
    const avisos = T.avisos(d, t).map(a => `<span class="etiqueta ${a.n === 'alta' ? 'bloqueada' : 'pendiente'}">${esc(a.t)}</span>`).join(' ');
    dlg.innerHTML = `<div class="formulario detalle">
      <p class="tenue">${esc(t.codigo)}${t.etapa ? ' · ' + esc(etapaNombre(t.etapa)) : ''}${t.departamento ? ' · ' + esc(t.departamento) : ''}</p>
      <h2 style="margin-bottom:8px">${esc(t.titulo)}</h2>
      <p>${tagEstado(t.estado)} ${tagPrio(t.prioridad)} ${avisos}</p>
      <h3>Identificación</h3><dl class="ficha">
        ${fila('Descripción', texto(t.descripcion))}${fila('Criterio de finalización', texto(t.criterio))}${fila('Etapa', esc(etapaNombre(t.etapa)))}${fila('Departamento', esc(t.departamento))}</dl>
      <h3>Responsabilidad</h3><dl class="ficha">
        ${fila('Responsable', esc(t.resp ? nombre(t.resp) : ''))}${fila('Asignación', t.resp ? 'Asignada' : 'Pendiente de asignar')}
        ${fila('Seguimiento', esc(t.seguimiento ? nombre(t.seguimiento) : ''))}${fila('Participantes', t.participantes.map(i => esc(nombre(i))).join(', '))}</dl>
      <h3>Planificación</h3><dl class="ficha">
        ${fila('Fecha de inicio', esc(t.inicio ? U.corta(t.inicio) : ''))}${fila('Fecha límite', esc(t.vence ? `${U.corta(t.vence)}${T.abierta(t) ? ' · ' + U.relativo(T.dias(t)) : ''}` : ''))}
        ${fila('Plazo', esc(plazo))}${fila('Duración estimada', t.duracion === '' ? '' : esc(`${t.duracion} ${unid}`))}
        ${fila('Depende de', enlaces(deps))}${fila('Bloquea a', enlaces(T.sucesoras(d, t)))}</dl>
      <h3>Seguimiento</h3><dl class="ficha">
        ${fila('Estado', esc(nEstado(t.estado)))}${t.estado === 'bloqueada' ? fila('Motivo del bloqueo', texto(t.motivoBloqueo)) : ''}
        ${t.estado === 'hecha' ? fila('Finalización real', esc(t.fin ? U.corta(t.fin) : '')) : ''}${fila('Última actualización', esc(t.actualizada ? U.corta(t.actualizada) : ''))}
        ${fila('Observaciones', texto(t.observaciones))}</dl>
      <h3>Referencias</h3><dl class="ficha">${fila('Documento relacionado', `${esc(t.docTipo)}${t.docTipo && t.docRef ? ': ' : ''}${ref}`)}</dl>
      <h3>Registro de cambios</h3>
      <ul class="cambios">${t.cambios.length ? t.cambios.slice(-15).reverse().map(c => `<li><span>${esc(cuando(c.ts))}</span>${esc(c.texto)}</li>`).join('') : '<li class="tenue">Sin cambios registrados.</li>'}</ul>
      <div class="acciones"><button type="button" class="btn peligro" data-eliminar>Eliminar tarea</button><button type="button" class="btn" data-x>Cerrar</button><button type="button" class="btn primario" data-editar-det>Editar</button></div></div>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.abrir) { dlg.close(); detalle(b.dataset.abrir); }
      else if ('x' in b.dataset) dlg.close();
      else if ('editarDet' in b.dataset) { dlg.close(); formTarea(t); }
      else if ('eliminar' in b.dataset) eliminar(t, dlg);
    });
    dlg.showModal();
  }

  async function eliminar(t, dlg) {
    const suc = T.sucesoras(d, t);
    if (!confirm(`¿Eliminar la tarea ${t.codigo} «${t.titulo}»?${suc.length ? `\n\nDejará de ser dependencia de: ${suc.map(x => x.codigo).join(', ')}.` : ''}\n\nEsta acción no se puede deshacer.`)) return;
    const ops = [['borrar', 'tareas', t.id]];
    suc.forEach(x => { const r = T.registrar(d, x, { ...x, dependencias: x.dependencias.filter(i => i !== t.id) }); if (r) ops.push(['guardar', 'tareas', r.tarea]); });
    ops.push(['guardar', 'configuracion', DB.entrada(`Se eliminó la tarea ${t.codigo} «${t.titulo}»`)]);
    try { await DB.lote(ops); dlg.close(); await recargar(); }
    catch (x) { console.warn(x); aviso('No se pudo eliminar la tarea.'); }
  }

  // ---------- D. Registro de tareas (formulario en cinco grupos) ----------
  function formTarea(previa) {
    const pr = d.proyecto[0] || {};
    const t = previa || { ...T.vacia(), etapa: pr.etapa || '' };
    const ids = new Set([t.resp, t.seguimiento]);
    const vigentes = d.personas.filter(p => E.activa(p) || ids.has(p.id)).sort(porNombre);
    const optPers = (sel, vacio) => `<option value="">${vacio}</option>` + vigentes.map(p => opcion(p.id, p.nombre + (E.activa(p) ? '' : ' (ya no participa)'), sel)).join('');
    const deptos = [...new Set(T.departamentos(d).concat(t.departamento ? [t.departamento] : []))].sort((a, b) => a.localeCompare(b, 'es'));
    const etapas = d.etapas.some(e => e.id === t.etapa) || !t.etapa ? d.etapas : d.etapas.concat([{ id: t.etapa, nombre: t.etapa }]);
    const partes = d.personas.filter(p => E.activa(p) || t.participantes.includes(p.id)).sort(porNombre);
    const cand = d.tareas.filter(x => x.id !== t.id && !(previa && T.creaCiclo(d, previa.id, [x.id]))).sort(porCodigo);
    const cod = previa ? t.codigo : T.nuevoCodigo(d).codigo;

    const grupos = ['Identificación', 'Responsabilidad', 'Planificación', 'Seguimiento', 'Referencias'];
    const campos = `<div class="pestanas" role="tablist">${grupos.map((g, i) => `<button type="button" role="tab" data-g="${i + 1}" aria-selected="${i === 0}">${g}</button>`).join('')}</div>

      <div data-panel="1">
        <p class="tenue" style="margin-bottom:12px">ID de tarea: <strong style="color:var(--tinta)">${esc(cod)}</strong>${previa ? '' : ' (se asigna al guardar y no cambia nunca)'}</p>
        <label>Nombre<input name="titulo" maxlength="140" autocomplete="off" placeholder="Ej. Presentar tres locaciones viables"></label>
        <label>Descripción: qué debe hacerse<textarea name="descripcion" rows="2"></textarea></label>
        <label>Criterio de finalización: cómo sabrás que está terminada<textarea name="criterio" rows="2" placeholder="Ej. Tres locaciones con fotografías, restricciones y costos estimados"></textarea></label>
        <div class="par">
          <label>Etapa<select name="etapa"><option value="">Sin etapa</option>${etapas.map(e => opcion(e.id, e.nombre, t.etapa)).join('')}</select></label>
          <label>Departamento<select name="departamento"><option value="">Sin departamento</option>${deptos.map(x => opcion(x, x, t.departamento)).join('')}</select></label>
        </div>
      </div>

      <div data-panel="2" hidden>
        <label>Responsable principal<select name="resp">${optPers(t.resp, 'Sin asignar')}</select></label>
        <p id="asignacion" style="margin:-4px 0 12px"></p>
        <p class="aviso-datos" id="aviso-resp" role="status" hidden></p>
        <label>Responsable de seguimiento (si es otra persona)<select name="seguimiento">${optPers(t.seguimiento, 'Igual que el responsable')}</select></label>
        <fieldset class="lista-check"><legend>Participantes</legend>
          ${partes.map(p => `<label><input type="checkbox" name="part" value="${p.id}"${t.participantes.includes(p.id) ? ' checked' : ''}> <span>${esc(p.nombre)}${E.activa(p) ? '' : ' (ya no participa)'}</span></label>`).join('') || '<span class="tenue">No hay personas registradas.</span>'}
        </fieldset>
        <p class="nota">Las personas salen del módulo Equipo y cargos. El responsable principal ejecuta o consigue el resultado; el de seguimiento verifica el avance.</p>
      </div>

      <div data-panel="3" hidden>
        <label>Prioridad<select name="prioridad">${Object.keys(T.prioridades).map(k => opcion(k, nPrio(k), t.prioridad)).join('')}</select></label>
        <div class="par"><label>Fecha de inicio<input name="inicio" type="date"></label><label>Fecha límite<input name="vence" type="date"></label></div>
        <p class="nota" id="plazo" style="margin:-4px 0 12px"></p>
        <div class="par"><label>Duración estimada de trabajo<input name="duracion" type="number" step="any" placeholder="Ej. 2"></label>
          <label>Unidad<select name="duracionUnidad"><option value="h">Horas</option><option value="d">Días de trabajo</option></select></label></div>
        <fieldset class="lista-check"><legend>Depende de (debe resolverse antes)</legend>
          ${cand.map(x => `<label><input type="checkbox" name="dep" value="${x.id}"${t.dependencias.includes(x.id) ? ' checked' : ''}> <span>${esc(x.codigo)} · ${esc(x.titulo)}${x.estado === 'hecha' ? ' (hecha)' : ''}</span></label>`).join('') || '<span class="tenue">Aún no hay otras tareas.</span>'}
        </fieldset>
        <p class="nota">La duración es el tiempo de trabajo; el plazo es el tiempo de calendario hasta la fecha límite. Pueden ser muy distintos.</p>
      </div>

      <div data-panel="4" hidden>
        <label>Estado<select name="estado">${ESTADOS.map(k => opcion(k, nEstado(k), t.estado)).join('')}</select></label>
        <label id="l-motivo">Motivo del bloqueo: qué impide continuar<textarea name="motivoBloqueo" rows="2"></textarea></label>
        <label id="l-fin">Fecha de finalización real<input name="fin" type="date"></label>
        <label>Observaciones: cambios, acuerdos o información relevante<textarea name="observaciones" rows="3"></textarea></label>
        <p class="nota">Última actualización: ${previa && t.actualizada ? esc(U.corta(t.actualizada)) : 'se registrará al guardar'}. Se completa sola en cada cambio.</p>
      </div>

      <div data-panel="5" hidden>
        <div class="par"><label>Documento relacionado<select name="docTipo"><option value="">Ninguno</option>${T.documentos.map(x => opcion(x, x, t.docTipo)).join('')}</select></label>
          <label>Referencia o enlace<input name="docRef" autocomplete="off" placeholder="Ej. Guion v3, p. 12, o https://…"></label></div>
        <p class="nota">La tarea predecesora se elige en el grupo 3, en «Depende de».</p>
        <h4>Registro de cambios</h4>
        <ul class="cambios">${previa && t.cambios.length ? t.cambios.slice(-15).reverse().map(c => `<li><span>${esc(cuando(c.ts))}</span>${esc(c.texto)}</li>`).join('') : '<li class="tenue">Los cambios quedarán registrados desde que guardes la tarea.</li>'}</ul>
      </div>`;

    const dlg = Formulario.abrir(previa ? `Editar ${t.codigo}` : 'Nueva tarea', campos, t, async (v, f) => {
      const fallo = (g, msg) => { irAGrupo(g); return msg; };
      const titulo = v.titulo.trim();
      if (!titulo) return fallo(1, 'Escribe el nombre de la tarea.');
      if (v.inicio && v.vence && v.vence < v.inicio) return fallo(3, 'La fecha límite no puede ser anterior a la fecha de inicio.');
      const dur = v.duracion === '' ? '' : Number(v.duracion);
      if (dur !== '' && (!isFinite(dur) || dur < 0)) return fallo(3, 'La duración debe ser un número positivo.');
      if (v.estado === 'bloqueada' && !v.motivoBloqueo.trim()) return fallo(4, 'Indica el motivo del bloqueo.');
      const deps = [...f.querySelectorAll('[name=dep]:checked')].map(x => x.value);
      if (previa && T.creaCiclo(d, previa.id, deps)) return fallo(3, 'Esas dependencias crean un ciclo entre tareas.');
      const cambiaEstado = !previa || previa.estado !== v.estado;
      const pend = T.pendientesDeps(d, { dependencias: deps });
      if (cambiaEstado && (v.estado === 'curso' || v.estado === 'hecha') && pend.length &&
        !confirm(`Depende de ${pend.map(x => x.codigo).join(', ')}, que aún no está terminada. ¿Guardar igualmente como «${nEstado(v.estado)}»?`)) return fallo(4, 'No se guardó: revisa el estado o las dependencias.');
      let nueva = { ...(previa || { ...T.vacia(), id: U.id('t') }),
        titulo, descripcion: v.descripcion.trim(), criterio: v.criterio.trim(), etapa: v.etapa, departamento: v.departamento,
        resp: v.resp, seguimiento: v.seguimiento === v.resp ? '' : v.seguimiento,
        participantes: [...f.querySelectorAll('[name=part]:checked')].map(x => x.value).filter(id => id !== v.resp),
        prioridad: v.prioridad, inicio: v.inicio, vence: v.vence, duracion: dur, duracionUnidad: v.duracionUnidad, dependencias: deps,
        observaciones: v.observaciones.trim(), docTipo: v.docTipo, docRef: v.docRef.trim() };
      nueva = T.conEstado(nueva, v.estado, v.motivoBloqueo.trim());
      if (v.estado === 'hecha' && v.fin) nueva.fin = v.fin;
      await guardarTarea(nueva, previa);
    }, recargar);

    // Comportamiento del formulario
    const f = dlg.querySelector('form'), g = n => f.elements[n].value;
    function irAGrupo(n) {
      dlg.querySelectorAll('[data-g]').forEach(b => b.setAttribute('aria-selected', b.dataset.g == n));
      dlg.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel != n; });
    }
    function refrescar() {
      $d('#asignacion').innerHTML = g('resp') ? '<span class="etiqueta confirmada">Asignada</span>' : '<span class="etiqueta pendiente">Pendiente de asignar</span>';
      const p = persona(g('resp')), av = $d('#aviso-resp'), m = [];
      if (p) {
        if (p.disp === 'no') m.push(`${p.nombre} figura como no disponible${p.restricciones ? ` (${p.restricciones})` : ''}.`);
        else if (p.disp === 'parcial') m.push(`${p.nombre} tiene disponibilidad parcial${p.restricciones ? ` (${p.restricciones})` : ''}.`);
        const n = T.abiertasDe(d, p.id, t.id);
        if (n >= T.CARGA) m.push(`Ya es responsable de ${n} tareas abiertas.`);
      }
      av.hidden = !m.length; av.textContent = m.join(' ');
      $d('#l-motivo').hidden = g('estado') !== 'bloqueada';
      $d('#l-fin').hidden = g('estado') !== 'hecha';
      const a = g('inicio'), b = g('vence'); let pl = '';
      if (a && b) {
        const n = U.entre(a, b) + 1, dur = parseFloat(g('duracion'));
        pl = b < a ? 'La fecha límite es anterior al inicio.' : `Plazo: ${n} ${n === 1 ? 'día' : 'días'} de calendario.`;
        if (b >= a && dur > 0 && (g('duracionUnidad') === 'd' ? dur : dur / 8) > n) pl += ' El trabajo previsto no cabe en ese plazo.';
      }
      $d('#plazo').textContent = pl;
    }
    const $d = s => dlg.querySelector(s);
    let deptoAuto = false;
    dlg.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) irAGrupo(b.dataset.g); });
    dlg.addEventListener('change', e => {
      const n = e.target.name;
      if (n === 'departamento') deptoAuto = false; // si lo elige la persona, deja de ser una sugerencia
      if (n === 'resp' && (!g('departamento') || deptoAuto)) {
        const ds = T.departamentosDe(d, g('resp')); // sugiere el departamento según los cargos de la persona
        if (ds.length === 1) { f.elements.departamento.value = ds[0]; deptoAuto = true; }
      }
      if (n === 'estado' && g('estado') === 'hecha' && !g('fin')) f.elements.fin.value = U.hoy();
      refrescar();
    });
    dlg.addEventListener('input', refrescar);
    refrescar();
  }

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button'), ds = b ? b.dataset : {};
    if (b && ds.tab) return pestana(ds.tab);
    if (b && 'nueva' in ds) return formTarea();
    if (b && 'filtro' in ds) return irALista(ds.filtro);
    if (b && ds.editar) return formTarea(tarea(ds.editar));
    if (b && ds.orden) { if (ui.orden === ds.orden) ui.dir *= -1; else { ui.orden = ds.orden; ui.dir = 1; } return lista(); }
    if (b && b.id === 'limpiar') { Object.assign(ui, { q: '', estado: '', prioridad: '', depto: '', etapa: '', persona: '' }); filtros(); return vistas(); }
    const v = e.target.closest('[data-ver]');
    if (v && !e.target.closest('select') && !e.target.closest('dialog')) detalle(v.dataset.ver);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.tarjeta')) detalle(e.target.dataset.ver); });
  [['#q', 'q', 'input'], ['#f-estado', 'estado', 'change'], ['#f-prioridad', 'prioridad', 'change'], ['#f-depto', 'depto', 'change'], ['#f-persona', 'persona', 'change'], ['#f-etapa', 'etapa', 'change']]
    .forEach(([s, k, ev]) => $(s).addEventListener(ev, e => { ui[k] = e.target.value; vistas(); }));

  const kanban = $('#kanban');
  kanban.addEventListener('change', e => { const s = e.target.closest('.mover'); if (s) mover(s.closest('[data-id]').dataset.id, s.value); });
  kanban.addEventListener('dragstart', e => { const c = e.target.closest('.tarjeta'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastrando'); });
  kanban.addEventListener('dragend', () => document.querySelectorAll('.arrastrando,.sobre').forEach(x => x.classList.remove('arrastrando', 'sobre')));
  kanban.addEventListener('dragover', e => { const c = e.target.closest('.col'); if (c) { e.preventDefault(); c.classList.add('sobre'); } });
  kanban.addEventListener('dragleave', e => { const c = e.target.closest('.col'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('sobre'); });
  kanban.addEventListener('drop', e => { const c = e.target.closest('.col'); if (!c) return; e.preventDefault(); c.classList.remove('sobre'); mover(e.dataTransfer.getData('text/plain'), c.dataset.estado); });

  // ---------- Arranque ----------
  try { await DB.iniciar(); await recargar(); }
  catch (x) {
    console.warn('Base local no disponible:', x);
    d = SEMILLAS; d.tareas = d.tareas.map(T.completa);
    aviso('No se pudo abrir la base local. Se muestran datos de ejemplo y los cambios no se guardarán.');
    pintar();
  }
  pestana('panel');
  const ref = decodeURIComponent(location.hash.slice(1)); // enlaces del tipo tareas.html#T-003
  if (ref && tarea(ref)) detalle(tarea(ref).id);
})();
