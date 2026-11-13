/* Reglas de las tareas. Las usan el módulo Tareas, el panel y, más adelante, Cronograma y Etapas.
   Las personas, departamentos y etapas no se guardan aquí: se leen de Equipo y cargos y de Etapas. */
const Tareas = (() => {
  const U = Utils;

  const estados = { pendiente: ['Pendiente', 'pendiente'], curso: ['En curso', 'curso'], bloqueada: ['Bloqueada', 'bloqueada'], hecha: ['Hecha', 'confirmada'] };
  const prioridades = { critica: ['Crítica', 'pr-critica'], alta: ['Alta', 'pr-alta'], media: ['Media', 'pr-media'], baja: ['Baja', 'pr-baja'] };
  const rango = { critica: 0, alta: 1, media: 2, baja: 3 };
  const documentos = ['Guion', 'Desglose', 'Presupuesto', 'Plan de rodaje', 'Locaciones', 'Permisos', 'Otro'];
  const CARGA = 4; // a partir de cuántas tareas abiertas se avisa de la carga de una persona

  // Compatibilidad: titulo, resp, prioridad, estado y vence ya existían en la versión anterior
  const vacia = () => ({
    codigo: '', titulo: '', descripcion: '', criterio: '', etapa: '', departamento: '',
    resp: '', seguimiento: '', participantes: [],
    prioridad: 'media', inicio: '', vence: '', duracion: '', duracionUnidad: 'h', dependencias: [],
    estado: 'pendiente', fin: '', motivoBloqueo: '', observaciones: '', creada: '', actualizada: '',
    docTipo: '', docRef: '', cambios: []
  });
  const completa = t => ({ ...vacia(), ...t });

  // ---------- Consultas ----------
  const abierta = t => t.estado !== 'hecha';
  const dias = t => U.diasHasta(t.vence);
  const vencida = t => abierta(t) && dias(t) < 0;
  const critica = t => abierta(t) && (t.prioridad === 'critica' || t.prioridad === 'alta' || t.estado === 'bloqueada' || vencida(t));
  const porFecha = (a, b) => (a.vence || '9999').localeCompare(b.vence || '9999');
  const porId = (d, id) => d.tareas.find(t => t.id === id);
  const asignada = t => !!t.resp;
  const personasDe = t => [t.resp, t.seguimiento, ...(t.participantes || [])].filter(Boolean);
  const venceTxt = t => !t.vence ? 'Sin fecha' : abierta(t) ? `${U.corta(t.vence)} · ${U.relativo(dias(t))}` : `Hecha${t.fin ? ' el ' + U.corta(t.fin) : ''}`;

  const pendientesDeps = (d, t) => (t.dependencias || []).map(id => porId(d, id)).filter(x => x && abierta(x));
  const sucesoras = (d, t) => d.tareas.filter(x => (x.dependencias || []).includes(t.id));
  // ¿Elegir estas dependencias para la tarea `id` crearía un ciclo (A depende de B y B de A)?
  function creaCiclo(d, id, deps) {
    const vistos = new Set(), pila = [...deps];
    while (pila.length) {
      const x = pila.pop();
      if (x === id) return true;
      if (vistos.has(x)) continue;
      vistos.add(x);
      const t = porId(d, x);
      if (t) pila.push(...(t.dependencias || []));
    }
    return false;
  }

  // Departamentos: salen de los cargos activos del módulo Equipo (y de lo que ya usan las tareas)
  const departamentos = d => [...new Set(d.cargos.filter(c => c.estado === 'activo').map(c => c.departamento).concat(d.tareas.map(t => t.departamento)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const departamentosDe = (d, personaId) => [...new Set(d.asignaciones.filter(a => a.personaId === personaId)
    .map(a => (d.cargos.find(c => c.id === a.cargoId) || {}).departamento).filter(Boolean))];
  const abiertasDe = (d, personaId, excluir) => d.tareas.filter(t => t.resp === personaId && abierta(t) && t.id !== excluir).length;

  // Avisos de una tarea abierta; cruzan tareas con el módulo Equipo
  function avisos(d, t) {
    const a = [];
    if (!abierta(t)) return a;
    const p = Equipo.persona(d, t.resp);
    if (vencida(t)) a.push({ n: 'alta', t: `vencida hace ${-dias(t)} d` });
    if (t.estado === 'bloqueada') a.push({ n: 'alta', t: `bloqueada${t.motivoBloqueo ? ': ' + t.motivoBloqueo : ''}` });
    if (!t.resp) a.push({ n: 'aviso', t: 'sin responsable' });
    else if (p && !Equipo.activa(p)) a.push({ n: 'alta', t: `${p.nombre} ya no participa en el proyecto` });
    else if (p && p.disp === 'no') a.push({ n: 'aviso', t: `${p.nombre} figura como no disponible` });
    const pend = pendientesDeps(d, t);
    if (t.estado === 'curso' && pend.length) a.push({ n: 'aviso', t: `en curso, pero depende de ${pend.map(x => x.codigo || x.titulo).join(', ')} (sin terminar)` });
    return a;
  }

  function indicadores(d) {
    const ab = d.tareas.filter(abierta);
    return {
      total: d.tareas.length, abiertas: ab.length,
      pendientes: d.tareas.filter(t => t.estado === 'pendiente').length,
      curso: d.tareas.filter(t => t.estado === 'curso').length,
      hechas: d.tareas.filter(t => t.estado === 'hecha').length,
      bloqueadas: ab.filter(t => t.estado === 'bloqueada').length,
      vencidas: ab.filter(vencida).length,
      sinResponsable: ab.filter(t => !t.resp).length,
      proximos: ab.filter(t => dias(t) >= 0).sort(porFecha).slice(0, 8)
    };
  }

  // ---------- Código de tarea (T-001, T-002…): único, inmutable y nunca se reutiliza ----------
  const num = c => parseInt(String(c || '').replace(/\D/g, ''), 10) || 0;
  const contador = d => d.configuracion.find(c => c.id === 'contador-tareas');
  const ultimo = d => Math.max(contador(d) ? contador(d).n : 0, ...d.tareas.map(t => num(t.codigo)), 0);
  const formato = n => 'T-' + String(n).padStart(3, '0');
  const opContador = n => ['guardar', 'configuracion', { id: 'contador-tareas', tipo: 'contador', n }];
  function nuevoCodigo(d) { const n = ultimo(d) + 1; return { codigo: formato(n), op: opContador(n) }; }

  // Pone al día las tareas guardadas con la versión anterior (sin código ni campos nuevos). Devuelve operaciones para DB.lote
  function migrar(d) {
    const sin = d.tareas.filter(t => !t.codigo).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (!sin.length && contador(d)) return [];
    let n = ultimo(d);
    const ops = sin.map(t => { n++; return ['guardar', 'tareas', { ...completa(t), codigo: formato(n), creada: t.creada || U.hoy(), actualizada: t.actualizada || U.hoy() }]; });
    ops.push(opContador(n));
    return ops;
  }

  // ---------- Cambios de estado y registro de cambios ----------
  function conEstado(t, estado, motivo = '') {
    return { ...t, estado, fin: estado === 'hecha' ? (t.fin || U.hoy()) : '', motivoBloqueo: estado === 'bloqueada' ? motivo : '' };
  }

  const textos = { titulo: 'el nombre', descripcion: 'la descripción', criterio: 'el criterio de finalización', observaciones: 'las observaciones' };
  function diferencias(d, a, b) {
    const nom = id => id ? ((Equipo.persona(d, id) || {}).nombre || 'persona eliminada') : 'sin asignar';
    const fecha = f => f ? U.corta(f) : 'sin fecha';
    const mismos = (x, y) => [...(x || [])].sort().join() === [...(y || [])].sort().join();
    const r = [];
    if (a.estado !== b.estado) r.push(`Estado: ${estados[a.estado][0]} → ${estados[b.estado][0]}${b.estado === 'bloqueada' && b.motivoBloqueo ? ` (motivo: ${b.motivoBloqueo})` : ''}`);
    if (a.prioridad !== b.prioridad) r.push(`Prioridad: ${prioridades[a.prioridad][0]} → ${prioridades[b.prioridad][0]}`);
    if (a.resp !== b.resp) r.push(`Responsable: ${nom(a.resp)} → ${nom(b.resp)}`);
    if (a.seguimiento !== b.seguimiento) r.push(`Seguimiento: ${nom(a.seguimiento)} → ${nom(b.seguimiento)}`);
    if (!mismos(a.participantes, b.participantes)) r.push('Se actualizaron los participantes');
    if (a.inicio !== b.inicio) r.push(`Fecha de inicio: ${fecha(a.inicio)} → ${fecha(b.inicio)}`);
    if (a.vence !== b.vence) r.push(`Fecha límite: ${fecha(a.vence)} → ${fecha(b.vence)}`);
    if (String(a.duracion) !== String(b.duracion) || (b.duracion !== '' && a.duracionUnidad !== b.duracionUnidad)) r.push('Se cambió la duración estimada');
    if (!mismos(a.dependencias, b.dependencias)) r.push('Se actualizaron las dependencias');
    if (a.etapa !== b.etapa) r.push('Se cambió la etapa');
    if (a.departamento !== b.departamento) r.push(`Departamento: ${a.departamento || 'sin definir'} → ${b.departamento || 'sin definir'}`);
    if (a.docTipo !== b.docTipo || a.docRef !== b.docRef) r.push('Se actualizó el documento relacionado');
    if (a.estado === b.estado && a.motivoBloqueo !== b.motivoBloqueo) r.push('Se cambió el motivo del bloqueo');
    if (a.fin !== b.fin && b.estado === 'hecha' && a.estado === 'hecha') r.push(`Finalización real: ${fecha(b.fin)}`);
    Object.entries(textos).forEach(([k, e]) => { if (a[k] !== b[k]) r.push(`Se editó ${e}`); });
    return r;
  }

  // Devuelve la tarea lista para guardar (con «última actualización» y registro de cambios) o null si no hubo cambios
  function registrar(d, previa, nueva, ahora = Date.now()) {
    const dif = previa ? diferencias(d, previa, nueva) : ['Se creó la tarea'];
    if (!dif.length) return null;
    return { cambios: dif, tarea: { ...nueva, actualizada: U.hoy(), cambios: [...(previa ? previa.cambios : []), ...dif.map(texto => ({ ts: ahora, texto }))].slice(-100) } };
  }

  return { estados, prioridades, rango, documentos, CARGA, vacia, completa, abierta, dias, vencida, critica, porFecha, porId, asignada, personasDe, venceTxt,
    pendientesDeps, sucesoras, creaCiclo, departamentos, departamentosDe, abiertasDe, avisos, indicadores, nuevoCodigo, migrar, conEstado, diferencias, registrar };
})();
