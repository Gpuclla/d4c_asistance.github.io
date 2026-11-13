(async function () {
  const U = Utils, esc = U.esc, E = Equipo;
  const $ = s => document.querySelector(s);
  const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ui = { q: '', estado: '', depto: '', soloVac: false };
  let d;

  const persona = id => d.personas.find(p => p.id === id);
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const cargosDe = p => d.asignaciones.filter(a => a.personaId === p.id)
    .map(a => ({ a, c: d.cargos.find(c => c.id === a.cargoId) })).filter(x => x.c);
  const opciones = (mapa, actual) => Object.entries(E.estados[mapa])
    .map(([k, [n]]) => `<option value="${k}"${k === actual ? ' selected' : ''}>${n}</option>`).join('');

  async function recargar() { d = await DB.cargarTodo(); pintar(); }

  // Filas de "departamento + cargo" dentro del formulario de persona
  const optsDep = sel => '<option value="">Departamento…</option>' +
    [...new Set(d.cargos.filter(c => c.estado === 'activo').map(c => c.departamento).concat(sel ? [sel] : []))]
      .sort((x, y) => x.localeCompare(y, 'es')).map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const optsCargo = (dep, sel) => '<option value="">Cargo…</option>' +
    d.cargos.filter(c => c.departamento === dep && (c.estado === 'activo' || c.id === sel))
      .map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
  function filaCargo(a) {
    const cg = a && d.cargos.find(c => c.id === a.cargoId);
    const dep = cg ? cg.departamento : '';
    return `<div class="fila-cargo" data-aid="${a ? a.id : ''}">
      <select class="sel-dep" aria-label="Departamento">${optsDep(dep)}</select>
      <select class="sel-cargo" aria-label="Cargo">${optsCargo(dep, cg && cg.id)}</select>
      <select class="sel-est" aria-label="Estado de la asignación">${opciones('asig', a ? a.estado : 'pendiente')}</select>
      <button type="button" class="btn peligro quitar-fila" aria-label="Quitar este cargo">Quitar</button></div>`;
  }

  function formPersona(p) {
    const existentes = p ? d.asignaciones.filter(a => a.personaId === p.id) : [];
    const campos = `<label>Nombre completo<input name="nombre" required autocomplete="off"></label>
      <div class="par"><label>Teléfono<input name="telefono" type="tel"></label><label>Correo<input name="correo" type="email"></label></div>
      <div class="par"><label>Estado de participación<select name="estado">${opciones('persona')}</select></label>
      <label>Disponibilidad general<select name="disp">${opciones('disp')}</select></label></div>
      <fieldset class="cargos-persona"><legend>Cargos y departamentos</legend>
        <div id="filas-cargos">${existentes.map(a => filaCargo(a)).join('') || filaCargo(null)}</div>
        <p class="aviso-datos" id="aviso-cargos" role="alert" hidden></p>
        <button type="button" class="btn" data-fila-nueva>Añadir otro cargo</button>
        <p class="nota">¿No aparece el cargo? Créalo primero en la pestaña Cargos y departamentos.</p>
      </fieldset>
      <label>Restricciones<textarea name="restricciones" rows="2"></textarea></label>
      <label>Observaciones<textarea name="observaciones" rows="2"></textarea></label>`;

    const dlg = Formulario.abrir(p ? 'Editar persona' : 'Nueva persona', campos, p || { estado: 'pendiente', disp: 'disponible' }, async (v, f) => {
      const nombre = v.nombre.trim();
      if (!nombre) return 'Escribe el nombre completo.';
      const filas = [...f.querySelectorAll('.fila-cargo')].map(r => ({
        aid: r.dataset.aid, dep: r.querySelector('.sel-dep').value,
        cargoId: r.querySelector('.sel-cargo').value, estado: r.querySelector('.sel-est').value }));
      if (filas.some(r => r.dep && !r.cargoId)) return 'Elige el cargo en cada fila o quita la fila.';
      const elegidas = filas.filter(r => r.cargoId);
      if (new Set(elegidas.map(r => r.cargoId)).size < elegidas.length) return 'La persona no puede repetir un mismo cargo.';
      const id = p ? p.id : U.id('p');
      const ops = [['guardar', 'personas', { ...(p || { id }), ...v, nombre }]];
      const mantiene = new Set(elegidas.map(r => r.aid).filter(Boolean));
      for (const a of existentes) if (!mantiene.has(a.id)) ops.push(['borrar', 'asignaciones', a.id]);
      for (const r of elegidas) {
        const previa = existentes.find(a => a.id === r.aid);
        ops.push(['guardar', 'asignaciones', previa ? { ...previa, cargoId: r.cargoId, estado: r.estado }
          : { id: U.id('a'), personaId: id, cargoId: r.cargoId, estado: r.estado, fecha: U.hoy(), observaciones: '' }]);
      }
      ops.push(['guardar', 'configuracion', DB.entrada(`${p ? 'Se actualizó a' : 'Se registró a'} ${nombre}${elegidas.length ? ` con ${elegidas.length} ${elegidas.length === 1 ? 'cargo' : 'cargos'}` : ''}`)]);
      await DB.lote(ops); // una sola transacción: persona, cargos e historial se guardan juntos o no se guarda nada
    }, recargar);

    const filasEl = dlg.querySelector('#filas-cargos');
    const actualizar = () => {
      const n = [...filasEl.querySelectorAll('.sel-cargo')].filter(s => s.value).length;
      const av = dlg.querySelector('#aviso-cargos');
      av.hidden = n <= E.LIMITE;
      av.textContent = `Esta persona tendría ${n} cargos. Revisa que pueda cumplirlos todos.`;
    };
    dlg.addEventListener('change', e => {
      if (e.target.classList.contains('sel-dep')) e.target.closest('.fila-cargo').querySelector('.sel-cargo').innerHTML = optsCargo(e.target.value, '');
      actualizar();
    });
    dlg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.matches('[data-fila-nueva]')) filasEl.insertAdjacentHTML('beforeend', filaCargo(null));
      else if (b.matches('.quitar-fila')) b.closest('.fila-cargo').remove();
      else return;
      actualizar();
    });
    actualizar();
  }

  function formCargo(c) {
    const campos = `<label>Nombre del cargo<input name="nombre" required autocomplete="off"></label>
      <div class="par"><label>Departamento<input name="departamento" list="lista-deptos" required autocomplete="off"></label>
      <label>Plazas<input name="plazas" type="number" min="1" max="20"></label></div>
      <label>Estado en el catálogo<select name="estado"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label>
      <label>Funciones<textarea name="funciones" rows="3"></textarea></label>`;
    Formulario.abrir(c ? 'Editar cargo' : 'Nuevo cargo', campos, c || { estado: 'activo', plazas: 1 }, async v => {
      const nombre = v.nombre.trim(), departamento = v.departamento.trim();
      if (!nombre || !departamento) return 'Completa el nombre y el departamento.';
      await DB.lote([
        ['guardar', 'cargos', { ...(c || { id: U.id('cg') }), ...v, nombre, departamento, plazas: Math.max(1, parseInt(v.plazas, 10) || 1) }],
        ['guardar', 'configuracion', DB.entrada(c ? `Se actualizó el cargo ${nombre}` : `Se creó el cargo ${nombre} en ${departamento}`)]]);
    }, recargar);
  }

  function formAsignacion(cargo, a) {
    const lista = d.personas.filter(p => E.activa(p) || (a && p.id === a.personaId)).sort(porNombre);
    const campos = `<p class="tenue" style="margin-bottom:12px">Cargo: <strong style="color:var(--tinta)">${esc(cargo.nombre)}</strong> · ${esc(cargo.departamento)}</p>
      <label>Persona<select name="personaId"><option value="">Elegir persona…</option>${lista.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
      <div class="par"><label>Estado de la asignación<select name="estado">${opciones('asig')}</select></label>
      <label>Fecha de asignación<input name="fecha" type="date"></label></div>
      <label>Observaciones<textarea name="observaciones" rows="2"></textarea></label>
      ${a ? '<div class="acciones"><button type="button" class="btn peligro" data-quitar>Quitar asignación</button></div>' : ''}`;
    const dlg = Formulario.abrir(a ? 'Editar asignación' : 'Asignar persona', campos, a || { estado: 'pendiente', fecha: U.hoy() }, async v => {
      if (!v.personaId) return 'Elige una persona.';
      if (d.asignaciones.some(x => x.id !== (a && a.id) && x.personaId === v.personaId && x.cargoId === cargo.id)) return 'Esa persona ya tiene este cargo.';
      await DB.lote([
        ['guardar', 'asignaciones', { ...(a || { id: U.id('a'), cargoId: cargo.id }), ...v }],
        ['guardar', 'configuracion', DB.entrada(`${a ? 'Se actualizó la asignación de' : 'Se asignó a'} ${persona(v.personaId).nombre} como ${cargo.nombre}`)]]);
    }, recargar);
    const q = dlg.querySelector('[data-quitar]');
    if (q) q.onclick = async () => {
      try { await DB.lote([['borrar', 'asignaciones', a.id], ['guardar', 'configuracion', DB.entrada(`Se quitó a ${persona(a.personaId).nombre} del cargo ${cargo.nombre}`)]]); dlg.close(); await recargar(); }
      catch (x) { dlg.querySelector('.error').textContent = 'No se pudo quitar la asignación.'; }
    };
  }

  // ---------- Pintado ----------
  function indicadores() {
    const i = E.indicadores(d);
    const items = [
      ['Personas registradas', i.registradas, `${d.personas.filter(p => p.estado === 'baja').length} ya no participan`],
      ['Integrantes confirmados', i.confirmadas, `${d.personas.filter(p => p.estado === 'pendiente').length} pendientes de confirmar`],
      ['Cargos vacantes', i.vacantes, `de ${d.cargos.filter(c => c.estado === 'activo').length} cargos activos`],
      ['Por confirmar', i.porConfirmar, 'asignaciones pendientes o provisionales']
    ];
    $('#indicadores').innerHTML = items.map(([n, v, s]) =>
      `<div class="indicador"><span class="indicador-n">${v}</span><span class="indicador-t">${n}</span><span class="indicador-s">${s}</span></div>`).join('');
  }

  function directorio() {
    const q = norm(ui.q);
    const filas = d.personas.filter(p => {
      if (ui.estado && p.estado !== ui.estado) return false;
      if (!q) return true;
      return norm([p.nombre, ...cargosDe(p).flatMap(x => [x.c.nombre, x.c.departamento])].join(' ')).includes(q);
    }).sort(porNombre);
    $('#dir-filas').innerHTML = filas.length ? filas.map(p => {
      const cs = cargosDe(p);
      return `<tr><td><strong>${esc(p.nombre)}</strong>${E.activa(p) && cs.length > E.LIMITE ? ` <span class="etiqueta bloqueada">${cs.length} cargos</span>` : ''}<br><small class="tenue">${esc([p.telefono, p.correo].filter(Boolean).join(' · ') || 'Sin contacto')}</small></td>
        <td>${cs.length ? cs.map(x => `<span class="chip ${x.a.estado}">${esc(x.c.nombre)}<small>${esc(x.c.departamento)} · ${E.estados.asig[x.a.estado][0]}</small></span>`).join('') : '<span class="tenue">Sin cargo asignado</span>'}</td>
        <td>${E.tag('persona', p.estado)}</td><td>${E.tag('disp', p.disp)}</td>
        <td><button class="btn" data-editar-persona="${p.id}">Editar</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="vacio tenue">Ninguna persona coincide con la búsqueda.</td></tr>';
  }

  function cargos() {
    const deptos = [...new Set(d.cargos.map(c => c.departamento))].sort((a, b) => a.localeCompare(b, 'es'));
    $('#f-depto').innerHTML = '<option value="">Todos los departamentos</option>' + deptos.map(x => `<option${x === ui.depto ? ' selected' : ''}>${esc(x)}</option>`).join('');
    $('#lista-deptos').innerHTML = deptos.map(x => `<option value="${esc(x)}">`).join('');
    const vac = new Map(E.vacantes(d).map(v => [v.cargo.id, v.faltan]));
    const visibles = d.cargos.filter(c => (!ui.depto || c.departamento === ui.depto) && (!ui.soloVac || vac.has(c.id)));
    const fila = c => {
      const chips = d.asignaciones.filter(a => a.cargoId === c.id).map(a => ({ a, p: persona(a.personaId) })).filter(x => x.p)
        .map(({ a, p }) => `<button class="chip ${p.estado === 'baja' ? 'baja' : a.estado}" data-asig="${a.id}">${esc(p.nombre)}<small>${p.estado === 'baja' ? 'Ya no participa' : E.estados.asig[a.estado][0]}</small></button>`).join('');
      const falta = vac.get(c.id);
      const marca = c.estado !== 'activo' ? '<span class="etiqueta">Inactivo</span>'
        : falta ? `<span class="etiqueta pendiente">Vacante${(c.plazas || 1) > 1 ? ` (faltan ${falta} de ${c.plazas})` : ''}</span>` : '';
      return `<div class="cargo${c.estado !== 'activo' ? ' inactivo' : ''}">
        <div><strong>${esc(c.nombre)}</strong> ${marca}<p class="tenue">${esc(c.funciones || 'Sin funciones descritas')}</p></div>
        <div>${chips || '<span class="tenue">Nadie asignado</span>'}</div>
        <div class="cargo-acciones"><button class="btn" data-asignar="${c.id}">Asignar</button><button class="btn" data-editar-cargo="${c.id}">Editar</button></div></div>`;
    };
    const grupos = deptos.filter(x => visibles.some(c => c.departamento === x));
    $('#cargos-lista').innerHTML = grupos.length
      ? grupos.map(x => `<section class="grupo"><h3>${esc(x)}</h3><div class="tabla-caja">${visibles.filter(c => c.departamento === x).map(fila).join('')}</div></section>`).join('')
      : '<p class="vacio tenue">No hay cargos que coincidan con el filtro.</p>';
  }

  function disponibilidad() {
    $('#disp-filas').innerHTML = d.personas.filter(E.activa).sort(porNombre).map(p =>
      `<tr><td><strong>${esc(p.nombre)}</strong><br><small class="tenue">${esc(cargosDe(p).map(x => x.c.nombre).join(', ') || 'Sin cargo')}</small></td>
        <td><select data-p="${p.id}" data-campo="disp" aria-label="Disponibilidad de ${esc(p.nombre)}">${opciones('disp', p.disp)}</select></td>
        <td><input data-p="${p.id}" data-campo="restricciones" value="${esc(p.restricciones || '')}" placeholder="Ej. solo fines de semana" aria-label="Restricciones de ${esc(p.nombre)}"></td>
        <td><input data-p="${p.id}" data-campo="observaciones" value="${esc(p.observaciones || '')}" aria-label="Observaciones de ${esc(p.nombre)}"></td></tr>`).join('');
  }

  function alertaCargos() {
    const s = E.indicadores(d).sobrecargadas;
    $('#alerta-cargos').innerHTML = s.length ? `<ul class="alertas">${s.map(({ persona: p, n }) =>
      `<li>${esc(p.nombre)} ocupa ${n} cargos (${esc(cargosDe(p).map(x => x.c.nombre).join(', '))}). Revisa que pueda cumplirlos todos.</li>`).join('')}</ul>` : '';
  }

  function pintar() { indicadores(); alertaCargos(); directorio(); cargos(); disponibilidad(); }

  function pestana(id) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    ['directorio', 'cargos', 'disponibilidad'].forEach(t => { $('#tab-' + t).hidden = t !== id; });
  }

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const ds = b.dataset;
    if (ds.tab) return pestana(ds.tab);
    if ('nuevaPersona' in ds) return formPersona();
    if (ds.editarPersona) return formPersona(persona(ds.editarPersona));
    if ('nuevoCargo' in ds) return formCargo();
    if (ds.editarCargo) return formCargo(d.cargos.find(c => c.id === ds.editarCargo));
    if (ds.asignar) return formAsignacion(d.cargos.find(c => c.id === ds.asignar));
    if (ds.asig) { const a = d.asignaciones.find(x => x.id === ds.asig); return formAsignacion(d.cargos.find(c => c.id === a.cargoId), a); }
  });
  $('#q').addEventListener('input', e => { ui.q = e.target.value; directorio(); });
  $('#f-estado').addEventListener('change', e => { ui.estado = e.target.value; directorio(); });
  $('#f-depto').addEventListener('change', e => { ui.depto = e.target.value; cargos(); });
  $('#f-vac').addEventListener('change', e => { ui.soloVac = e.target.checked; cargos(); });
  const quien = { disp: 'la disponibilidad', restricciones: 'las restricciones', observaciones: 'las observaciones' };
  $('#disp-filas').addEventListener('change', async e => {
    const t = e.target, campo = t.dataset.campo, p = persona(t.dataset.p);
    if (!p || !campo || (p[campo] || '') === t.value) return; // sin cambios reales no se guarda ni se anota en el historial
    const previo = p[campo]; p[campo] = t.value;
    try {
      await DB.lote([['guardar', 'personas', p], ['guardar', 'configuracion', DB.entrada(`Se actualizó ${quien[campo] || campo} de ${p.nombre}`)]]);
      indicadores(); alertaCargos(); directorio(); cargos(); // la pestaña de disponibilidad no se repinta para no perder el foco
    } catch (x) {
      p[campo] = previo; t.value = previo || '';
      $('#aviso').innerHTML = '<p class="aviso-datos">No se pudo guardar el cambio.</p>';
    }
  });

  // ---------- Arranque ----------
  try { await DB.iniciar(); await recargar(); Lateral.proyecto(d.proyecto[0]); }
  catch (x) {
    console.warn('Base local no disponible:', x);
    d = SEMILLAS;
    Lateral.proyecto(d.proyecto[0]);
    $('#aviso').innerHTML = '<p class="aviso-datos">No se pudo abrir la base local. Se muestran datos de ejemplo y los cambios no se guardarán.</p>';
    pintar();
  }
})();
