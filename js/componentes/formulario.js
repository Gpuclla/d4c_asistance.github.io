/* Formulario en diálogo, compartido por todos los módulos.
   guardar(valores, formulario) devuelve un texto de error o nada si todo salió bien. */
const Formulario = {
  abrir(titulo, campos, valores, guardar, alGuardar) {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form class="formulario"><h2></h2>${campos}<p class="error" role="alert"></p>
      <div class="acciones"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primario">Guardar</button></div></form>`;
    dlg.querySelector('h2').textContent = titulo;
    document.body.append(dlg);
    const f = dlg.querySelector('form');
    Object.entries(valores || {}).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v ?? ''; });
    f.querySelector('[data-x]').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    f.onsubmit = async e => {
      e.preventDefault();
      const boton = f.querySelector('.primario');
      boton.disabled = true; // evita guardar dos veces con un doble clic
      let err;
      try { err = await guardar(Object.fromEntries(new FormData(f)), f); }
      catch (x) { console.warn(x); err = 'No se pudo guardar: la base local no está disponible.'; }
      boton.disabled = false;
      if (err) { f.querySelector('.error').textContent = err; return; }
      dlg.close();
      if (alGuardar) await alGuardar();
    };
    dlg.showModal();
    return dlg;
  }
};
