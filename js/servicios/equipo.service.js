/* Reglas del equipo. Las usan el panel, el módulo Equipo y cargos y, más adelante, Tareas. */
const Equipo = (() => {
  const estados = {
    persona: { pendiente: ['Pendiente', 'pendiente'], confirmada: ['Confirmada', 'confirmada'], baja: ['Ya no participa', 'baja'] },
    disp: { disponible: ['Disponible', 'confirmada'], parcial: ['Parcial', 'pendiente'], no: ['No disponible', 'bloqueada'] },
    asig: { pendiente: ['Pendiente', 'pendiente'], provisional: ['Provisional', 'provisional'], confirmada: ['Confirmada', 'confirmada'] }
  };
  const tag = (mapa, clave) => { const [n, c] = estados[mapa][clave] || [clave, '']; return `<span class="etiqueta ${c}">${n}</span>`; };
  const persona = (d, id) => d.personas.find(p => p.id === id);
  const activa = p => !!p && p.estado !== 'baja';

  // Un cargo queda cubierto por asignaciones provisionales o confirmadas de personas que siguen participando
  const cubiertas = (d, cargo) => d.asignaciones.filter(a => a.cargoId === cargo.id && a.estado !== 'pendiente' && activa(persona(d, a.personaId))).length;
  const vacantes = d => d.cargos.filter(c => c.estado === 'activo')
    .map(c => ({ cargo: c, faltan: Math.max(0, (c.plazas || 1) - cubiertas(d, c)) })).filter(v => v.faltan > 0);
  const porConfirmar = d => d.asignaciones.filter(a => a.estado !== 'confirmada' && activa(persona(d, a.personaId)));

  const LIMITE = 2; // más de 2 cargos por persona genera alerta
  const nCargos = (d, p) => d.asignaciones.filter(a => a.personaId === p.id).length;

  const indicadores = d => ({
    sobrecargadas: d.personas.filter(p => activa(p) && nCargos(d, p) > LIMITE).map(p => ({ persona: p, n: nCargos(d, p) })),
    registradas: d.personas.length,
    confirmadas: d.personas.filter(p => p.estado === 'confirmada').length,
    vacantes: vacantes(d).length,
    porConfirmar: porConfirmar(d).length,
    sinDisp: d.personas.filter(p => activa(p) && p.disp === 'no'),
    parciales: d.personas.filter(p => activa(p) && p.disp === 'parcial').length,
    departamentos: new Set(d.cargos.filter(c => c.estado === 'activo').map(c => c.departamento)).size
  });

  return { LIMITE, nCargos, estados, tag, persona, activa, cubiertas, vacantes, porConfirmar, indicadores };
})();
