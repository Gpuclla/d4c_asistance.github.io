/* Reglas del desglose de guion. Las usan el módulo Desglose de guion y el panel.
   Qué se guarda (todo en IndexedDB):
   · guiones      – cada versión importada, con su texto. Importar una versión nueva NUNCA sobrescribe otra.
   · escenas      – una ficha por escena (número, locación, momento, páginas, estado de revisión…) y su tramo de texto [ini, fin).
   · elementos    – UN registro por elemento (p. ej. «Taza») reutilizado por todas las escenas donde aparece.
   · apariciones  – cada vez que un elemento aparece: escena, tramo de texto y si está sin revisar, confirmada o descartada.
   El estado de un elemento y el del guion no se guardan: se deducen de sus apariciones y de sus escenas.
   Las tareas que nacen del desglose solo guardan su vínculo (elemento.tareaId); su estado se lee de Gestión de tareas. */
const Desglose = (() => {
  const U = Utils;

  const CATEGORIAS = {
    personaje: { n: 'Personajes y extras', dep: 'Dirección' },
    locacion: { n: 'Locaciones', dep: 'Producción' },
    utileria: { n: 'Utilería y decoración', dep: 'Arte' },
    vestuario: { n: 'Vestuario, maquillaje y peluquería', dep: 'Arte' },
    vehiculo: { n: 'Vehículos y animales', dep: 'Producción' },
    sonido: { n: 'Sonido y música', dep: 'Sonido' },
    efectos: { n: 'Efectos especiales y visuales', dep: 'Arte' },
    tecnico: { n: 'Necesidades técnicas y logísticas', dep: 'Fotografía' }
  };
  const ESTADOS = { pendiente: ['Pendiente', 'pendiente'], analisis: ['En análisis', 'curso'], revision: ['En revisión', 'provisional'], aprobado: ['Aprobado', 'confirmada'] };
  const ESTADOS_EL = { confirmado: ['Confirmado', 'confirmada'], parcial: ['Parcial', 'provisional'], sin_revisar: ['Sin revisar', 'pendiente'], descartado: ['Descartado', 'baja'] };
  const MOMENTOS = ['Día', 'Noche', 'Amanecer', 'Atardecer', 'Anochecer', 'Tarde', 'Mañana', 'Madrugada', 'Mediodía', 'Continuo'];

  // ---------- Texto ----------
  // Quita tildes y pasa a minúsculas SIN cambiar la longitud: así las posiciones del texto plano valen para el original
  const MAPA = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ü': 'u' };
  const plano = s => String(s).replace(/[áéíóúüÁÉÍÓÚÜ]/g, c => MAPA[c]).toLowerCase();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PEQ = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'al', 'con', 'sin', 'un', 'una']);
  const titulo = s => String(s).toLowerCase().replace(/\S+/g, (w, i) => i > 0 && PEQ.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).trim();
  const primeraMay = s => s.charAt(0).toUpperCase() + s.slice(1);
  const mayus = s => /[A-ZÁÉÍÓÚÑÜ]/.test(s) && s === s.toUpperCase();

  // ---------- Diccionario de palabras clave ----------
  // «canónico/otra forma» · el plural se reconoce solo (+s, +es) · «?» marca palabras con varios sentidos (siempre quedan «dudosas»)
  const DICC = {
    extra: ['extras', 'multitud', 'gente', 'público/publico', 'clientes', 'transeúntes', 'pasajeros', 'invitados', 'asistentes', 'alumnos', 'estudiantes', 'policía/policia', 'soldados', 'mesero', 'camarero', 'vecinos', 'turistas', 'espectadores', 'obreros', 'vendedores'],
    utileria: ['taza', 'vaso', 'copa', 'botella', 'plato', 'tenedor', 'cuchillo', 'cuchara', 'sartén/sarten', 'olla', 'cafetera', 'café/cafe', 'cerveza', 'vino?', 'comida', 'pan', 'mesa', 'silla', 'sillón/sillon', 'sofá/sofa', 'cama', 'almohada', 'sábana/sabana', 'lámpara/lampara', 'cuadro?', 'cortina', 'espejo', 'alfombra', 'escritorio', 'estante', 'estantería/estanteria', 'televisor', 'televisión/television', 'refrigerador/nevera', 'teléfono/telefono', 'celular', 'móvil/movil', 'llave?', 'carta', 'libro', 'cuaderno', 'libreta', 'periódico/periodico', 'revista', 'documento', 'foto/fotografía/fotografia', 'retrato', 'maleta', 'mochila', 'bolso', 'cartera', 'billetera', 'dinero', 'billete', 'moneda', 'cigarro/cigarrillo', 'encendedor', 'fósforo/fosforo', 'pistola', 'revólver/revolver', 'arma', 'navaja', 'linterna', 'paraguas', 'reloj', 'anillo', 'radio', 'computadora/computador/laptop/ordenador', 'tablet', 'caja', 'bolsa', 'paquete', 'herramienta', 'martillo', 'pala', 'escoba', 'balde', 'cuerda', 'flor', 'ramo', 'regalo', 'pastel', 'vela?', 'muñeca/muneca', 'juguete', 'peluche'],
    vestuario: ['vestido', 'traje', 'camisa', 'camiseta', 'blusa', 'pantalón/pantalon', 'jean', 'falda', 'chaqueta', 'chompa', 'casaca', 'abrigo', 'saco?', 'sombrero', 'gorra', 'gorro', 'zapato', 'zapatilla', 'bota?', 'tacón/tacon', 'sandalia', 'uniforme', 'delantal', 'bata', 'pijama', 'corbata', 'guante', 'bufanda', 'pañuelo/panuelo', 'lentes', 'gafas', 'collar', 'pulsera', 'arete', 'peluca', 'maquillaje', 'peinado', 'barba', 'bigote', 'tatuaje', 'cicatriz', 'herida', 'moretón/moreton', 'ojera', 'disfraz', 'máscara/mascara'],
    vehiculo: ['auto', 'carro', 'coche?', 'camioneta', 'moto', 'motocicleta', 'bicicleta', 'bici', 'bus', 'autobús/autobus', 'micro?', 'taxi', 'camión/camion', 'furgoneta', 'tren', 'avión/avion', 'barco', 'bote', 'lancha', 'patrulla', 'ambulancia', 'combi', 'mototaxi', 'perro/perra', 'gato/gata', 'caballo/yegua', 'pájaro/pajaro', 'ave?', 'paloma', 'gallina', 'gallo?', 'vaca', 'toro?', 'cerdo/chancho', 'oveja', 'cabra', 'loro', 'rata?', 'ratón/raton?', 'serpiente/culebra', 'pez', 'mono', 'burro', 'conejo', 'cuy', 'araña/arana', 'abeja'],
    sonido: ['música/musica', 'canción/cancion', 'melodía/melodia', 'sonido', 'ruido', 'grito', 'timbre', 'campana', 'sirena', 'trueno', 'silencio', 'eco', 'voz en off', 'narración/narracion', 'tararea', 'canta', 'guitarra', 'piano', 'violín/violin', 'tambor', 'aplauso', 'risa', 'carcajada', 'ladrido', 'murmullo', 'alarma', 'claxon/bocina', 'susurro', 'llanto', 'sollozo', 'golpe?', 'portazo', 'suena'],
    efectos: ['explosión/explosion/explota/explotan', 'humo', 'fuego', 'llamas', 'incendio', 'sangre', 'lluvia', 'tormenta', 'relámpago/relampago', 'niebla', 'nieve', 'viento', 'polvo', 'chispa', 'disparo/balazo', 'vidrio roto', 'estalla', 'fantasma', 'levita', 'desaparece', 'se transforma', 'pantalla verde', 'vfx', 'cgi', 'efecto especial', 'destello', 'resplandor', 'ceniza', 'fuegos artificiales', 'pirotecnia'],
    tecnico: ['dron', 'grúa/grua', 'travelling', 'plano secuencia', 'cámara lenta/camara lenta', 'steadicam', 'cámara en mano/camara en mano', 'toma aérea/toma aerea', 'time lapse/timelapse', 'chroma', 'doble', 'especialista', 'coreografía/coreografia', 'pelea', 'caída/caida', 'salto', 'persecución/persecucion', 'acrobacia', 'niño/nino', 'niña/nina', 'bebé/bebe', 'menor de edad', 'tráfico/trafico', 'piscina', 'mar', 'playa', 'río/rio', 'lago', 'azotea', 'escalera', 'precipicio', 'altura', 'permiso']
  };
  const ENTRADAS = [];
  Object.entries(DICC).forEach(([clave, lista]) => lista.forEach(raw => {
    const formas = raw.replace(/\?$/, '').split('/');
    ENTRADAS.push({ cat: clave === 'extra' ? 'personaje' : clave, extra: clave === 'extra', nombre: primeraMay(formas[0]), amb: raw.endsWith('?'), formas: formas.map(plano) });
  }));
  // Las frases largas van primero: «cámara lenta» gana a «cámara»
  ENTRADAS.sort((a, b) => Math.max(...b.formas.map(f => f.length)) - Math.max(...a.formas.map(f => f.length)));
  const RE_DICC = new RegExp('(?<![a-zñ0-9])(?:' + ENTRADAS.map(e => '(' + e.formas.map(f => reEsc(f).replace(/ /g, '\\s+') + '(?:s|es)?').join('|') + ')').join('|') + ')(?![a-zñ0-9])', 'g');

  function buscar(tp, base) {
    RE_DICC.lastIndex = 0;
    const r = []; let m;
    while ((m = RE_DICC.exec(tp))) {
      const e = ENTRADAS[m.findIndex((g, i) => i > 0 && g !== undefined) - 1];
      r.push({ ini: base + m.index, fin: base + m.index + m[0].length, cat: e.cat, nombre: e.nombre, extra: e.extra, amb: e.amb });
      if (!m[0].length) RE_DICC.lastIndex++;
    }
    return r;
  }

  // ---------- Estructura del guion ----------
  const RE_SLUG = /^\s*(?:(?:ESC(?:ENA)?|Esc(?:ena)?)\.?\s*)?(\d{1,4}[A-Z]?)?\s*[.)\-–—:]*\s*(INT\s*\.?\s*\/\s*EXT\.?|EXT\s*\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INTERIOR|EXTERIOR|INT|EXT)(?![A-Za-zÁÉÍÓÚÑáéíóúñ])\.?\s*[.\-–—:]*\s*(.*)$/;
  const MOM = 'DÍA|DIA|NOCHE|AMANECER|ATARDECER|ANOCHECER|TARDE|MAÑANA|MADRUGADA|MEDIODÍA|MEDIODIA|CREPÚSCULO|CREPUSCULO|ANOCHE|CONTINUA|CONTINUO|CONTINUACIÓN|MOMENTOS DESPUÉS|MÁS TARDE|SIMULTÁNEO|FLASHBACK|DÍA\\/NOCHE';
  const RE_MOM = new RegExp('^(.*?)(?:\\s*[-–—.,/:]+\\s*|\\s+)(' + MOM + ')(?:\\s*\\([^)]*\\))?\\s*$', 'i');

  function parseSlug(linea) {
    const m = RE_SLUG.exec(linea);
    if (!m || linea.trim().length > 110) return null;
    const kw = m[2].replace(/[\s.]/g, '').toUpperCase();
    const ie = /^(INT\/EXT|EXT\/INT|I\/E)$/.test(kw) ? 'INT/EXT' : kw.startsWith('INT') ? 'INT' : 'EXT';
    let resto = m[3].replace(/\s*\((?:CONT|CONT'D|CONT\.)\.?\)\s*$/i, '').trim(), numero = m[1] || '';
    const fin = /^(.*?)[\s\-–—.]+(\d{1,4}[A-Z]?)$/.exec(resto);
    if (fin && RE_MOM.test(fin[1])) { resto = fin[1]; numero = numero || fin[2]; }
    const mm = RE_MOM.exec(resto);
    let locacion = (mm ? mm[1] : resto).replace(/[\s\-–—.,:/]+$/, '').trim();
    const momento = mm ? mm[2] : '';
    return { numero, ie, locacion, momento: momento ? titulo(momento) : '', real: m[0].length };
  }

  const TRANSICION = /^(?:CORTE|FUNDIDO|DISOLVENCIA|SALTO A|FADE|CUT|SMASH|ENCADENADO|FIN\b|CONTINUARÁ)/;
  const NO_PERSONAJE = /^(?:TODOS|TODAS|AMBOS|AMBAS|VOZ|VOCES|NOTA|TÍTULO|TITULO|FIN|SUPER|INSERT)$/;

  function clasificar(texto) {
    const L = []; let i = 0;
    while (i <= texto.length) { let j = texto.indexOf('\n', i); if (j < 0) j = texto.length; L.push({ ini: i, fin: j, t: texto.slice(i, j) }); i = j + 1; }
    let dialogo = 0;
    L.forEach((l, k) => {
      const s = l.t.replace(/\f/g, '').trim();
      if (!s) { l.tipo = 'vacia'; dialogo = 0; return; }
      const sl = parseSlug(l.t);
      if (sl) { l.tipo = 'slug'; l.slug = sl; dialogo = 0; return; }
      if (mayus(s) && (/:$/.test(s) || TRANSICION.test(s))) { l.tipo = 'transicion'; dialogo = 0; return; }
      const sinParen = s.replace(/\(.*?\)/g, '').trim(), sig = L[k + 1];
      if (sinParen && mayus(sinParen) && sinParen.length <= 38 && !/[.]$/.test(sinParen) && !NO_PERSONAJE.test(sinParen) && sig && sig.t.trim() && !parseSlug(sig.t)) {
        l.tipo = 'cue'; l.nombre = sinParen.replace(/[:]+$/, '').trim(); dialogo = 8; return;
      }
      if (dialogo > 0 && /^\(.*\)$/.test(s)) { l.tipo = 'paren'; return; }
      if (dialogo > 0) { l.tipo = 'dialogo'; dialogo--; return; }
      l.tipo = 'accion';
    });
    return L;
  }

  // ---------- Páginas ----------
  const paginaDe = (pag, off) => { let lo = 0, hi = pag.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (pag[m] <= off) { r = m; lo = m + 1; } else hi = m - 1; } return r + 1; };
  function paginasTxt(g, ini, fin) {
    if (!g.pag || !g.pag.length || ini == null) return '';
    const a = paginaDe(g.pag, ini), b = paginaDe(g.pag, Math.max(ini, fin - 1));
    return (g.pagEstimadas ? '~' : '') + (a === b ? a : `${a}-${b}`);
  }

  // ---------- Análisis automático ----------
  // Devuelve las escenas, los elementos (únicos) y las apariciones detectadas. No guarda nada.
  function analizar(guion) {
    const texto = guion.texto, L = clasificar(texto), gid = guion.id;
    let n = 0; const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    const nid = p => `${p}${base}${(n++).toString(36)}`;

    const idx = L.map((l, i) => l.tipo === 'slug' ? i : -1).filter(i => i >= 0);
    const escenas = idx.map((i, k) => ({
      id: nid('es'), guionId: gid, orden: k + 1, numero: L[i].slug.numero || String(k + 1), ie: L[i].slug.ie, locacion: titulo(L[i].slug.locacion), momento: L[i].slug.momento,
      ini: L[i].ini, fin: k + 1 < idx.length ? L[idx[k + 1]].ini : texto.length, paginas: '', resumen: '', observaciones: '', estado: 'analisis', _l: i, _fl: k + 1 < idx.length ? idx[k + 1] : L.length
    }));
    escenas.forEach(e => { e.paginas = paginasTxt(guion, e.ini, e.fin); });

    // Personajes: nombres que aparecen como cue de diálogo o presentados con su edad, p. ej. «ANA (30)»
    const nombres = new Map();
    const alta = (nombre, ini) => { const k = plano(nombre).replace(/\s+/g, ' '); if (!nombres.has(k)) nombres.set(k, { nombre: titulo(nombre) }); };
    escenas.forEach(e => { for (let i = e._l + 1; i < e._fl; i++) {
      const l = L[i];
      if (l.tipo === 'cue') alta(l.nombre);
      if (l.tipo === 'accion') for (const m of l.t.matchAll(/\b([A-ZÁÉÍÓÚÑÜ]{3,}(?:\s+[A-ZÁÉÍÓÚÑÜ]{2,}){0,2})\s*\((\d{1,3}|[^)]{1,20})\)/g)) if (!NO_PERSONAJE.test(m[1]) && !/^(?:INT|EXT)/.test(m[1])) alta(m[1]);
    } });
    const claves = [...nombres.keys()].sort((a, b) => b.length - a.length);
    const RE_PERS = claves.length ? new RegExp('(?<![a-zñ0-9])(?:' + claves.map(k => reEsc(k).replace(/ /g, '\\s+')).join('|') + ')(?![a-zñ0-9])', 'g') : null;

    const elementos = new Map(), apariciones = [];
    const elemento = (cat, nombre, extra) => {
      const k = cat + '|' + plano(nombre).replace(/\s+/g, ' ');
      if (!elementos.has(k)) elementos.set(k, { id: nid('el'), guionId: gid, categoria: cat, nombre, departamento: CATEGORIAS[cat].dep, notas: '', tareaId: '', ...(extra ? { extra: true } : {}) });
      return elementos.get(k);
    };
    const aparece = (e, el, ini, fin, amb) => apariciones.push({ id: nid('ap'), guionId: gid, escenaId: e.id, elementoId: el.id, ini, fin, texto: texto.slice(ini, fin), estado: 'auto', origen: 'auto', dudosa: !!amb });

    escenas.forEach(e => {
      const sl = L[e._l], loc = e.locacion || '';
      if (loc) {
        const p = plano(sl.t).indexOf(plano(loc).replace(/\s+/g, ' ')); // la locación tal como está escrita en el encabezado
        const raw = parseSlug(sl.t).locacion, q = plano(sl.t).indexOf(plano(raw));
        const a = sl.ini + (q >= 0 ? q : Math.max(p, 0));
        aparece(e, elemento('locacion', loc), a, a + (q >= 0 ? raw.length : loc.length));
      }
      for (let i = e._l + 1; i < e._fl; i++) {
        const l = L[i], enDialogo = l.tipo === 'dialogo' || l.tipo === 'paren';
        if (!['accion', 'dialogo', 'paren', 'cue'].includes(l.tipo)) continue;
        const tp = plano(l.t), ms = [];
        if (l.tipo !== 'cue') buscar(tp, l.ini).forEach(m => ms.push({ ...m, amb: m.amb || enDialogo }));
        if (RE_PERS && (l.tipo === 'cue' || l.tipo === 'accion')) { RE_PERS.lastIndex = 0; let m; while ((m = RE_PERS.exec(tp))) { ms.push({ ini: l.ini + m.index, fin: l.ini + m.index + m[0].length, cat: 'personaje', pers: nombres.get(m[0].replace(/\s+/g, ' ')).nombre }); if (l.tipo === 'cue') break; } }
        ms.sort((a, b) => a.ini - b.ini || (b.fin - b.ini) - (a.fin - a.ini) || (b.pers ? 1 : 0) - (a.pers ? 1 : 0)); // ante un empate gana el personaje
        let corte = -1;
        ms.forEach(m => { if (m.ini < corte) return; corte = m.fin; aparece(e, elemento(m.cat, m.pers || m.nombre, m.extra), m.ini, m.fin, m.amb); });
      }
      // Resumen automático: las primeras líneas de acción
      const acc = []; for (let i = e._l + 1; i < e._fl && acc.join(' ').length < 160; i++) if (L[i].tipo === 'accion') acc.push(L[i].t.trim());
      e.resumen = acc.join(' ').slice(0, 220);
      delete e._l; delete e._fl;
    });
    return { escenas, elementos: [...elementos.values()], apariciones };
  }

  // ---------- Estados deducidos ----------
  function estadoElemento(aps) {
    const vivas = aps.filter(a => a.estado !== 'descartada');
    if (!vivas.length) return 'descartado';
    const c = vivas.filter(a => a.estado === 'confirmada').length;
    return c === vivas.length ? 'confirmado' : c ? 'parcial' : 'sin_revisar';
  }
  function estadoGuion(escenas) {
    if (!escenas.length) return 'pendiente';
    return Object.keys(ESTADOS)[Math.min(...escenas.map(e => Object.keys(ESTADOS).indexOf(e.estado)))];
  }
  const delGuion = (d, gid) => ({
    escenas: d.escenas.filter(e => e.guionId === gid).sort((a, b) => a.orden - b.orden),
    elementos: d.elementos.filter(e => e.guionId === gid),
    apariciones: d.apariciones.filter(a => a.guionId === gid)
  });

  // Inventario: un registro por elemento, con sus escenas y su estado
  function inventario(d, gid) {
    const { escenas, elementos, apariciones } = delGuion(d, gid);
    const pos = new Map(escenas.map((e, i) => [e.id, i]));
    const porEl = new Map();
    apariciones.forEach(a => { if (!porEl.has(a.elementoId)) porEl.set(a.elementoId, []); porEl.get(a.elementoId).push(a); });
    return elementos.map(el => {
      const aps = porEl.get(el.id) || [];
      const vivas = aps.filter(a => a.estado !== 'descartada');
      const ids = [...new Set(vivas.map(a => a.escenaId))].filter(i => pos.has(i)).sort((a, b) => pos.get(a) - pos.get(b));
      return { el, aps, vivas, escenas: ids.map(i => escenas[pos.get(i)]), repetido: ids.length > 1, estado: estadoElemento(aps), dudosas: vivas.filter(a => a.estado === 'auto' && a.dudosa).length };
    });
  }

  // Lo que hay que mirar antes de usar el desglose en producción
  function revision(d, gid) {
    const { escenas, apariciones } = delGuion(d, gid), inv = inventario(d, gid);
    const veces = {}; escenas.forEach(e => { veces[e.numero] = (veces[e.numero] || 0) + 1; });
    const escDudosas = escenas.map(e => {
      const m = [];
      if (!e.locacion) m.push('sin locación'); if (!e.momento) m.push('sin momento del día'); if (!e.ie) m.push('sin interior/exterior');
      if (veces[e.numero] > 1) m.push('número repetido');
      if (e.ini != null && !apariciones.some(a => a.escenaId === e.id && a.estado !== 'descartada')) m.push('sin elementos');
      return { e, motivos: m };
    }).filter(x => x.motivos.length);
    const porNombre = new Map();
    inv.filter(x => x.estado !== 'descartado').forEach(x => { const k = plano(x.el.nombre).replace(/\s+/g, ' '); porNombre.set(k, [...(porNombre.get(k) || []), x]); });
    return {
      escDudosas,
      elDudosos: inv.filter(x => x.estado !== 'descartado' && x.dudosas > 0),
      duplicados: [...porNombre.values()].filter(g => g.length > 1),
      sinRevisar: apariciones.filter(a => a.estado === 'auto').length
    };
  }

  // ---------- Tareas que nacen del desglose ----------
  const VERBO = { personaje: 'Confirmar reparto', locacion: 'Confirmar locación', utileria: 'Conseguir utilería', vestuario: 'Preparar vestuario y maquillaje', vehiculo: 'Gestionar vehículo o animal', sonido: 'Resolver sonido y música', efectos: 'Planificar efecto', tecnico: 'Resolver necesidad técnica' };
  function propuestaTarea(guion, item) {
    const lista = item.escenas.map(e => e.numero).join(', ');
    return {
      titulo: `${item.el.extra ? 'Reunir extras' : VERBO[item.el.categoria]}: ${item.el.nombre}`.slice(0, 140),
      descripcion: `Necesidad detectada en el desglose de «${guion.nombre}» (${guion.version}). Aparece en ${item.escenas.length === 1 ? 'la escena' : 'las escenas'} ${lista || '—'}.`,
      criterio: `«${item.el.nombre}» resuelto y confirmado para ${item.escenas.length === 1 ? 'la escena' : 'las escenas'} ${lista || '—'}.`,
      departamento: item.el.departamento || CATEGORIAS[item.el.categoria].dep,
      docRef: `${guion.nombre} ${guion.version} · esc. ${lista}`.slice(0, 120)
    };
  }

  // Para otros módulos (Cronograma): escenas con sus necesidades
  function escenasConNecesidades(d, gid) {
    const inv = inventario(d, gid).filter(x => x.estado !== 'descartado');
    return delGuion(d, gid).escenas.map(e => ({ escena: e, elementos: inv.filter(x => x.escenas.some(s => s.id === e.id)) }));
  }

  function resumen(d) {
    const g = [...d.guiones].sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))[0];
    if (!g) return null;
    const dg = delGuion(d, g.id);
    return { guion: g, escenas: dg.escenas.length, elementos: inventario(d, g.id).filter(x => x.estado !== 'descartado').length, sinRevisar: dg.apariciones.filter(a => a.estado === 'auto').length, estado: estadoGuion(dg.escenas) };
  }

  return { CATEGORIAS, ESTADOS, ESTADOS_EL, MOMENTOS, plano, titulo, parseSlug, clasificar, analizar, paginasTxt, estadoElemento, estadoGuion, delGuion, inventario, revision, propuestaTarea, escenasConNecesidades, resumen };
})();
