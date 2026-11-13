/* Copia de seguridad: descargar, restaurar y empezar en limpio.
   Se abre con cualquier botón [data-respaldo]. Más adelante puede vivir dentro del módulo Configuración. */
const Respaldo = (() => {

  const nombreArchivo = async () => {
    let titulo = 'proyecto';
    try { titulo = ((await DB.todos('proyecto'))[0] || {}).titulo || titulo; } catch (x) { /* se usa el nombre genérico */ }
    const limpio = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto';
    return `copia-${limpio}-${Utils.hoy()}.json`;
  };

  function descargar(texto, nombre) {
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function abrir() {
    const dlg = document.createElement('dialog');
    const listo = DB.listo();
    dlg.innerHTML = `<div class="formulario respaldo-zona">
      <h2>Copia de seguridad</h2>
      <p class="tenue">Tus datos se guardan en este navegador, en este equipo. Descarga una copia con frecuencia, sobre todo antes de limpiar el navegador o cambiar de computadora.</p>
      <p class="tenue" id="r-estado" style="margin-top:8px"></p>
      ${listo ? '' : '<p class="aviso-datos" style="margin-top:12px">La base local no está disponible en este navegador, así que no se puede guardar ni restaurar nada.</p>'}
      <div class="respaldo-acciones">
        <button type="button" class="btn primario" data-exportar ${listo ? '' : 'disabled'}>Descargar copia (.json)</button>
        <button type="button" class="btn" data-restaurar ${listo ? '' : 'disabled'}>Restaurar desde un archivo…</button>
        <input type="file" accept=".json,application/json" hidden>
      </div>
      <h3>Empezar en limpio</h3>
      <p class="tenue">Borra los datos de ejemplo (o los actuales) y deja un proyecto vacío. Se conserva el catálogo de cargos.</p>
      <p style="margin-top:10px"><button type="button" class="btn peligro" data-limpiar ${listo ? '' : 'disabled'}>Borrar todo y empezar en limpio</button></p>
      <p class="error" role="alert"></p>
      <div class="acciones"><button type="button" class="btn" data-x>Cerrar</button></div></div>`;
    document.body.append(dlg);
    const $ = s => dlg.querySelector(s), error = t => { $('.error').textContent = t; };
    dlg.addEventListener('close', () => dlg.remove());
    $('[data-x]').onclick = () => dlg.close();

    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => {
      $('#r-estado').textContent = p ? 'El navegador protege estos datos contra borrados automáticos.'
        : 'El navegador podría borrar estos datos si se queda sin espacio. Por eso conviene descargar copias.';
    }).catch(() => {});

    $('[data-exportar]').onclick = async () => {
      try { descargar(JSON.stringify(await DB.exportar(), null, 2), await nombreArchivo()); error(''); }
      catch (x) { console.warn(x); error('No se pudo generar la copia.'); }
    };

    const archivo = $('input[type=file]');
    $('[data-restaurar]').onclick = () => archivo.click();
    archivo.onchange = async () => {
      const f = archivo.files[0]; archivo.value = '';
      if (!f) return;
      try {
        let copia;
        try { copia = JSON.parse(await f.text()); } catch (x) { throw new Error('El archivo no se puede leer como copia de seguridad.'); }
        const problema = DB.validar(copia);
        if (problema) throw new Error(problema);
        if (!confirm('Se reemplazarán TODOS los datos actuales por los de la copia. Si quieres conservarlos, descarga una copia antes.\n\n¿Restaurar ahora?')) return;
        await DB.importar(copia);
        location.reload();
      } catch (x) { console.warn(x); error(x.message || 'No se pudo restaurar la copia.'); }
    };

    $('[data-limpiar]').onclick = async () => {
      if (!confirm('Se borrarán TODAS las personas, asignaciones, tareas, fechas e historial actuales. Se conserva el catálogo de cargos.\n\nEsta acción no se puede deshacer. ¿Continuar?')) return;
      try { await DB.reiniciar(); location.reload(); }
      catch (x) { console.warn(x); error('No se pudo limpiar la base local.'); }
    };
    dlg.showModal();
  }

  document.addEventListener('click', e => { if (e.target.closest('[data-respaldo]')) abrir(); });
  return { abrir };
})();
