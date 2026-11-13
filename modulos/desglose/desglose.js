(async function () {
  const U = Utils, esc = U.esc, D = Desglose, T = Tareas, E = Equipo, $ = s => document.querySelector(s);
  const CAT = D.CATEGORIAS, CATS = Object.keys(CAT);
  const ui = { tab: 'escenas', gid: '', q: '', estadoEsc: '', cats: new Set(CATS), descartados: false, inv: { q: '', cat: '', esc: '', depto: '', estado: '', repetidos: false, descartados: false }, sel: null };
  let d, idx = { el: new Map(), es: new Map() }, cacheL = null;

  // ---------- Utilidades ----------
  const pref = { leer() { try { return localStorage.getItem('desglose.guion') || ''; } catch { return ''; } }, guardar(v) { try { localStorage.setItem('desglose.guion', v); } catch { /* sin almacenamiento */ } } };
  const guion = () => d.guiones.find(g => g.id === ui.gid);
  const dg = () => D.delGuion(d, ui.gid);
  const opcion = (v, t, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`;
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const aviso = t => { $('#aviso').innerHTML = t ? `<p class="aviso-datos" role="alert">${esc(t)}</p>` : ''; };
  const catTag = c => `<span class="cat c-${c}">${esc(CAT[c].n)}</span>`;
  const tagEl = x => `<span class="etiqueta ${D.ESTADOS_EL[x][1]}">${D.ESTADOS_EL[x][0]}</span>`;
  const tagEst = x => `<span class="etiqueta ${D.ESTADOS[x][1]}">${D.ESTADOS[x][0]}</span>`;
  const clave = (cat, nombre) => cat + '|' + D.plano(nombre).replace(/\s+/g, ' ').trim();
  const nuevoAp = (escenaId, elementoId, extra = {}) => ({ id: U.id('ap'), guionId: ui.gid, escenaId, elementoId, ini: null, fin: null, texto: '', estado: 'confirmada', origen: 'manual', dudosa: false, ...extra });
  const departamentos = () => [...new Set([...T.departamentos(d), ...d.elementos.map(e => e.departamento)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  async function hacer(ops, errorTxt) {
    try { await DB.lote(ops); aviso(''); await recargar(); return true; }
    catch (x) { console.warn(x); aviso(errorTxt || 'No se pudo guardar el cambio.'); return false; }
  }
  async function recargar() {
    d = await DB.cargarTodo();
    ['guiones', 'escenas', 'elementos', 'apariciones'].forEach(t => { d[t] = d[t] || []; });
    idx = { el: new Map(d.elementos.map(e => [e.id, e])), es: new Map(d.escenas.map(e => [e.id, e])) };
    if (!d.guiones.some(g => g.id === ui.gid)) {
      const nuevos = [...d.guiones].sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
      ui.gid = (d.guiones.find(g => g.id === pref.leer()) || nuevos[0] || {}).id || '';
    }
    pintar();
  }

  // Ventana modal simple (el formulario genérico se usa en lo demás)
  function dialogo(html, clase) {
    const dlg = document.createElement('dialog');
    if (clase) dlg.className = clase;
    dlg.innerHTML = `<div class="formulario">${html}</div>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', e => { if (e.target.closest('[data-x]')) dlg.close(); });
    dlg.showModal();
    return dlg;
  }

  // ---------- Barra, indicadores y pestañas ----------
  function barra() {
    const lista = [...d.guiones].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || (b.creado || '').localeCompare(a.creado || ''));
    $('#sel-guion').innerHTML = lista.map(g => opcion(g.id, `${g.nombre} · ${g.version}`, ui.gid)).join('');
    $('#lbl-guion').hidden = !lista.length;
  }
  function indicadores() {
    const x = dg(), inv = D.inventario(d, ui.gid).filter(i => i.estado !== 'descartado');
    const auto = x.apariciones.filter(a => a.estado === 'auto'), dud = auto.filter(a => a.dudosa).length, est = D.estadoGuion(x.escenas), g = guion();
    const items = [
      ['Escenas', x.escenas.length, `${g.formato}${g.pagEstimadas ? ' · páginas estimadas' : ''}`],
      ['Elementos únicos', inv.length, `${inv.filter(i => i.repetido).length} se repiten en varias escenas`],
      ['Sin revisar', auto.length, `${dud} dudosos`, false, dud > 0],
      ['Estado del desglose', D.ESTADOS[est][0], 'según el estado de sus escenas', true]
    ];
    $('#indicadores').innerHTML = items.map(([n, v, s, txt, mal]) => `<div class="indicador${mal ? ' mal' : ''}"><span class="indicador-n${txt ? ' txt' : ''}">${esc(v)}</span><span class="indicador-t">${n}</span><span class="indicador-s">${esc(s)}</span></div>`).join('');
  }
  function pestana(id) {
    ui.tab = id;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    ['escenas', 'guion', 'inventario', 'revision'].forEach(t => { $('#tab-' + t).hidden = t !== id; });
    pintarVista();
  }
  const VISTAS = { escenas: () => escenas(), guion: () => guionTexto(), inventario: () => { invFiltros(); invTabla(); }, revision: () => revision() };
  const pintarVista = () => VISTAS[ui.tab]();
  function pintar() {
    barra();
    const hay = !!guion();
    $('#vacio').hidden = hay; $('#contenido').hidden = !hay;
    if (hay) { indicadores(); pintarVista(); }
  }

  // ---------- C. Desglose por escenas ----------
  function escenas() {
    const x = dg(), q = D.plano(ui.q);
    $('#f-estado').innerHTML = opcion('', 'Todos los estados', ui.estadoEsc) + Object.entries(D.ESTADOS).map(([k, [n]]) => opcion(k, n, ui.estadoEsc)).join('');
    const porEsc = new Map();
    x.apariciones.forEach(a => {
      if (a.estado === 'descartada') return;
      const el = idx.el.get(a.elementoId); if (!el) return;
      let m = porEsc.get(a.escenaId); if (!m) porEsc.set(a.escenaId, m = {});
      (m[el.categoria] = m[el.categoria] || new Set()).add(el.id);
    });
    const lista = x.escenas.filter(e => (!ui.estadoEsc || e.estado === ui.estadoEsc) && (!q || D.plano(`${e.numero} ${e.locacion} ${e.resumen}`).includes(q)));
    $('#escenas-filas').innerHTML = lista.map(e => {
      const m = porEsc.get(e.id) || {};
      const puntos = CATS.filter(c => m[c]).map(c => `<span class="punto c-${c}" title="${esc(CAT[c].n)}">${m[c].size}</span>`).join('') || '<span class="tenue">—</span>';
      const dudosa = !e.locacion || !e.momento;
      return `<tr><td class="num">${esc(e.numero)}</td>
        <td><button class="enlace" data-ficha="${e.id}"><strong>${esc(e.ie || '')} ${esc(e.locacion || '(sin locación)')}${e.momento ? ' – ' + esc(e.momento) : ''}</strong></button>${dudosa ? ' <span class="etiqueta pendiente">Revisar encabezado</span>' : ''}<br><small class="tenue">${esc((e.resumen || '').slice(0, 120))}</small></td>
        <td>${esc(e.paginas || '—')}</td><td>${puntos}</td>
        <td><select class="sel-mini" data-estado-esc="${e.id}" aria-label="Estado de la escena ${esc(e.numero)}">${Object.entries(D.ESTADOS).map(([k, [n]]) => opcion(k, n, e.estado)).join('')}</select></td>
        <td class="acc"><button class="btn mini" data-ficha="${e.id}">Ficha</button>${e.ini != null ? ` <button class="btn mini" data-ver-guion="${e.id}">En el guion</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="vacio tenue">No hay escenas que coincidan. Puedes registrar una a mano.</td></tr>';
  }

  // Ficha individual de una escena
  function abrirFicha(id) {
    if (!idx.es.get(id)) return;
    const e0 = idx.es.get(id);
    const dlg = dialogo(`<h2></h2>
      <form class="f-esc">
        <div class="ficha-grid">
          <label>N.º<input name="numero" required maxlength="12"></label>
          <label>Interior / exterior<select name="ie"><option value="INT">INT</option><option value="EXT">EXT</option><option value="INT/EXT">INT/EXT</option></select></label>
          <label>Momento del día<input name="momento" list="dl-momentos" maxlength="30"></label>
          <label>Páginas<input name="paginas" maxlength="12"></label>
        </div>
        <label>Locación<input name="locacion" maxlength="120"></label>
        <label>Resumen de la acción<textarea name="resumen" rows="3"></textarea></label>
        <label>Observaciones de dirección<textarea name="observaciones" rows="2"></textarea></label>
        <label>Estado de revisión<select name="estado">${Object.entries(D.ESTADOS).map(([k, [n]]) => opcion(k, n, e0.estado)).join('')}</select></label>
        <datalist id="dl-momentos">${D.MOMENTOS.map(m => `<option value="${m}">`).join('')}</datalist>
        <p class="error" role="alert"></p>
        <div class="acciones"><button type="button" class="btn peligro" data-borrar-escena>Eliminar escena</button><button class="btn primario">Guardar cambios</button></div>
      </form>
      <h3>Elementos de la escena</h3><div class="f-els"></div>
      <form class="f-add"><label>Categoría<select name="cat">${CATS.map(c => opcion(c, CAT[c].n)).join('')}</select></label>
        <label>Añadir elemento<input name="nombre" list="dl-els" maxlength="80" placeholder="Nombre del elemento" autocomplete="off"></label><datalist id="dl-els"></datalist>
        <button class="btn">Añadir</button></form>
      <div class="acciones">${e0.ini != null ? '<button type="button" class="btn" data-ver>Ver en el guion</button>' : ''}<button type="button" class="btn" data-x>Cerrar</button></div>`, 'ancho');
    const fe = dlg.querySelector('.f-esc'), fa = dlg.querySelector('.f-add');
    const err = t => { fe.querySelector('.error').textContent = t || ''; };

    const llenar = () => {
      const e = idx.es.get(id); if (!e) return dlg.close();
      dlg.querySelector('h2').textContent = `Escena ${e.numero} · ${e.ie || ''} ${e.locacion || ''}`.trim();
      ['numero', 'ie', 'momento', 'paginas', 'locacion', 'resumen', 'observaciones', 'estado'].forEach(k => { fe.elements[k].value = e[k] || ''; });
      const aps = dg().apariciones.filter(a => a.escenaId === id), porEl = new Map();
      aps.forEach(a => { if (!porEl.has(a.elementoId)) porEl.set(a.elementoId, []); porEl.get(a.elementoId).push(a); });
      const filas = [...porEl.entries()].map(([eid, lista]) => ({ el: idx.el.get(eid), lista })).filter(x => x.el);
      dlg.querySelector('.f-els').innerHTML = CATS.map(c => {
        const f = filas.filter(x => x.el.categoria === c).sort((a, b) => a.el.nombre.localeCompare(b.el.nombre, 'es'));
        if (!f.length) return '';
        return `<h3>${catTag(c)}</h3><ul class="el-lista">${f.map(({ el, lista }) => {
          const st = D.estadoElemento(lista), manual = lista.every(a => a.ini == null);
          return `<li class="el-fila"><strong>${esc(el.nombre)}</strong>${el.extra ? ' <span class="tenue">(extras)</span>' : ''} <span class="tenue">${plural(lista.length, 'mención', 'menciones')}${manual ? ' · añadido a mano' : ''}</span> ${tagEl(st)}
            <span class="el-acc">${st === 'descartado' ? `<button class="btn mini" data-el-restaurar="${el.id}">Restaurar</button>` : `${st !== 'confirmado' ? `<button class="btn mini" data-el-confirmar="${el.id}">Confirmar</button>` : ''}<button class="btn mini" data-el-descartar="${el.id}">Descartar</button>`}</span></li>`;
        }).join('')}</ul>`;
      }).join('') || '<p class="tenue">Esta escena todavía no tiene elementos.</p>';
      listaSugerencias();
    };
    const listaSugerencias = () => {
      dlg.querySelector('#dl-els').innerHTML = d.elementos.filter(e => e.guionId === ui.gid && e.categoria === fa.elements.cat.value).map(e => `<option value="${esc(e.nombre)}">`).join('');
    };
    llenar();
    fa.elements.cat.addEventListener('change', listaSugerencias);

    fe.onsubmit = async ev => {
      ev.preventDefault();
      const e = idx.es.get(id), v = Object.fromEntries(new FormData(fe));
      if (!v.numero.trim()) return err('Escribe el número de la escena.');
      const nueva = { ...e, numero: v.numero.trim(), ie: v.ie, momento: v.momento.trim(), locacion: v.locacion.trim(), paginas: v.paginas.trim(), resumen: v.resumen.trim(), observaciones: v.observaciones.trim(), estado: v.estado };
      const ops = [['guardar', 'escenas', nueva]];
      if (nueva.locacion && D.plano(nueva.locacion) !== D.plano(e.locacion || '')) { // la locación cambió: se mueve el vínculo
        const x = dg();
        x.apariciones.filter(a => a.escenaId === id && a.estado !== 'descartada' && (idx.el.get(a.elementoId) || {}).categoria === 'locacion').forEach(a => ops.push(['guardar', 'apariciones', { ...a, estado: 'descartada' }]));
        let el = x.elementos.find(q => clave(q.categoria, q.nombre) === clave('locacion', nueva.locacion));
        if (!el) { el = { id: U.id('el'), guionId: ui.gid, categoria: 'locacion', nombre: nueva.locacion, departamento: CAT.locacion.dep, notas: '', tareaId: '' }; ops.push(['guardar', 'elementos', el]); }
        ops.push(['guardar', 'apariciones', nuevoAp(id, el.id)]);
      }
      err('');
      if (await hacer(ops)) llenar(); else err('No se pudo guardar.');
    };
    fa.onsubmit = async ev => {
      ev.preventDefault();
      const nombre = fa.elements.nombre.value.trim(); if (!nombre) return;
      const r = añadirAEscena(id, fa.elements.cat.value, nombre);
      if (r.error) return err(r.error);
      err('');
      if (await hacer(r.ops)) { fa.elements.nombre.value = ''; llenar(); } else err('No se pudo guardar.');
    };
    dlg.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const ds = b.dataset, aps = elId => dg().apariciones.filter(a => a.escenaId === id && a.elementoId === elId);
      if (ds.elConfirmar) { if (await hacer(aps(ds.elConfirmar).filter(a => a.estado !== 'descartada').map(a => ['guardar', 'apariciones', { ...a, estado: 'confirmada' }]))) llenar(); }
      else if (ds.elDescartar) { if (await hacer(aps(ds.elDescartar).map(a => ['guardar', 'apariciones', { ...a, estado: 'descartada' }]))) llenar(); }
      else if (ds.elRestaurar) { if (await hacer(aps(ds.elRestaurar).map(a => ['guardar', 'apariciones', { ...a, estado: a.origen === 'manual' ? 'confirmada' : 'auto' }]))) llenar(); }
      else if ('ver' in ds) { dlg.close(); irAEscena(id); }
      else if ('borrarEscena' in ds) {
        const e = idx.es.get(id);
        if (!confirm(`¿Eliminar la escena ${e.numero}? Se quitan también sus menciones de elementos. Esta acción no se puede deshacer.`)) return;
        dlg.close();
        await hacer([['borrar', 'escenas', id], ...dg().apariciones.filter(a => a.escenaId === id).map(a => ['borrar', 'apariciones', a.id]), ['guardar', 'configuracion', DB.entrada(`Se eliminó la escena ${e.numero} del desglose de «${guion().nombre}»`)]]);
      }
    });
  }

  // Añade (o confirma) un elemento en una escena sin tocar el texto del guion
  function añadirAEscena(escenaId, cat, nombre) {
    const x = dg(), ops = [];
    let el = x.elementos.find(q => clave(q.categoria, q.nombre) === clave(cat, nombre));
    if (!el) { el = { id: U.id('el'), guionId: ui.gid, categoria: cat, nombre, departamento: CAT[cat].dep, notas: '', tareaId: '' }; ops.push(['guardar', 'elementos', el]); }
    const previas = x.apariciones.filter(a => a.escenaId === escenaId && a.elementoId === el.id);
    if (previas.some(a => a.estado !== 'descartada' && a.estado === 'confirmada')) return { error: `«${el.nombre}» ya está confirmado en esta escena.` };
    if (previas.length) previas.forEach(a => ops.push(['guardar', 'apariciones', { ...a, estado: 'confirmada' }]));
    else ops.push(['guardar', 'apariciones', nuevoAp(escenaId, el.id)]);
    return { ops };
  }

  function formEscenaNueva() {
    const campos = `<div class="par"><label>N.º de escena<input name="numero" required maxlength="12"></label><label>Interior / exterior<select name="ie"><option value="INT">INT</option><option value="EXT">EXT</option><option value="INT/EXT">INT/EXT</option></select></label></div>
      <label>Locación<input name="locacion" required maxlength="120"></label>
      <div class="par"><label>Momento del día<input name="momento" list="dl-mom2"></label><label>Páginas<input name="paginas" maxlength="12"></label></div><datalist id="dl-mom2">${D.MOMENTOS.map(m => `<option value="${m}">`).join('')}</datalist>
      <label>Resumen de la acción<textarea name="resumen" rows="3"></textarea></label>
      <p class="nota">Una escena a mano no tiene texto en el guion: sirve para registrar escenas que faltan o añadidas después.</p>`;
    const sig = Math.max(0, ...dg().escenas.map(e => parseInt(e.numero, 10) || 0)) + 1;
    Formulario.abrir('Registrar escena', campos, { numero: String(sig), ie: 'INT' }, async v => {
      const locacion = v.locacion.trim(), numero = v.numero.trim();
      if (!numero || !locacion) return 'Escribe el número y la locación.';
      const x = dg(), e = { id: U.id('es'), guionId: ui.gid, orden: Math.max(0, ...x.escenas.map(q => q.orden)) + 1, numero, ie: v.ie, locacion, momento: v.momento.trim(), paginas: v.paginas.trim(), resumen: v.resumen.trim(), observaciones: '', estado: 'pendiente', ini: null, fin: null };
      const ops = [['guardar', 'escenas', e]];
      let el = x.elementos.find(q => clave(q.categoria, q.nombre) === clave('locacion', locacion));
      if (!el) { el = { id: U.id('el'), guionId: ui.gid, categoria: 'locacion', nombre: locacion, departamento: CAT.locacion.dep, notas: '', tareaId: '' }; ops.push(['guardar', 'elementos', el]); }
      ops.push(['guardar', 'apariciones', nuevoAp(e.id, el.id)], ['guardar', 'configuracion', DB.entrada(`Se registró a mano la escena ${numero} en «${guion().nombre}»`)]);
      await DB.lote(ops);
    }, recargar);
  }

  // ---------- D. Guion marcado por colores ----------
  const lineasDe = g => { if (!cacheL || cacheL.id !== g.id) cacheL = { id: g.id, L: D.clasificar(g.texto) }; return cacheL.L; };

  function guionTexto() {
    const g = guion(), x = dg(), L = lineasDe(g), texto = g.texto;
    const visibles = x.apariciones.filter(a => a.ini != null && (a.estado !== 'descartada' || ui.descartados) && idx.el.get(a.elementoId));
    const cuenta = {}; visibles.forEach(a => { const c = idx.el.get(a.elementoId).categoria; cuenta[c] = (cuenta[c] || 0) + 1; });
    $('#leyenda').innerHTML = CATS.map(c => `<button class="leyenda c-${c}" data-cat="${c}" aria-pressed="${ui.cats.has(c)}">${esc(CAT[c].n)} <b>${cuenta[c] || 0}</b></button>`).join('');
    $('#f-descartados').checked = ui.descartados;
    const escs = x.escenas.filter(e => e.ini != null).sort((a, b) => a.ini - b.ini);
    $('#ir-escena').innerHTML = '<option value="">Elegir…</option>' + escs.map(e => `<option value="${e.id}">${esc(e.numero)} · ${esc(e.locacion || '')}</option>`).join('');

    const porEsc = new Map();
    visibles.filter(a => ui.cats.has(idx.el.get(a.elementoId).categoria)).forEach(a => { if (!porEsc.has(a.escenaId)) porEsc.set(a.escenaId, []); porEsc.get(a.escenaId).push(a); });
    const seg = (a, b) => a < b ? `<span data-o="${a}">${esc(texto.slice(a, b))}</span>` : '';
    const linea = (l, ms, st) => {
      if (l.tipo === 'vacia') return '<div class="l l-vacia"></div>';
      let c = l.ini + (l.t.length - l.t.trimStart().length), out = '';
      while (st.i < ms.length && ms[st.i].ini < l.fin) {
        const a = ms[st.i++], el = idx.el.get(a.elementoId);
        if (a.ini < c || a.fin > l.fin) continue;
        out += seg(c, a.ini) + `<mark class="m c-${el.categoria} e-${a.estado}${a.dudosa && a.estado === 'auto' ? ' dud' : ''}" data-ap="${a.id}" data-o="${a.ini}" title="${esc(el.nombre)} · ${esc(CAT[el.categoria].n)}${a.dudosa && a.estado === 'auto' ? ' · dudoso' : ''}">${esc(texto.slice(a.ini, a.fin))}</mark>`;
        c = a.fin;
      }
      return `<div class="l l-${l.tipo}">${out + seg(c, l.fin)}</div>`;
    };
    let li = 0, html = '';
    const primera = escs.length ? escs[0].ini : texto.length;
    while (li < L.length && L[li].ini < primera) html += linea(L[li++], [], { i: 0 });
    html = html ? `<div class="g-escena" data-escena="">${html}</div>` : '';
    escs.forEach(e => {
      const ms = (porEsc.get(e.id) || []).sort((a, b) => a.ini - b.ini), st = { i: 0 };
      let bloque = '';
      while (li < L.length && L[li].ini < e.fin) bloque += linea(L[li++], ms, st);
      html += `<section class="g-escena" id="gs-${e.id}" data-escena="${e.id}">${bloque}</section>`;
    });
    $('#guion-texto').innerHTML = html || '<p class="tenue">Este guion no tiene escenas detectadas con texto. Puedes registrar escenas a mano en la pestaña Escenas.</p>';
  }
  function irAEscena(id) {
    ui.tab !== 'guion' && pestana('guion');
    const el = document.getElementById('gs-' + id);
    if (el) { el.scrollIntoView({ block: 'start' }); const c = $('#guion-texto'); c.scrollTop = el.offsetTop - c.offsetTop - 8; }
  }

  // Selección de texto → añadir como elemento
  const punto = (nodo, off) => {
    const el = nodo && (nodo.nodeType === 3 ? nodo.parentElement : nodo), s = el && el.closest('[data-o]');
    if (!s) return null;
    const lin = s.closest('.l'), es = s.closest('[data-escena]');
    return lin && es ? { o: +s.dataset.o + (nodo.nodeType === 3 ? off : 0), linea: lin, escena: es.dataset.escena } : null;
  };
  function seleccion() {
    const btn = $('#btn-agregar'), sel = getSelection();
    btn.hidden = true; ui.sel = null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const a = punto(sel.anchorNode, sel.anchorOffset), b = punto(sel.focusNode, sel.focusOffset);
    if (!a || !b || a.linea !== b.linea || !a.escena) return;
    const txt = guion().texto; let ini = Math.min(a.o, b.o), fin = Math.max(a.o, b.o);
    while (ini < fin && /\s/.test(txt[ini])) ini++;
    while (fin > ini && /\s/.test(txt[fin - 1])) fin--;
    if (fin - ini < 2) return;
    ui.sel = { ini, fin, escenaId: a.escena };
    const r = sel.getRangeAt(0).getBoundingClientRect();
    btn.style.left = Math.max(8, Math.min(r.right, innerWidth - 220)) + 'px'; btn.style.top = Math.max(8, Math.min(r.bottom + 8, innerHeight - 52)) + 'px'; btn.hidden = false;
  }

  function formAgregar() {
    const s = ui.sel, g = guion(); if (!s) return;
    const x = dg(), texto = g.texto.slice(s.ini, s.fin);
    const choca = x.apariciones.find(a => a.ini != null && a.escenaId === s.escenaId && a.estado !== 'descartada' && a.ini < s.fin && a.fin > s.ini);
    if (choca) return aviso(`Esa parte del texto ya está marcada como «${(idx.el.get(choca.elementoId) || {}).nombre}». Haz clic sobre ella para editarla.`);
    const campos = `<label>Texto seleccionado<input name="texto" readonly></label>
      <div class="par"><label>Categoría<select name="cat">${CATS.map(c => opcion(c, CAT[c].n)).join('')}</select></label>
      <label>Departamento<select name="depto">${departamentos().map(q => opcion(q, q, CAT.personaje.dep)).join('')}</select></label></div>
      <label>Nombre del elemento<input name="nombre" list="dl-nom" maxlength="80" autocomplete="off"></label><datalist id="dl-nom"></datalist>
      <label class="check"><input type="checkbox" name="todas" checked> Marcar también las demás veces que aparece este texto en el guion</label>
      <p class="nota">Si el elemento ya existe, se reutiliza: no se crean duplicados.</p>`;
    const dlg = Formulario.abrir('Añadir elemento', campos, { texto, cat: 'utileria', nombre: texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase() }, async (v, f) => {
      const nombre = v.nombre.trim(); if (!nombre) return 'Escribe el nombre del elemento.';
      let el = x.elementos.find(q => clave(q.categoria, q.nombre) === clave(v.cat, nombre));
      const ops = [];
      if (!el) { el = { id: U.id('el'), guionId: ui.gid, categoria: v.cat, nombre, departamento: v.depto || CAT[v.cat].dep, notas: '', tareaId: '' }; ops.push(['guardar', 'elementos', el]); }
      let k = 0; const ap = (escenaId, ini, fin) => nuevoAp(escenaId, el.id, { id: U.id('ap') + (k++).toString(36), ini, fin, texto: g.texto.slice(ini, fin) });
      ops.push(['guardar', 'apariciones', ap(s.escenaId, s.ini, s.fin)]);
      if (f.elements.todas.checked) {
        const L = lineasDe(g), tp = D.plano(g.texto), nec = D.plano(texto).replace(/\s+/g, ' ');
        const re = new RegExp('(?<![a-zñ0-9])' + nec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?![a-zñ0-9])', 'g');
        const escs = x.escenas.filter(e => e.ini != null); let m;
        while ((m = re.exec(tp))) {
          const ini = m.index, fin = ini + m[0].length;
          if (ini === s.ini) continue;
          const e = escs.find(q => ini >= q.ini && ini < q.fin); if (!e) continue;
          const lin = L.find(l => ini >= l.ini && ini <= l.fin);
          if (!lin || lin.tipo === 'slug' || fin > lin.fin) continue;
          if (x.apariciones.some(a => a.ini != null && a.estado !== 'descartada' && a.ini < fin && a.fin > ini)) continue;
          ops.push(['guardar', 'apariciones', ap(e.id, ini, fin)]);
        }
      }
      await DB.lote(ops);
    }, () => { getSelection().removeAllRanges(); recargar(); });
    const sug = () => { dlg.querySelector('#dl-nom').innerHTML = x.elementos.filter(e => e.categoria === dlg.querySelector('[name=cat]').value).map(e => `<option value="${esc(e.nombre)}">`).join(''); };
    sug();
    dlg.querySelector('[name=cat]').addEventListener('change', e => { sug(); dlg.querySelector('[name=depto]').value = CAT[e.target.value].dep; });
    dlg.querySelector('[name=depto]').value = CAT.utileria.dep;
  }

  // Consultar / editar una palabra marcada
  function abrirAparicion(id) {
    const a = d.apariciones.find(q => q.id === id), el = a && idx.el.get(a.elementoId); if (!el) return;
    const inv = D.inventario(d, ui.gid).find(i => i.el.id === el.id);
    const lista = inv.escenas.map(e => e.numero).join(', ');
    const est = { auto: 'Detectada, sin revisar', confirmada: 'Confirmada', descartada: 'Descartada' }[a.estado];
    const dlg = dialogo(`<h2>${esc(el.nombre)}</h2><p>${catTag(el.categoria)} ${tagEl(inv.estado)} ${inv.repetido ? '<span class="etiqueta">Se repite</span>' : ''}</p>
      ${a.texto ? `<p class="cita">«${esc(a.texto)}»</p>` : ''}
      <dl class="ficha"><dt>Esta aparición</dt><dd>${est}</dd>
      <dt>Aparece en</dt><dd>${inv.escenas.length ? `${plural(inv.escenas.length, 'escena', 'escenas')}: ${esc(lista)}` : 'ninguna escena activa'}</dd>
      <dt>Departamento</dt><dd>${esc(el.departamento || '—')}</dd>${el.notas ? `<dt>Notas</dt><dd>${esc(el.notas)}</dd>` : ''}</dl>
      ${a.dudosa && a.estado === 'auto' ? '<p class="aviso-datos">La palabra tiene varios sentidos o está dentro de un diálogo: comprueba que de verdad sea una necesidad.</p>' : ''}
      <div class="acciones" style="flex-wrap:wrap;justify-content:flex-start">
        ${a.estado !== 'confirmada' ? '<button class="btn primario" data-a="confirmar">Confirmar</button>' : ''}
        ${a.estado !== 'descartada' ? '<button class="btn" data-a="descartar">Descartar esta aparición</button>' : '<button class="btn" data-a="restaurar">Restaurar</button>'}
        <button class="btn" data-a="descartar-todo">Descartar en todo el guion</button>
        <button class="btn" data-a="cambiar">Es otro elemento…</button>
        <button class="btn" data-a="editar">Editar elemento…</button>
        <button type="button" class="btn" data-x style="margin-left:auto">Cerrar</button></div>`);
    dlg.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return;
      const acc = b.dataset.a;
      if (acc === 'confirmar') { dlg.close(); await hacer([['guardar', 'apariciones', { ...a, estado: 'confirmada' }]]); }
      else if (acc === 'descartar') { dlg.close(); await hacer([['guardar', 'apariciones', { ...a, estado: 'descartada' }]]); }
      else if (acc === 'restaurar') { dlg.close(); await hacer([['guardar', 'apariciones', { ...a, estado: a.origen === 'manual' ? 'confirmada' : 'auto' }]]); }
      else if (acc === 'descartar-todo') {
        if (!confirm(`¿Descartar «${el.nombre}» en todo el guion? Se descartan ${plural(inv.aps.filter(q => q.estado !== 'descartada').length, 'aparición', 'apariciones')}.`)) return;
        dlg.close(); await hacer(inv.aps.map(q => ['guardar', 'apariciones', { ...q, estado: 'descartada' }]));
      } else if (acc === 'cambiar') { dlg.close(); formCambiar(a, el); }
      else if (acc === 'editar') { dlg.close(); formElemento(el); }
    });
  }

  // Esta aparición en realidad es otro elemento
  function formCambiar(a, el) {
    const campos = `<p class="cita">«${esc(a.texto || el.nombre)}»</p>
      <label>Categoría<select name="cat">${CATS.map(c => opcion(c, CAT[c].n, el.categoria)).join('')}</select></label>
      <label>Elemento<input name="nombre" list="dl-cam" maxlength="80" autocomplete="off"></label><datalist id="dl-cam"></datalist>
      <p class="nota">Solo cambia esta aparición; el elemento «${esc(el.nombre)}» no se modifica. Si el nombre ya existe, se reutiliza.</p>`;
    const dlg = Formulario.abrir('Es otro elemento', campos, { cat: el.categoria, nombre: el.nombre }, async v => {
      const nombre = v.nombre.trim(); if (!nombre) return 'Escribe el nombre del elemento.';
      const x = dg(), ops = [];
      let nuevo = x.elementos.find(q => clave(q.categoria, q.nombre) === clave(v.cat, nombre));
      if (!nuevo) { nuevo = { id: U.id('el'), guionId: ui.gid, categoria: v.cat, nombre, departamento: CAT[v.cat].dep, notas: '', tareaId: '' }; ops.push(['guardar', 'elementos', nuevo]); }
      if (nuevo.id === a.elementoId) return 'Es el mismo elemento.';
      ops.push(['guardar', 'apariciones', { ...a, elementoId: nuevo.id, estado: 'confirmada', dudosa: false }]);
      await DB.lote(ops);
    }, recargar);
    const sug = () => { dlg.querySelector('#dl-cam').innerHTML = d.elementos.filter(e => e.guionId === ui.gid && e.categoria === dlg.querySelector('[name=cat]').value).map(e => `<option value="${esc(e.nombre)}">`).join(''); };
    sug(); dlg.querySelector('[name=cat]').addEventListener('change', sug);
  }

  // ---------- E. Inventario general ----------
  function invFiltros() {
    const f = ui.inv, inv = D.inventario(d, ui.gid), x = dg();
    $('#i-cat').innerHTML = opcion('', 'Todas las categorías', f.cat) + CATS.map(c => opcion(c, CAT[c].n, f.cat)).join('');
    $('#i-esc').innerHTML = opcion('', 'Todas las escenas', f.esc) + x.escenas.map(e => opcion(e.id, `Esc. ${e.numero} · ${e.locacion || ''}`, f.esc)).join('');
    $('#i-depto').innerHTML = opcion('', 'Todos los departamentos', f.depto) + [...new Set([...departamentos(), ...inv.map(i => i.el.departamento)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map(q => opcion(q, q, f.depto)).join('');
    $('#i-estado').innerHTML = opcion('', 'Todos los estados', f.estado) + Object.entries(D.ESTADOS_EL).filter(([k]) => k !== 'descartado').map(([k, [n]]) => opcion(k, n, f.estado)).join('');
    $('#i-q').value = f.q; $('#i-rep').checked = f.repetidos; $('#i-desc').checked = f.descartados;
  }
  function invTabla() {
    const f = ui.inv, q = D.plano(f.q), g = guion();
    const todos = D.inventario(d, ui.gid);
    const lista = todos.filter(x => (f.descartados || x.estado !== 'descartado') && (!f.cat || x.el.categoria === f.cat) && (!f.esc || x.escenas.some(e => e.id === f.esc))
      && (!f.depto || x.el.departamento === f.depto) && (!f.estado || x.estado === f.estado) && (!f.repetidos || x.repetido) && (!q || D.plano(x.el.nombre).includes(q)));
    $('#i-cuenta').textContent = `${plural(lista.length, 'elemento', 'elementos')} · ${plural(lista.filter(x => x.repetido).length, 'se repite', 'se repiten')} en varias escenas`;
    const deps = [...new Set([...departamentos(), ...todos.map(i => i.el.departamento)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    $('#inv-grupos').innerHTML = CATS.map(c => {
      const fs = lista.filter(x => x.el.categoria === c).sort((a, b) => a.el.nombre.localeCompare(b.el.nombre, 'es'));
      if (!fs.length) return '';
      return `<section class="inv-grupo"><h3>${catTag(c)} <span class="tenue">${fs.length}</span></h3><div class="tabla-caja"><table>
        <thead><tr><th>Elemento</th><th>Escenas</th><th>Veces</th><th>Estado</th><th>Departamento</th><th>Tarea</th><th></th></tr></thead><tbody>${fs.map(x => {
          const t = x.el.tareaId && d.tareas.find(q => q.id === x.el.tareaId);
          const tarea = t ? `<a href="../tareas/tareas.html#${encodeURIComponent(t.codigo)}">${esc(t.codigo)}</a> <span class="tenue">${esc((T.estados[t.estado] || [t.estado])[0])}</span>`
            : x.el.tareaId ? '<span class="tenue">tarea eliminada</span> ' : '';
          return `<tr><td><strong>${esc(x.el.nombre)}</strong>${x.el.extra ? ' <span class="tenue">(extras)</span>' : ''}${x.el.notas ? `<br><small class="tenue">${esc(x.el.notas)}</small>` : ''}</td>
            <td><div class="chips-esc">${x.escenas.map(e => `<button class="chip-esc" data-ficha="${e.id}" title="${esc(e.locacion || '')}">${esc(e.numero)}</button>`).join('') || '<span class="tenue">—</span>'}</div></td>
            <td>${x.vivas.length}</td>
            <td><div class="est-bloque">${tagEl(x.estado)}${x.repetido ? '<span class="etiqueta">Repetido</span>' : ''}${x.dudosas ? `<span class="etiqueta pendiente">${x.dudosas} dudoso${x.dudosas > 1 ? 's' : ''}</span>` : ''}</div></td>
            <td><select class="sel-mini" data-depto-el="${x.el.id}" aria-label="Departamento de ${esc(x.el.nombre)}">${deps.map(q => opcion(q, q, x.el.departamento)).join('')}</select></td>
            <td>${tarea}${x.estado !== 'descartado' && !t ? `<button class="btn mini" data-tarea="${x.el.id}">Crear tarea</button>` : ''}</td>
            <td class="acc">${x.estado === 'descartado' ? `<button class="btn mini" data-inv-restaurar="${x.el.id}">Restaurar</button>` : `${x.estado !== 'confirmado' ? `<button class="btn mini" data-inv-confirmar="${x.el.id}">Confirmar</button> ` : ''}<button class="btn mini" data-inv-editar="${x.el.id}">Editar</button> <button class="btn mini" data-inv-fusionar="${x.el.id}">Fusionar</button> <button class="btn mini" data-inv-descartar="${x.el.id}">Descartar</button>`}</td></tr>`;
        }).join('')}</tbody></table></div></section>`;
    }).join('') || '<p class="vacio tenue">No hay elementos con esos filtros.</p>';
  }

  const apsDe = elId => dg().apariciones.filter(a => a.elementoId === elId);

  function formElemento(el) {
    const campos = `<label>Nombre<input name="nombre" required maxlength="80"></label>
      <div class="par"><label>Categoría<select name="cat">${CATS.map(c => opcion(c, CAT[c].n, el.categoria)).join('')}</select></label>
      <label>Departamento<select name="depto">${departamentos().concat(el.departamento && !departamentos().includes(el.departamento) ? [el.departamento] : []).map(q => opcion(q, q, el.departamento)).join('')}</select></label></div>
      <label>Notas de producción<textarea name="notas" rows="3"></textarea></label>`;
    Formulario.abrir('Editar elemento', campos, { nombre: el.nombre, notas: el.notas || '' }, async v => {
      const nombre = v.nombre.trim(); if (!nombre) return 'Escribe el nombre.';
      const otro = dg().elementos.find(q => q.id !== el.id && clave(q.categoria, q.nombre) === clave(v.cat, nombre));
      if (otro) return `Ya existe «${otro.nombre}» en esa categoría. Usa «Fusionar» para unirlos sin perder las escenas.`;
      const nuevo = { ...el, nombre, categoria: v.cat, departamento: v.depto, notas: v.notas.trim() };
      const ops = [['guardar', 'elementos', nuevo]];
      if (nombre !== el.nombre || v.cat !== el.categoria) ops.push(['guardar', 'configuracion', DB.entrada(`Se corrigió el elemento «${el.nombre}» → «${nombre}» (${CAT[v.cat].n})`)]);
      await DB.lote(ops);
    }, recargar);
  }

  function formFusionar(el, destinoId) {
    const otros = dg().elementos.filter(q => q.id !== el.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!otros.length) return aviso('No hay otro elemento con el que fusionar.');
    const campos = `<p>Todas las apariciones de <strong>«${esc(el.nombre)}»</strong> pasarán al elemento que elijas y «${esc(el.nombre)}» desaparecerá del inventario.</p>
      <label>Fusionar con<select name="destino">${otros.map(q => opcion(q.id, `${q.nombre} · ${CAT[q.categoria].n}`, destinoId)).join('')}</select></label>`;
    Formulario.abrir('Fusionar elementos', campos, {}, async v => {
      const dest = idx.el.get(v.destino); if (!dest) return 'Elige el elemento de destino.';
      const ops = apsDe(el.id).map(a => ['guardar', 'apariciones', { ...a, elementoId: dest.id }]);
      if (el.tareaId && !dest.tareaId) ops.push(['guardar', 'elementos', { ...dest, tareaId: el.tareaId }]);
      ops.push(['borrar', 'elementos', el.id], ['guardar', 'configuracion', DB.entrada(`Se fusionó «${el.nombre}» con «${dest.nombre}» en el desglose de «${guion().nombre}»`)]);
      await DB.lote(ops);
    }, recargar);
  }

  // G. Comunicación: una necesidad del desglose se convierte en tarea; su estado se sigue en Gestión de tareas
  function formTarea(el) {
    const g = guion(), item = D.inventario(d, ui.gid).find(i => i.el.id === el.id), p = D.propuestaTarea(g, item);
    const personas = d.personas.filter(E.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const campos = `<label>Título de la tarea<input name="titulo" required maxlength="140"></label>
      <label>Descripción<textarea name="descripcion" rows="3"></textarea></label>
      <div class="par"><label>Departamento<select name="departamento">${departamentos().map(q => opcion(q, q, p.departamento)).join('')}</select></label>
      <label>Responsable<select name="resp"><option value="">Sin asignar</option>${personas.map(q => opcion(q.id, q.nombre)).join('')}</select></label></div>
      <div class="par"><label>Prioridad<select name="prioridad">${Object.entries(T.prioridades).map(([k, [n]]) => opcion(k, n, 'media')).join('')}</select></label>
      <label>Fecha límite<input name="vence" type="date"></label></div>
      <p class="nota">Los responsables salen de Equipo y cargos. La tarea queda enlazada a este elemento; su estado se controla en Gestión de tareas.</p>`;
    Formulario.abrir('Crear tarea desde el desglose', campos, { titulo: p.titulo, descripcion: p.descripcion }, async v => {
      const titulo = v.titulo.trim(); if (!titulo) return 'Escribe el título de la tarea.';
      const c = T.nuevoCodigo(d);
      const base = { ...T.vacia(), id: U.id('t'), codigo: c.codigo, titulo, descripcion: v.descripcion.trim(), criterio: p.criterio, etapa: (d.proyecto[0] || {}).etapa || '',
        departamento: v.departamento, resp: v.resp, prioridad: v.prioridad, vence: v.vence, docTipo: 'Guion', docRef: p.docRef, creada: U.hoy(), actualizada: U.hoy() };
      const r = T.registrar(d, null, base);
      await DB.lote([c.op, ['guardar', 'tareas', r.tarea], ['guardar', 'elementos', { ...el, tareaId: r.tarea.id }],
        ['guardar', 'configuracion', DB.entrada(`Se creó la tarea ${c.codigo} «${titulo}» desde el desglose`)]]);
    }, recargar);
  }

  // ---------- F. Revisión, control y versiones ----------
  function revision() {
    const g = guion(), x = dg(), rv = D.revision(d, ui.gid), est = D.estadoGuion(x.escenas);
    const lista = [...d.guiones].sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
    const cuentaEst = k => x.escenas.filter(e => e.estado === k).length;
    $('#revision').innerHTML = `
      <div class="rev-bloque"><h2>Estado del desglose: ${tagEst(est)}</h2>
        <p class="tenue">${Object.keys(D.ESTADOS).map(k => `${D.ESTADOS[k][0]}: ${cuentaEst(k)}`).join(' · ')} · ${plural(rv.sinRevisar, 'aparición sin revisar', 'apariciones sin revisar')}</p>
        <div class="rev-acciones"><button class="btn" data-estado-todas="revision">Pasar todas las escenas a revisión</button><button class="btn primario" data-estado-todas="aprobado">Aprobar el desglose</button></div>
        <label>Observaciones generales del guion<textarea id="rev-notas" rows="3" placeholder="Acuerdos con dirección, dudas pendientes, cambios esperados…">${esc(g.notas || '')}</textarea></label></div>

      <div class="rev-bloque"><h2>Escenas dudosas (${rv.escDudosas.length})</h2>${rv.escDudosas.length ? `<ul class="rev-lista">${rv.escDudosas.map(({ e, motivos }) => `<li><strong>Esc. ${esc(e.numero)}</strong> ${esc(e.locacion || '')} <span class="tenue">${esc(motivos.join(' · '))}</span> <button class="btn mini" data-ficha="${e.id}" style="margin-left:auto">Abrir ficha</button></li>`).join('')}</ul>` : '<p class="tenue" style="padding:8px 0">Ninguna escena con problemas en su encabezado.</p>'}</div>

      <div class="rev-bloque"><h2>Elementos dudosos (${rv.elDudosos.length})</h2>${rv.elDudosos.length ? `<ul class="rev-lista">${rv.elDudosos.map(i => `<li>${catTag(i.el.categoria)} <strong>${esc(i.el.nombre)}</strong> <span class="tenue">${plural(i.dudosas, 'aparición dudosa', 'apariciones dudosas')} · escenas ${esc(i.escenas.map(e => e.numero).join(', '))}</span> <button class="btn mini" data-inv-editar="${i.el.id}" style="margin-left:auto">Editar</button></li>`).join('')}</ul>` : '<p class="tenue" style="padding:8px 0">No quedan elementos dudosos sin revisar.</p>'}</div>

      <div class="rev-bloque"><h2>Posibles duplicados (${rv.duplicados.length})</h2>${rv.duplicados.length ? `<ul class="rev-lista">${rv.duplicados.map(gr => `<li><strong>${esc(gr[0].el.nombre)}</strong> <span class="tenue">aparece como ${esc(gr.map(i => CAT[i.el.categoria].n).join(' y '))}</span> <button class="btn mini" data-inv-fusionar="${gr[0].el.id}" data-destino="${gr[1].el.id}" style="margin-left:auto">Fusionar</button></li>`).join('')}</ul>` : '<p class="tenue" style="padding:8px 0">No se encontraron nombres repetidos entre categorías.</p>'}</div>

      <div class="rev-bloque"><h2>Versiones del guion</h2>
        <div class="tabla-caja"><table><thead><tr><th>Guion</th><th>Versión</th><th>Importado</th><th>Formato</th><th>Estado</th><th></th></tr></thead><tbody>${lista.map(v => {
          const dv = D.delGuion(d, v.id);
          return `<tr><td><strong>${esc(v.nombre)}</strong>${v.id === ui.gid ? ' <span class="etiqueta curso">Abierto</span>' : ''}<br><small class="tenue">${esc(v.archivo || '')}</small></td><td>${esc(v.version)}</td><td>${U.corta(v.fecha)}</td><td>${esc(v.formato)}</td><td>${tagEst(D.estadoGuion(dv.escenas))} <small class="tenue">${plural(dv.escenas.length, 'escena', 'escenas')}</small></td>
            <td class="acc">${v.id !== ui.gid ? `<button class="btn mini" data-abrir-guion="${v.id}">Abrir</button> ` : ''}<button class="btn mini" data-nueva-version="${v.id}">Nueva versión</button> <button class="btn mini peligro" data-borrar-guion="${v.id}">Eliminar</button></td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="nota">Cada importación es una versión aparte: el desglose anterior nunca se sobrescribe. La comparación entre versiones llegará más adelante.</p></div>`;
  }

  async function estadoTodas(estado) {
    const x = dg(); if (!x.escenas.length) return;
    if (estado === 'aprobado') {
      const sin = x.apariciones.filter(a => a.estado === 'auto').length;
      if (!confirm(sin ? `Quedan ${plural(sin, 'aparición', 'apariciones')} sin revisar. ¿Aprobar el desglose de todos modos?` : '¿Aprobar el desglose? Todas las escenas pasarán a «Aprobado».')) return;
    }
    await hacer([...x.escenas.map(e => ['guardar', 'escenas', { ...e, estado }]), ['guardar', 'configuracion', DB.entrada(`El desglose de «${guion().nombre}» (${guion().version}) pasó a «${D.ESTADOS[estado][0]}»`)]]);
  }
  async function borrarGuion(id) {
    const g = d.guiones.find(q => q.id === id); if (!g) return;
    if (!confirm(`¿Eliminar «${g.nombre}» (${g.version}) con todo su desglose? Las tareas ya creadas se conservan. Esta acción no se puede deshacer.`)) return;
    const x = D.delGuion(d, id);
    await hacer([['borrar', 'guiones', id], ...x.escenas.map(e => ['borrar', 'escenas', e.id]), ...x.elementos.map(e => ['borrar', 'elementos', e.id]), ...x.apariciones.map(a => ['borrar', 'apariciones', a.id]),
      ['guardar', 'configuracion', DB.entrada(`Se eliminó el guion «${g.nombre}» (${g.version}) y su desglose`)]]);
  }

  // ---------- A. Importación ----------
  function sugerirVersion(nombre) {
    const nums = d.guiones.filter(g => g.nombre === nombre).map(g => parseInt((g.version.match(/\d+/) || [0])[0], 10));
    return 'v' + (nums.length ? Math.max(...nums) + 1 : 1);
  }
  function importar(base = {}) {
    let lectura = null, leyendo = false;
    const campos = `<label>Archivo del guion (PDF, DOCX o TXT)<input type="file" name="archivo" accept=".pdf,.docx,.txt,.text,.fountain"></label>
      <p id="imp-estado" class="nota" role="status"></p>
      <label>…o pega aquí el texto del guion<textarea name="pegado" rows="4"></textarea></label>
      <div class="par"><label>Nombre del guion<input name="nombre" maxlength="100"></label><label>Versión<input name="version" maxlength="30"></label></div>
      <p class="nota">Cada importación crea una versión nueva: las anteriores y su desglose se conservan. Los PDF escaneados necesitan OCR antes de importarse.</p>`;
    const dlg = Formulario.abrir(base.nombre ? 'Importar nueva versión' : 'Importar guion', campos, { nombre: base.nombre || '', version: base.version || '' }, async (v, f) => {
      if (leyendo) return 'Espera a que termine de leerse el archivo.';
      let l = lectura; const pegado = (v.pegado || '').trim();
      if (!l && f.elements.archivo.files[0]) return 'El archivo no se pudo leer. Revisa el mensaje de arriba o pega el texto.';
      if (!l && pegado) l = Importador.deTexto(pegado);
      if (!l) return 'Elige un archivo o pega el texto del guion.';
      const nombre = (v.nombre || '').trim() || (l.archivo ? l.archivo.replace(/\.[^.]+$/, '') : 'Guion sin título');
      const version = (v.version || '').trim() || sugerirVersion(nombre);
      if (d.guiones.some(q => q.nombre === nombre && q.version === version)) return 'Ya existe esa versión de ese guion. Cambia el nombre o la versión.';
      const g = { id: U.id('gu'), nombre, version, fecha: U.hoy(), creado: new Date().toISOString(), formato: l.formato, archivo: l.archivo || '', texto: l.texto, pag: l.pag, pagEstimadas: l.pagEstimadas, notas: '' };
      const r = D.analizar(g);
      await DB.lote([['guardar', 'guiones', g], ...r.escenas.map(e => ['guardar', 'escenas', e]), ...r.elementos.map(e => ['guardar', 'elementos', e]), ...r.apariciones.map(a => ['guardar', 'apariciones', a]),
        ['guardar', 'configuracion', DB.entrada(`Se importó el guion «${nombre}» (${version}): ${plural(r.escenas.length, 'escena', 'escenas')} y ${plural(r.elementos.length, 'elemento', 'elementos')} detectados`)]]);
      ui.gid = g.id; ui.tab = 'escenas'; pref.guardar(g.id);
      importar.resultado = r;
    }, async () => {
      await recargar(); pestana('escenas');
      const r = importar.resultado; if (r) aviso(r.escenas.length ? '' : 'No se detectaron encabezados de escena (INT./EXT.). Puedes registrar las escenas a mano.');
    });
    dlg.querySelector('.primario').textContent = 'Importar y analizar';
    const estado = (t, mal) => { const p = dlg.querySelector('#imp-estado'); p.textContent = t; p.className = mal ? 'error' : 'nota'; };
    dlg.querySelector('[name=archivo]').addEventListener('change', async ev => {
      const f = ev.target.files[0]; lectura = null; if (!f) return estado('');
      leyendo = true; estado('Leyendo el archivo…');
      try {
        lectura = await Importador.leer(f);
        const n = D.clasificar(lectura.texto).filter(l => l.tipo === 'slug').length;
        estado(`${lectura.formato}: ${plural(lectura.pag.length, 'página', 'páginas')}${lectura.pagEstimadas ? ' (estimadas)' : ''} · ${plural(n, 'escena detectada', 'escenas detectadas')}${n ? '' : '. No se encontraron encabezados INT./EXT.; podrás registrar las escenas a mano'}.`, false);
        const nom = dlg.querySelector('[name=nombre]'); if (!nom.value) { nom.value = f.name.replace(/\.[^.]+$/, ''); }
        const ver = dlg.querySelector('[name=version]'); if (!ver.value) ver.value = sugerirVersion(nom.value.trim());
      } catch (x) { console.warn(x); lectura = null; estado(x.message || 'No se pudo leer el archivo.', true); }
      leyendo = false;
    });
  }

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button'), mk = e.target.closest('mark[data-ap]');
    if (mk && !getSelection().toString()) return abrirAparicion(mk.dataset.ap);
    if (!b) return;
    const ds = b.dataset;
    if (ds.tab) return pestana(ds.tab);
    if ('importar' in ds) return importar();
    if ('nuevaEscena' in ds) return formEscenaNueva();
    if (ds.ficha) return abrirFicha(ds.ficha);
    if (ds.verGuion) return irAEscena(ds.verGuion);
    if (ds.cat) { ui.cats.has(ds.cat) ? ui.cats.delete(ds.cat) : ui.cats.add(ds.cat); return guionTexto(); }
    if (b.id === 'btn-agregar') return formAgregar();
    if (ds.tarea) return formTarea(idx.el.get(ds.tarea));
    if (ds.invEditar) return formElemento(idx.el.get(ds.invEditar));
    if (ds.invFusionar) return formFusionar(idx.el.get(ds.invFusionar), ds.destino);
    if (ds.invConfirmar) return hacer(apsDe(ds.invConfirmar).filter(a => a.estado !== 'descartada').map(a => ['guardar', 'apariciones', { ...a, estado: 'confirmada' }]));
    if (ds.invDescartar) { const el = idx.el.get(ds.invDescartar); if (confirm(`¿Descartar «${el.nombre}» en todo el guion?`)) hacer(apsDe(el.id).map(a => ['guardar', 'apariciones', { ...a, estado: 'descartada' }])); return; }
    if (ds.invRestaurar) return hacer(apsDe(ds.invRestaurar).map(a => ['guardar', 'apariciones', { ...a, estado: a.origen === 'manual' ? 'confirmada' : 'auto' }]));
    if (ds.estadoTodas) return estadoTodas(ds.estadoTodas);
    if (ds.abrirGuion) { ui.gid = ds.abrirGuion; pref.guardar(ui.gid); cacheL = null; return pintar(); }
    if ('nuevaVersion' in ds) { const g = d.guiones.find(q => q.id === ds.nuevaVersion); return importar({ nombre: g.nombre, version: sugerirVersion(g.nombre) }); }
    if (ds.borrarGuion) return borrarGuion(ds.borrarGuion);
  });
  document.addEventListener('mousedown', e => { if (e.target.id !== 'btn-agregar') $('#btn-agregar').hidden = true; });
  $('#guion-texto').addEventListener('mouseup', () => setTimeout(seleccion, 0));
  $('#guion-texto').addEventListener('scroll', () => { $('#btn-agregar').hidden = true; });
  $('#sel-guion').addEventListener('change', e => { ui.gid = e.target.value; pref.guardar(ui.gid); cacheL = null; pintar(); });
  $('#q').addEventListener('input', e => { ui.q = e.target.value; escenas(); });
  $('#f-estado').addEventListener('change', e => { ui.estadoEsc = e.target.value; escenas(); });
  $('#f-descartados').addEventListener('change', e => { ui.descartados = e.target.checked; guionTexto(); });
  $('#ir-escena').addEventListener('change', e => { if (e.target.value) irAEscena(e.target.value); });
  $('#escenas-filas').addEventListener('change', async e => {
    const id = e.target.dataset.estadoEsc, esc = idx.es.get(id); if (!esc) return;
    await hacer([['guardar', 'escenas', { ...esc, estado: e.target.value }]]);
  });
  const mapaInv = { 'i-q': 'q', 'i-cat': 'cat', 'i-esc': 'esc', 'i-depto': 'depto', 'i-estado': 'estado' };
  $('#tab-inventario').addEventListener('input', e => { const k = mapaInv[e.target.id]; if (k) { ui.inv[k] = e.target.value; invTabla(); } });
  $('#i-rep').addEventListener('change', e => { ui.inv.repetidos = e.target.checked; invTabla(); });
  $('#i-desc').addEventListener('change', e => { ui.inv.descartados = e.target.checked; invTabla(); });
  $('#inv-grupos').addEventListener('change', async e => {
    const el = idx.el.get(e.target.dataset.deptoEl); if (el) await hacer([['guardar', 'elementos', { ...el, departamento: e.target.value }]]);
  });
  $('#revision').addEventListener('change', async e => {
    if (e.target.id === 'rev-notas') await hacer([['guardar', 'guiones', { ...guion(), notas: e.target.value.trim() }]]);
  });

  // ---------- Arranque ----------
  try { await DB.iniciar(); await recargar(); Lateral.proyecto(d.proyecto[0]); }
  catch (x) {
    console.warn('Base local no disponible:', x);
    d = { ...SEMILLAS, guiones: [], escenas: [], elementos: [], apariciones: [] };
    Lateral.proyecto(d.proyecto[0]);
    $('#aviso').innerHTML = '<p class="aviso-datos">No se pudo abrir la base local. No se podrá guardar el desglose.</p>';
    pintar();
  }
})();
