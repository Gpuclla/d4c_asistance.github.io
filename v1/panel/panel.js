(async function () {
  const U = Utils, esc = U.esc, $ = id => document.getElementById(id);
  const PROYECTO_BASE = { id: 'proyecto', titulo: 'Proyecto sin título', direccion: '', produccion: '', inicioRodaje: '', etapa: 'desarrollo' };
  const etiquetaEstado = { curso: 'En curso', pendiente: 'Pendiente', bloqueada: 'Bloqueada', hecha: 'Hecha' };
  const diasTexto = n => Number.isNaN(n) ? '' : n > 1 ? `faltan ${n} días` : n === 1 ? 'falta 1 día' : n === 0 ? 'es hoy' : n === -1 ? 'hace 1 día' : `hace ${-n} días`;
  let d;

  async function cargar() {
    try { await DB.iniciar(); d = await DB.cargarTodo(); }
    catch (e) {
      console.warn('Base local no disponible:', e);
      d = SEMILLAS;
      $('aviso').innerHTML = '<p class="aviso-datos">No se pudo abrir la base local. Se muestran datos de ejemplo que no se guardarán.</p>';
    }
  }
  const proyecto = () => ({ ...PROYECTO_BASE, ...(d.proyecto[0] || {}) });
  async function recargar() { d = await DB.cargarTodo(); pintar(); }

  // ---------- Edición de los datos del proyecto ----------
  function formProyecto() {
    const pr = proyecto();
    const nombres = d.personas.filter(Equipo.activa).map(p => p.nombre).sort((a, b) => a.localeCompare(b, 'es'));
    const campos = `<label>Título del proyecto<input name="titulo" required maxlength="120" autocomplete="off"></label>
      <div class="par">
        <label>Dirección<input name="direccion" list="lista-direccion" maxlength="80" autocomplete="off" placeholder="Nombre de quien dirige"></label>
        <label>Producción o productora<input name="produccion" maxlength="80" autocomplete="off"></label>
      </div>
      <label>Inicio de rodaje<input name="inicioRodaje" type="date"></label>
      <datalist id="lista-direccion">${nombres.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <p class="nota">En Dirección puedes elegir a alguien del equipo o escribir cualquier nombre.</p>`;
    Formulario.abrir('Datos del proyecto', campos, pr, async v => {
      const titulo = v.titulo.trim();
      if (!titulo) return 'Escribe el título del proyecto.';
      const nuevo = { ...pr, titulo, direccion: v.direccion.trim(), produccion: v.produccion.trim(), inicioRodaje: v.inicioRodaje };
      const hist = [];
      if (nuevo.titulo !== pr.titulo) hist.push(`Se cambió el título del proyecto a «${titulo}»`);
      if (nuevo.direccion !== pr.direccion) hist.push(nuevo.direccion ? `Se cambió la dirección a ${nuevo.direccion}` : 'Se quitó el nombre de la dirección');
      if (nuevo.produccion !== pr.produccion) hist.push('Se actualizó la producción');
      if (nuevo.inicioRodaje !== pr.inicioRodaje) hist.push('Se actualizó la fecha de inicio de rodaje');
      if (!hist.length) return;
      await DB.lote([['guardar', 'proyecto', nuevo], ...hist.map(t => ['guardar', 'configuracion', DB.entrada(t)])]);
    }, recargar);
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-editar-proyecto]')) formProyecto(); });

  // ---------- Pantalla ----------
  function pintar() {
    const pr = proyecto();
    Lateral.proyecto(pr);
    const nombreDe = id => (d.personas.find(e => e.id === id) || {}).nombre || 'Sin asignar';

    // Cálculos
    const abiertas = d.tareas.filter(Tareas.abierta);
    const vencidas = abiertas.filter(Tareas.vencida);
    const bloqueadas = abiertas.filter(t => t.estado === 'bloqueada');
    const criticas = abiertas.filter(Tareas.critica).sort(Tareas.porFecha).slice(0, 6);
    // El cronograma se lee con las reglas del módulo Cronograma (también entiende los hitos de la versión anterior)
    const crono = { ...d, cronograma: d.cronograma.map(Cronograma.completa) };
    const ci = Cronograma.indicadores(crono);
    const proximas = ci.proximas.slice(0, 6);
    const ind = Equipo.indicadores(d);
    const etapa = d.etapas.find(e => e.id === pr.etapa) || d.etapas[0] || { nombre: 'Sin etapa', avance: 0 };
    const avance = d.etapas.length ? Math.round(d.etapas.reduce((s, e) => s + (e.avance || 0), 0) / d.etapas.length) : 0;
    const ultimo = d.configuracion.filter(c => c.tipo === 'historial').sort((a, b) => (b.ts || Date.parse(b.fecha)) - (a.ts || Date.parse(a.fecha)))[0];
    const diasRodaje = U.diasHasta(pr.inicioRodaje);

    // Alertas
    const alertas = [];
    if (vencidas.length) alertas.push({ n: 'alta', t: `${vencidas.length} ${vencidas.length === 1 ? 'tarea vencida' : 'tareas vencidas'}: ${vencidas.map(t => t.titulo).join(', ')}` });
    if (bloqueadas.length) alertas.push({ n: 'alta', t: `${bloqueadas.length} ${bloqueadas.length === 1 ? 'tarea bloqueada' : 'tareas bloqueadas'} sin resolver` });
    const pronto = abiertas.filter(t => (t.prioridad === 'alta' || t.prioridad === 'critica') && U.diasHasta(t.vence) >= 0 && U.diasHasta(t.vence) <= 2);
    if (pronto.length) alertas.push({ n: 'aviso', t: `${pronto.length} ${pronto.length === 1 ? 'tarea prioritaria vence' : 'tareas prioritarias vencen'} en 48 horas` });
    if (ci.conflictos.length) alertas.push({ n: 'alta', t: `${ci.conflictos.length} ${ci.conflictos.length === 1 ? 'actividad con conflicto' : 'actividades con conflictos'} de disponibilidad en el cronograma` });
    if (ci.retrasadas.length) alertas.push({ n: 'aviso', t: `${ci.retrasadas.length} ${ci.retrasadas.length === 1 ? 'actividad retrasada' : 'actividades retrasadas'} sin cerrar` });
    if (ind.vacantes) alertas.push({ n: 'aviso', t: `${ind.vacantes} ${ind.vacantes === 1 ? 'cargo vacante' : 'cargos vacantes'}` });
    if (ind.sobrecargadas.length) alertas.push({ n: 'aviso', t: `Más de 2 cargos: ${ind.sobrecargadas.map(s => `${s.persona.nombre} (${s.n})`).join(', ')}` });
    if (ind.sinDisp.length) alertas.push({ n: 'aviso', t: `Sin disponibilidad: ${ind.sinDisp.map(e => e.nombre).join(', ')}` });

    // Render
    $('fecha-hoy').textContent = U.larga(new Date());
    document.title = `${pr.titulo} · Panel principal`;

    $('claqueta').innerHTML = `
      <div class="claqueta-banda" aria-hidden="true"></div>
      <dl class="claqueta-campos">
        <div class="campo titulo"><dt>Producción</dt><dd>${esc(pr.titulo)}${pr.produccion ? `<small>${esc(pr.produccion)}</small>` : ''}</dd></div>
        <div class="campo"><dt>Dirección</dt><dd>${pr.direccion ? esc(pr.direccion) : '<span class="tenue">Sin definir</span>'}</dd></div>
        <div class="campo"><dt>Etapa actual</dt><dd>${esc(etapa.nombre)}</dd></div>
        <div class="campo"><dt>Inicio de rodaje</dt><dd>${Number.isNaN(diasRodaje) ? '<span class="tenue">Sin fecha</span>' : `${U.corta(pr.inicioRodaje)}<small>${diasTexto(diasRodaje)}</small>`}</dd></div>
        <div class="campo"><dt>Avance general</dt><dd>${avance}%</dd></div>
      </dl>
      <div class="claqueta-pie"><button class="btn" data-editar-proyecto>Editar datos del proyecto</button></div>`;

    const prox = proximas[0];
    const areas = [
      { id: 'equipo', href: 'modulos/equipo/equipo.html', n: 'Equipo y cargos', v: `${ind.confirmadas} de ${ind.registradas} confirmados`, s: `${ind.vacantes} cargos vacantes · ${ind.porConfirmar} por confirmar` },
      { id: 'tareas', href: 'modulos/tareas/tareas.html', n: 'Gestión de tareas', v: `${abiertas.length} tareas abiertas`, s: `${abiertas.filter(t => t.estado === 'curso').length} en curso · ${bloqueadas.length} bloqueadas` },
      { id: 'cronograma', href: 'modulos/cronograma/cronograma.html', n: 'Cronograma', v: prox ? `Próxima actividad ${prox.estado === 'curso' ? 'en curso' : U.relativo(Math.max(0, U.diasHasta(Cronograma.dia(prox.inicio))))}` : 'Sin actividades próximas', s: prox ? prox.titulo : 'Programa actividades en el calendario' },
      { id: 'etapas', href: 'modulos/etapas/etapas.html', n: 'Etapas y departamentos', v: etapa.nombre, s: `${etapa.avance || 0}% de avance · ${ind.departamentos} departamentos` },
      { id: 'configuracion', href: 'modulos/configuracion/configuracion.html', n: 'Configuración y registros', v: ultimo ? `Último cambio ${U.corta(ultimo.fecha)}` : 'Sin cambios', s: ultimo ? ultimo.texto : 'El historial aparecerá aquí' }
    ];
    // Los módulos aún no construidos se muestran sin enlace (evita páginas 404)
    $('areas').innerHTML = areas.map(a => {
      const cuerpo = `<h3>${esc(a.n)}</h3><span class="valor">${esc(a.v)}</span><span class="detalle">${esc(a.s)}</span>`;
      return Lateral.listo(a.id) ? `<a class="area" href="${a.href}">${cuerpo}</a>` : `<div class="area pronto" title="Módulo en construcción">${cuerpo}</div>`;
    }).join('');

    $('criticas').innerHTML = criticas.length ? criticas.map(t => {
      const n = U.diasHasta(t.vence);
      return `<li><span class="etiqueta ${t.estado}">${etiquetaEstado[t.estado] || esc(t.estado)}</span>
        <div class="tarea"><strong><a href="modulos/tareas/tareas.html#${encodeURIComponent(t.codigo || t.id)}">${esc(t.titulo)}</a></strong><span>${esc(nombreDe(t.resp))}</span></div>
        <span class="vence ${n < 0 ? 'vencida' : ''}">${U.relativo(n)}</span></li>`;
    }).join('') : '<li class="vacio">No hay tareas críticas abiertas.</li>';

    $('proximas').innerHTML = proximas.length ? proximas.map(e => {
      const f = Cronograma.dia(e.inicio) < U.hoy() ? U.hoy() : Cronograma.dia(e.inicio); // si ya empezó, cuenta desde hoy
      return `<li><div class="fecha"><b>${U.dia(f)}</b><span>${U.mes(f)}</span></div>
        <div class="tarea"><strong><a href="modulos/cronograma/cronograma.html#${encodeURIComponent(e.codigo)}">${esc(e.titulo)}</a></strong><span>${Cronograma.hora(e.inicio)}–${Cronograma.hora(e.fin)} · ${e.estado === 'curso' ? 'en curso' : U.relativo(U.diasHasta(f))}</span></div></li>`;
    }).join('') : '<li class="vacio">No hay actividades próximas.</li>';

    $('alertas').innerHTML = alertas.length
      ? alertas.map(a => `<li class="${a.n}">${esc(a.t)}</li>`).join('')
      : '<li class="vacio" style="border:0;background:none">Sin alertas por ahora.</li>';
  }

  await cargar();
  pintar();
})();
