/* Ventanas modales reutilizables: formulario de edición y ficha de consulta. */
const Dialogo = (() => {
  function crear(html, clase) {
    const dlg = document.createElement('dialog');
    if (clase) dlg.className = clase;
    dlg.innerHTML = html;
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    return dlg;
  }
  // guardar(valores, formulario) devuelve un texto de error o nada; despues() corre tras guardar bien
  function abrir({ titulo, cuerpo, valores = {}, guardar, despues, clase }) {
    const dlg = crear(`<form class="formulario"><h2>${titulo}</h2>${cuerpo}<p class="error" role="alert"></p>
      <div class="acciones"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primario">Guardar</button></div></form>`, clase);
    const f = dlg.querySelector('form');
    Object.entries(valores).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v ?? ''; });
    f.querySelector('[data-x]').onclick = () => dlg.close();
    f.onsubmit = async e => {
      e.preventDefault();
      let err;
      try { err = await guardar(Object.fromEntries(new FormData(f)), f); }
      catch (x) { console.warn(x); err = 'No se pudo guardar: la base local no está disponible.'; }
      if (err) { f.querySelector('.error').textContent = err; return; }
      dlg.close();
      if (despues) await despues();
    };
    dlg.showModal();
    return dlg;
  }
  function ver(titulo, cuerpo, acciones = '', clase) {
    const dlg = crear(`<div class="formulario"><h2>${titulo}</h2>${cuerpo}<div class="acciones">${acciones}<button type="button" class="btn" data-x>Cerrar</button></div></div>`, clase);
    dlg.querySelector('[data-x]').onclick = () => dlg.close();
    dlg.showModal();
    return dlg;
  }
  return { abrir, ver };
})();
