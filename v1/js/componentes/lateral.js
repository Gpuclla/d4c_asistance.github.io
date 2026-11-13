const Lateral = {
  // [id, nombre, ruta, listo]. Los módulos aún sin construir se muestran como «Pronto» en vez de dar error 404.
  // Al terminar un módulo, basta con cambiar su último valor a true.
  items: [
    ['panel', 'Panel principal', 'index.html', true],
    ['equipo', 'Equipo y cargos', 'modulos/equipo/equipo.html', true],
    ['tareas', 'Gestión de tareas', 'modulos/tareas/tareas.html', true],
    ['cronograma', 'Cronograma', 'modulos/cronograma/cronograma.html', true],
    ['etapas', 'Etapas y departamentos', 'modulos/etapas/etapas.html', false],
    ['configuracion', 'Configuración y registros', 'modulos/configuracion/configuracion.html', false]
  ],
  listo(id) { const i = this.items.find(x => x[0] === id); return !!(i && i[3]); },
  // base: ruta hacia la raíz del proyecto ('' en index.html, '../../' en los módulos)
  render(activo, base = '') {
    document.getElementById('lateral').innerHTML =
      `<div class="marca">Asistencia de dirección<small id="marca-proyecto">Versión beta</small></div>
       <nav class="nav" aria-label="Áreas del proyecto">${this.items.map(([id, n, h, listo]) => listo
        ? `<a href="${base}${h}"${id === activo ? ' aria-current="page"' : ''}>${n}</a>`
        : `<span class="pronto" aria-disabled="true">${n}<small>Pronto</small></span>`).join('')}</nav>
       <div class="lateral-pie"><button type="button" class="btn-respaldo" data-respaldo>Copia de seguridad</button><small>v1 · beta</small></div>`;
  },
  // Muestra el título del proyecto bajo el nombre de la aplicación
  proyecto(p) {
    const el = document.getElementById('marca-proyecto');
    if (el && p && p.titulo) el.textContent = p.titulo;
  }
};
