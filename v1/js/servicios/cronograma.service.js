/* Reglas del cronograma (actividades programadas). Las usan el módulo Cronograma y el panel.
   Personas, departamentos y etapas se leen de Equipo y cargos, Tareas y Etapas; aquí no se duplican.
   Las fechas se guardan como texto local «AAAA-MM-DDTHH:mm» (sin zona horaria), igual que los campos datetime-local. */
const Cronograma = (() => {
  const U = Utils;

  // «Reprogramada» no es un estado: se deduce de reprogramaciones[], que conserva el historial del cambio.
  const estados = { provisional: ['Provisional', 'pendiente'], confirmada: ['Confirmada', 'confirmada'], curso: ['En curso', 'curso'], realizada: ['Realizada', 'realizada'], cancelada: ['Cancelada', 'baja'] };
  const relaciones = { fin: 'Depende de su finalización', inicio: 'Depende de su inicio' };

  const vacia = () => ({
    codigo: '', titulo: '', descripcion: '', etapa: '', departamento: '', lugar: '',
    inicio: '', fin: '', inicioReal: '', finReal: '',
    responsable: '', participantes: [], confirmados: [],
    tareas: [], predecesoras: [],
    estado: 'provisional', observaciones: '', reprogramaciones: [], creada: '', actualizada: '', cambios: []
  });
  // Acepta también los hitos de la versión anterior (solo tenían «fecha»)
  const completa = a => {
    const r = { ...vacia(), ...a };
    if (!r.inicio && a.fecha) {
      r.inicio = `${a.fecha}T09:00`; r.fin = `${a.fecha}T10:00`;
      r.observaciones = r.observaciones || 'Viene del cronograma anterior, que solo tenía fecha: el horario es provisional.';
    }
    delete r.fecha;
    return r;
  };

  // ---------- Fechas y horas ----------
  const f2 = n => String(n).padStart(2, '0');
  const aDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; };
  const aStr = x => `${x.getFullYear()}-${f2(x.getMonth() + 1)}-${f2(x.getDate())}T${f2(x.getHours())}:${f2(x.getMinutes())}`;
  const ahora = () => aStr(new Date());
  const dia = s => (s || '').slice(0, 10);
  const hora = s => (s || '').slice(11, 16);
  const mins = h => (+h.slice(0, 2)) * 60 + (+h.slice(3, 5));
  const minutos = a => { const x = aDate(a.inicio), y = aDate(a.fin); return x && y ? Math.round((y - x) / 60000) : NaN; }; // la duración siempre se calcula, nunca se escribe
  const durTxt = m => Number.isNaN(m) ? '' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`
    : `${Math.floor(m / 1440)} d${Math.floor(m % 1440 / 60) ? ' ' + Math.floor(m % 1440 / 60) + ' h' : ''}`;
  const rango = a => !a.inicio ? 'Sin horario' : dia(a.inicio) === dia(a.fin)
    ? `${U.corta(dia(a.inicio))} ${hora(a.inicio)}–${hora(a.fin)}` : `${U.corta(dia(a.inicio))} ${hora(a.inicio)} → ${U.corta(dia(a.fin))} ${hora(a.fin)}`;
  // Tramo (en minutos) que ocupa la actividad dentro de un día concreto
  const tramo = (a, iso) => [dia(a.inicio) === iso ? mins(hora(a.inicio)) : 0, dia(a.fin) === iso ? mins(hora(a.fin)) : 1440];
  const entraEn = (a, desde, hasta) => dia(a.inicio) <= hasta && dia(a.fin) >= desde;
  const delDia = (lista, iso) => lista.filter(a => entraEn(a, iso, iso) && tramo(a, iso)[1] > tramo(a, iso)[0]);
  const solapan = (a, b) => a.inicio < b.fin && b.inicio < a.fin;

  // ---------- Consultas ----------
  const abierta = a => a.estado !== 'realizada' && a.estado !== 'cancelada';
  const porInicio = (x, y) => x.inicio.localeCompare(y.inicio) || x.codigo.localeCompare(y.codigo, undefined, { numeric: true });
  const porId = (d, id) => d.cronograma.find(a => a.id === id);
  const personasDe = a => [...new Set([a.responsable, ...a.participantes].filter(Boolean))];
  const sinConfirmar = a => a.participantes.filter(id => !a.confirmados.includes(id));
  const retrasada = (a, ahoraS = ahora()) => abierta(a) && a.fin < ahoraS;
  const sucesoras = (d, a) => d.cronograma.filter(x => x.predecesoras.some(p => p.id === a.id));
  const departamentos = d => [...new Set(Tareas.departamentos(d).concat(d.cronograma.map(a => a.departamento)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  // ¿Estas predecesoras crearían un ciclo (A depende de B y B de A)?
  function creaCiclo(d, id, preds) {
    const vistos = new Set(), pila = [...preds];
    while (pila.length) {
      const x = pila.pop();
      if (x === id) return true;
      if (vistos.has(x)) continue;
      vistos.add(x);
      const b = porId(d, x);
      if (b) pila.push(...b.predecesoras.map(p => p.id));
    }
    return false;
  }

  // Conflictos de una actividad abierta. Se calculan siempre a partir de los datos; no se guardan.
  // tipo: disp (personas), dep (orden entre actividades), tarea, fecha · n: alta | aviso
  function conflictos(d, a) {
    const r = [];
    if (!abierta(a)) return r;
    const pr = d.proyecto[0] || {};
    personasDe(a).forEach(id => {
      const p = Equipo.persona(d, id), nom = p ? p.nombre : 'Persona eliminada';
      if (!p || !Equipo.activa(p)) r.push({ n: 'alta', tipo: 'disp', t: `${nom} ya no participa en el proyecto` });
      else if (p.disp === 'no') r.push({ n: 'alta', tipo: 'disp', t: `${nom} figura como no disponible${p.restricciones ? ` (${p.restricciones})` : ''}` });
      else if (p.disp === 'parcial') r.push({ n: 'aviso', tipo: 'disp', t: `${nom} tiene disponibilidad parcial${p.restricciones ? `: ${p.restricciones}` : ''}` });
      d.cronograma.filter(b => b.id !== a.id && b.estado !== 'cancelada' && (b.responsable === id || b.participantes.includes(id)) && solapan(a, b))
        .forEach(b => r.push({ n: 'alta', tipo: 'disp', t: `${nom} también está en «${b.titulo}» (${b.codigo}) a la misma hora` }));
    });
    a.predecesoras.forEach(({ id, tipo }) => {
      const b = porId(d, id); if (!b) return;
      if (b.estado === 'cancelada') r.push({ n: 'aviso', tipo: 'dep', t: `Depende de ${b.codigo}, que está cancelada` });
      else if (tipo === 'inicio' ? a.inicio < b.inicio : a.inicio < b.fin) r.push({ n: 'alta', tipo: 'dep', t: tipo === 'inicio' ? `Empieza antes de que empiece ${b.codigo}` : `Empieza antes de que termine ${b.codigo}` });
    });
    a.tareas.forEach(id => {
      const t = d.tareas.find(x => x.id === id);
      if (t && t.vence && t.estado !== 'hecha' && t.vence < dia(a.inicio)) r.push({ n: 'aviso', tipo: 'tarea', t: `La tarea ${t.codigo || t.titulo} vence el ${U.corta(t.vence)}, antes de esta actividad` });
    });
    if (a.etapa === 'produccion' && pr.inicioRodaje && dia(a.inicio) < pr.inicioRodaje) r.push({ n: 'aviso', tipo: 'fecha', t: `Es de la etapa Rodaje, pero está antes del inicio de rodaje (${U.corta(pr.inicioRodaje)})` });
    return r;
  }

  function indicadores(d, ahoraS = ahora()) {
    const hoy = ahoraS.slice(0, 10), fin7 = U.enDias(6);
    const ab = d.cronograma.filter(abierta), vigentes = ab.filter(a => a.fin >= ahoraS);
    return {
      total: d.cronograma.length,
      hoy: d.cronograma.filter(a => a.estado !== 'cancelada' && entraEn(a, hoy, hoy)).sort(porInicio),
      prox7: vigentes.filter(a => entraEn(a, hoy, fin7)).sort(porInicio),
      porConfirmar: vigentes.filter(a => a.estado === 'provisional' || sinConfirmar(a).length),
      conflictos: vigentes.filter(a => conflictos(d, a).some(c => c.tipo === 'disp' && c.n === 'alta')),
      reprogramadas: ab.filter(a => a.reprogramaciones.length),
      retrasadas: ab.filter(a => retrasada(a, ahoraS)),
      proximas: vigentes.sort(porInicio).slice(0, 8)
    };
  }
  const proximas = (d, n = 6) => indicadores(d).proximas.slice(0, n);

  // ---------- Código de actividad (A-001…): único, inmutable y nunca se reutiliza ----------
  const num = c => parseInt(String(c || '').replace(/\D/g, ''), 10) || 0;
  const contador = d => d.configuracion.find(c => c.id === 'contador-actividades');
  const ultimo = d => Math.max(contador(d) ? contador(d).n : 0, ...d.cronograma.map(a => num(a.codigo)), 0);
  const formato = n => 'A-' + String(n).padStart(3, '0');
  const opContador = n => ['guardar', 'configuracion', { id: 'contador-actividades', tipo: 'contador', n }];
  function nuevoCodigo(d) { const n = ultimo(d) + 1; return { codigo: formato(n), op: opContador(n) }; }

  // Pone al día lo guardado con la versión anterior (hitos con solo «fecha», sin código). Devuelve operaciones para DB.lote
  function migrar(d) {
    const pr = d.proyecto[0] || {};
    const sin = d.cronograma.filter(a => !a.codigo || !a.inicio).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (!sin.length && contador(d)) return [];
    let n = ultimo(d);
    const ops = [];
    sin.forEach(a => {
      // «Primer día de rodaje» ya lo representa la fecha de inicio de rodaje del proyecto: evita duplicarlo
      if (a.fecha && a.fecha === pr.inicioRodaje && /primer d[ií]a de rodaje/i.test(a.titulo || '')) { ops.push(['borrar', 'cronograma', a.id]); return; }
      n++;
      ops.push(['guardar', 'cronograma', { ...completa(a), codigo: formato(n), creada: a.creada || U.hoy(), actualizada: a.actualizada || U.hoy() }]);
    });
    ops.push(opContador(n));
    return ops;
  }

  // ---------- Estado, horas reales, reprogramación y registro de cambios ----------
  function ajustarReales(a) {
    const n = ahora(), r = { ...a };
    if (r.estado === 'curso') { r.inicioReal = r.inicioReal || n; r.finReal = ''; }
    else if (r.estado === 'realizada') { r.inicioReal = r.inicioReal || r.inicio; r.finReal = r.finReal || (n > r.inicioReal ? n : r.fin); }
    else if (r.estado !== 'cancelada') { r.inicioReal = ''; r.finReal = ''; }
    return r;
  }
  const conEstado = (a, estado) => ajustarReales({ ...a, estado });

  // Mover el horario de una actividad ya confirmada (o en curso) es una reprogramación y exige motivo.
  // En una actividad provisional el horario aún se está negociando y no cuenta.
  const esReprogramacion = (previa, nueva) => !!previa && (previa.estado === 'confirmada' || previa.estado === 'curso') && (previa.inicio !== nueva.inicio || previa.fin !== nueva.fin);
  const conReprogramacion = (previa, nueva, motivo) => ({ ...nueva, reprogramaciones: [...previa.reprogramaciones, { ts: Date.now(), deInicio: previa.inicio, deFin: previa.fin, aInicio: nueva.inicio, aFin: nueva.fin, motivo }] });

  const textos = { titulo: 'el nombre', descripcion: 'la descripción', observaciones: 'las observaciones', lugar: 'el lugar' };
  function diferencias(d, a, b) {
    const nom = id => id ? ((Equipo.persona(d, id) || {}).nombre || 'persona eliminada') : 'sin asignar';
    const mismos = (x, y) => [...x].sort().join() === [...y].sort().join();
    const r = [];
    if (a.estado !== b.estado) r.push(`Estado: ${estados[a.estado][0]} → ${estados[b.estado][0]}`);
    if (a.inicio !== b.inicio || a.fin !== b.fin) {
      const rp = b.reprogramaciones.length > a.reprogramaciones.length ? b.reprogramaciones[b.reprogramaciones.length - 1] : null;
      r.push(`Horario: ${rango(a)} → ${rango(b)}${rp ? ` (reprogramada; motivo: ${rp.motivo})` : ''}`);
    }
    if (a.inicioReal !== b.inicioReal || a.finReal !== b.finReal) r.push('Se actualizaron las horas reales');
    if (a.lugar !== b.lugar) r.push(`Lugar: ${a.lugar || 'sin definir'} → ${b.lugar || 'sin definir'}`);
    if (a.responsable !== b.responsable) r.push(`Responsable: ${nom(a.responsable)} → ${nom(b.responsable)}`);
    if (!mismos(a.participantes, b.participantes)) r.push('Se actualizaron los participantes');
    if (!mismos(a.confirmados, b.confirmados)) r.push('Se actualizaron las confirmaciones de asistencia');
    if (!mismos(a.tareas, b.tareas)) r.push('Se actualizaron las tareas vinculadas');
    if (JSON.stringify(a.predecesoras) !== JSON.stringify(b.predecesoras)) r.push('Se actualizaron las actividades predecesoras');
    if (a.etapa !== b.etapa) r.push('Se cambió la etapa');
    if (a.departamento !== b.departamento) r.push(`Departamento: ${a.departamento || 'sin definir'} → ${b.departamento || 'sin definir'}`);
    ['titulo', 'descripcion', 'observaciones'].forEach(k => { if (a[k] !== b[k]) r.push(`Se editó ${textos[k]}`); });
    return r;
  }
  function registrar(d, previa, nueva, ahoraTs = Date.now()) {
    const dif = previa ? diferencias(d, previa, nueva) : ['Se creó la actividad'];
    if (!dif.length) return null;
    return { cambios: dif, actividad: { ...nueva, actualizada: U.hoy(), cambios: [...(previa ? previa.cambios : []), ...dif.map(texto => ({ ts: ahoraTs, texto }))].slice(-100) } };
  }

  return { estados, relaciones, vacia, completa, aDate, aStr, ahora, dia, hora, mins, minutos, durTxt, rango, tramo, entraEn, delDia, solapan, abierta, porInicio, porId, personasDe,
    sinConfirmar, retrasada, sucesoras, departamentos, creaCiclo, conflictos, indicadores, proximas, nuevoCodigo, migrar, ajustarReales, conEstado,
    esReprogramacion, conReprogramacion, diferencias, registrar };
})();
