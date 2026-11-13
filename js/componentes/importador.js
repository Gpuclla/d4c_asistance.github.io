/* Lee un guion (TXT, DOCX o PDF) y devuelve su texto limpio con las posiciones de página.
   TXT y DOCX se leen sin librerías. El PDF usa PDF.js (assets/vendor/pdfjs); funciona también abriendo la app con doble clic.
   Un PDF escaneado no tiene texto: hace falta pasarlo antes por OCR. */
const Importador = (() => {
  const LINEAS_POR_PAGINA = 55;

  // ---------- Texto común ----------
  // Une las páginas, limpia el texto y calcula dónde empieza cada una (reales si el archivo las trae; si no, estimadas)
  function armar(paginas, formato, avisos = [], reales = true) {
    const limpia = s => s.replace(/\r\n?/g, '\n').normalize('NFC').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/\u00a0/g, ' ').replace(/[\u0000-\u0008\u000b\u000e-\u001f\u200b\ufeff]/g, '');
    let pags = paginas.map(limpia);
    let pagEstimadas = !reales || pags.length <= 1;
    if (pagEstimadas) { // una sola «página» larga: se parte cada 55 líneas, como un guion en formato estándar
      const lineas = pags.join('\n').split('\n');
      pags = []; for (let i = 0; i < lineas.length; i += LINEAS_POR_PAGINA) pags.push(lineas.slice(i, i + LINEAS_POR_PAGINA).join('\n'));
      if (!pags.length) pags = [''];
    }
    const pag = []; let texto = '';
    pags.forEach((p, i) => { pag.push(texto.length + (i ? 1 : 0)); texto += (i ? '\n' : '') + p; });
    return { texto: texto.replace(/\s+$/, ''), pag, pagEstimadas, formato, avisos };
  }

  // ---------- TXT ----------
  async function txt(buf) {
    let s;
    try { s = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { s = new TextDecoder('windows-1252').decode(buf); }
    s = s.replace(/^\ufeff/, '');
    const paginas = s.split('\f'); // el salto de página de un .txt, si lo trae
    return armar(paginas, 'TXT', [], paginas.length > 1);
  }

  // ---------- DOCX (un zip con word/document.xml) ----------
  async function inflar(datos) {
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  async function entradaZip(buf, nombre) {
    const v = new DataView(buf), b = new Uint8Array(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('El archivo no es un DOCX válido.');
    let p = v.getUint32(e + 16, true);
    const total = v.getUint16(e + 10, true);
    for (let k = 0; k < total; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true), comp = v.getUint32(p + 20, true), n = v.getUint16(p + 28, true), m = v.getUint16(p + 30, true), c = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const nom = new TextDecoder().decode(b.subarray(p + 46, p + 46 + n));
      if (nom === nombre) {
        const ln = v.getUint16(off + 26, true), lm = v.getUint16(off + 28, true), ini = off + 30 + ln + lm;
        const datos = b.subarray(ini, ini + comp);
        return metodo === 0 ? datos : inflar(datos);
      }
      p += 46 + n + m + c;
    }
    throw new Error('El DOCX no contiene texto (falta word/document.xml).');
  }
  async function docx(buf) {
    const xml = new TextDecoder().decode(await entradaZip(buf, 'word/document.xml'));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('No se pudo leer el contenido del DOCX.');
    let saltos = 0;
    const texto = n => {
      let s = '';
      n.childNodes.forEach(h => {
        if (h.nodeType !== 1) return;
        const t = h.localName;
        if (t === 't') s += h.textContent;
        else if (t === 'tab') s += '    ';
        else if (t === 'br') { if (h.getAttribute('w:type') === 'page') { s += '\f'; saltos++; } else s += '\n'; }
        else if (t === 'lastRenderedPageBreak') { s += '\f'; saltos++; }
        else if (t === 'cr') s += '\n';
        else if (t !== 'instrText' && t !== 'del' && t !== 'delText') s += texto(h);
      });
      return s;
    };
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const ps = [...doc.getElementsByTagNameNS(W, 'p')];
    // «Salto de página antes» es un formato del párrafo (no un carácter): también cuenta como página nueva
    let t = ps.map(p => (p.getElementsByTagNameNS(W, 'pageBreakBefore').length ? (saltos++, '\f') : '') + texto(p)).join('\n');
    const paginas = t.split('\f').filter((p, i, a) => p.trim() || i === a.length - 1);
    return armar(paginas, 'DOCX', [], saltos > 0);
  }

  // ---------- PDF ----------
  let pdfjs;
  const cargarScript = src => new Promise((ok, fallo) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fallo(new Error('No se pudo cargar ' + src));
    document.head.append(s);
  });
  // PDF.js se carga como script clásico y trabaja en la página (sin hilo aparte): así funciona igual abriendo con doble clic o con servidor
  async function cargarPdfjs() {
    if (pdfjs) return pdfjs;
    const base = new URL('../../assets/vendor/pdfjs/', location.href).href;
    try {
      await cargarScript(base + 'pdf.classic.js');
      await cargarScript(base + 'pdf.worker.classic.js');
      pdfjs = globalThis.pdfjsLib;
      if (!pdfjs) throw new Error('PDF.js no se inicializó');
      pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.classic.js';
      return pdfjs;
    } catch (x) { console.warn(x); throw new Error('No se pudo cargar el lector de PDF. Revisa que exista la carpeta assets/vendor/pdfjs con los archivos pdf.classic.js y pdf.worker.classic.js.'); }
  }
  const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  // Reconstruye las líneas de una página a partir de los fragmentos de texto y su posición
  function lineasPagina(items) {
    const its = items.filter(i => i.str && i.str.trim() !== '' || i.str === ' ').map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.height) || 10 }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const lineas = [];
    its.forEach(i => {
      const l = lineas[lineas.length - 1];
      if (l && Math.abs(l.y - i.y) <= Math.max(2, i.h * 0.4)) l.items.push(i); else lineas.push({ y: i.y, items: [i] });
    });
    const gaps = []; for (let k = 1; k < lineas.length; k++) gaps.push(lineas[k - 1].y - lineas[k].y);
    const med = mediana(gaps.filter(g => g > 0));
    const out = [];
    lineas.forEach((l, k) => {
      if (k && med && lineas[k - 1].y - l.y > med * 1.7) out.push('');
      l.items.sort((a, b) => a.x - b.x);
      let s = '';
      l.items.forEach((i, j) => { if (j) { const prev = l.items[j - 1], gap = i.x - (prev.x + prev.w); if (gap > i.h * 0.2 && !/\s$/.test(s) && !/^\s/.test(i.s)) s += ' '; } s += i.s; });
      out.push(s.replace(/\s+$/, ''));
    });
    // El número de página suelto (arriba o abajo) no es parte del guion
    while (out.length && /^\s*\d{1,3}\.?\s*$/.test(out[0])) out.shift();
    while (out.length && /^\s*\d{1,3}\.?\s*$/.test(out[out.length - 1])) out.pop();
    return out.join('\n');
  }
  async function pdf(buf) {
    const lib = await cargarPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) paginas.push(lineasPagina((await (await doc.getPage(i)).getTextContent()).items));
    const letras = paginas.join('').replace(/\s/g, '').length;
    if (letras < 20 * doc.numPages && letras < 400) throw new Error('Este PDF no tiene texto seleccionable: parece un escaneo. Pásalo primero por un programa de OCR (reconocimiento de texto) y vuelve a importarlo.');
    return armar(paginas, 'PDF', [], true);
  }

  // ---------- Entrada ----------
  async function leer(archivo) {
    const nombre = archivo.name || '', ext = (nombre.split('.').pop() || '').toLowerCase();
    const buf = await archivo.arrayBuffer();
    let r;
    if (ext === 'txt' || ext === 'text' || ext === 'fountain') r = await txt(buf);
    else if (ext === 'docx') r = await docx(buf);
    else if (ext === 'pdf') r = await pdf(buf);
    else throw new Error('Formato no admitido. Usa un archivo PDF, DOCX o TXT.');
    if (!r.texto.trim()) throw new Error('El archivo no tiene texto.');
    return { ...r, archivo: nombre };
  }
  const deTexto = s => ({ ...armar([String(s)], 'Texto pegado', [], false), archivo: '' });

  return { leer, deTexto };
})();
