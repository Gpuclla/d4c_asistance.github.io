/* Capa de datos. La interfaz solo usa DB.*; si cambia el almacenamiento, solo cambia este archivo.
   Los datos se guardan en IndexedDB, la base de datos local del navegador: no necesitan internet ni servidor. */
const DB = (() => {
  const NOMBRE = 'asistencia-direccion', VERSION = 3;
  const TABLAS = ['proyecto', 'personas', 'cargos', 'asignaciones', 'tareas', 'cronograma', 'etapas', 'configuracion', 'guiones', 'escenas', 'elementos', 'apariciones'];
  let bd, abierta;

  const abrir = () => new Promise((ok, fallo) => {
    if (!window.indexedDB) return fallo(new Error('Este navegador no ofrece base de datos local.'));
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const b = r.result;
      TABLAS.forEach(t => { if (!b.objectStoreNames.contains(t)) b.createObjectStore(t, { keyPath: 'id' }); });
      if (b.objectStoreNames.contains('equipo')) b.deleteObjectStore('equipo'); // reemplazada por personas/cargos/asignaciones
    };
    r.onsuccess = () => {
      bd = r.result;
      bd.onversionchange = () => { bd.close(); bd = null; }; // otra pestaña actualiza la base: no la bloqueamos
      ok();
    };
    r.onerror = () => fallo(r.error);
  });

  const pedir = (tabla, modo, fn) => new Promise((ok, fallo) => {
    if (!bd) return fallo(new Error('La base local no está abierta.'));
    const r = fn(bd.transaction(tabla, modo).objectStore(tabla));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fallo(r.error);
  });

  const todos = tabla => pedir(tabla, 'readonly', o => o.getAll());
  const guardar = (tabla, item) => pedir(tabla, 'readwrite', o => o.put(item));
  const eliminar = (tabla, id) => pedir(tabla, 'readwrite', o => o.delete(id));

  // Varias escrituras en UNA transacción: o se guardan todas o no se guarda ninguna.
  // Operaciones: ['guardar', tabla, item] · ['borrar', tabla, id] · ['vaciar', tabla]
  const lote = ops => new Promise((ok, fallo) => {
    if (!bd) return fallo(new Error('La base local no está abierta.'));
    if (!ops.length) return ok();
    const tx = bd.transaction([...new Set(ops.map(o => o[1]))], 'readwrite');
    ops.forEach(([tipo, tabla, x]) => {
      const o = tx.objectStore(tabla);
      if (tipo === 'guardar') o.put(x); else if (tipo === 'borrar') o.delete(x); else o.clear();
    });
    tx.oncomplete = () => ok();
    tx.onabort = tx.onerror = e => fallo((e.target && e.target.error) || tx.error);
  });

  // Cada cambio importante queda en el historial (módulo Configuración y registros)
  const entrada = texto => ({ id: Utils.id('h'), tipo: 'historial', fecha: Utils.hoy(), ts: Date.now(), texto });
  const registrar = texto => guardar('configuracion', entrada(texto));
  const meta = () => ({ id: 'meta', tipo: 'meta', sembradas: [...TABLAS] });

  // Siembra cada tabla una sola vez (en una sola transacción); una tabla vacía por borrado no se vuelve a llenar
  async function sembrar() {
    const actual = (await pedir('configuracion', 'readonly', o => o.get('meta'))) || { id: 'meta', tipo: 'meta', sembradas: [] };
    const ops = [];
    for (const t of TABLAS) {
      if (actual.sembradas.includes(t)) continue;
      (SEMILLAS[t] || []).forEach(it => ops.push(['guardar', t, it]));
      actual.sembradas.push(t);
    }
    ops.push(['guardar', 'configuracion', actual]);
    await lote(ops);
  }

  // Idempotente: se puede llamar desde varios archivos y abre la base una sola vez
  const iniciar = () => abierta || (abierta = (async () => {
    await abrir();
    await sembrar();
    // Corrección de datos: la etapa de rodaje se llamaba «Producción», igual que un departamento
    const e = (await todos('etapas')).find(x => x.id === 'produccion' && x.nombre === 'Producción');
    if (e) await guardar('etapas', { ...e, nombre: 'Rodaje' });
    // Pide al navegador que no borre estos datos automáticamente cuando falte espacio
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  })());

  async function cargarTodo() {
    const listas = await Promise.all(TABLAS.map(todos));
    return Object.fromEntries(TABLAS.map((t, i) => [t, listas[i]]));
  }

  // ---------- Copias de seguridad ----------
  async function exportar() {
    return { app: NOMBRE, version: VERSION, exportado: new Date().toISOString(), tablas: await cargarTodo() };
  }

  function validar(c) {
    if (!c || c.app !== NOMBRE || !c.tablas || typeof c.tablas !== 'object') return 'El archivo no es una copia de Asistencia de dirección.';
    for (const t of TABLAS) {
      const lista = c.tablas[t];
      if (lista === undefined) continue;
      if (!Array.isArray(lista) || lista.some(x => !x || typeof x !== 'object' || typeof x.id !== 'string')) return `La copia está dañada (tabla «${t}»).`;
    }
    return '';
  }

  // Reemplaza TODOS los datos actuales por los de la copia, en una sola transacción
  async function importar(c) {
    const err = validar(c);
    if (err) throw new Error(err);
    const ops = [];
    for (const t of TABLAS) {
      ops.push(['vaciar', t]);
      (c.tablas[t] || []).filter(it => !(t === 'configuracion' && it.id === 'meta')).forEach(it => ops.push(['guardar', t, it]));
    }
    ops.push(['guardar', 'configuracion', meta()], ['guardar', 'configuracion', entrada('Se restauró una copia de seguridad')]);
    await lote(ops);
  }

  // Empieza un proyecto en limpio: conserva el catálogo de cargos y las etapas (en 0 %)
  async function reiniciar() {
    const ops = ['proyecto', 'personas', 'asignaciones', 'tareas', 'cronograma', 'etapas', 'configuracion', 'guiones', 'escenas', 'elementos', 'apariciones'].map(t => ['vaciar', t]);
    ops.push(['guardar', 'proyecto', { id: 'proyecto', titulo: 'Mi cortometraje', direccion: '', produccion: '', inicioRodaje: '', etapa: 'desarrollo' }]);
    SEMILLAS.etapas.forEach(e => ops.push(['guardar', 'etapas', { ...e, avance: 0 }]));
    ops.push(['guardar', 'configuracion', meta()], ['guardar', 'configuracion', entrada('Se inició un proyecto en limpio')]);
    await lote(ops);
  }

  return { iniciar, cargarTodo, todos, guardar, eliminar, lote, entrada, registrar, exportar, importar, validar, reiniciar, listo: () => !!bd };
})();
