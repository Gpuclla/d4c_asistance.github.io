const Utils = (() => {
  const f2 = n => String(n).padStart(2, '0');
  const aISO = d => `${d.getFullYear()}-${f2(d.getMonth() + 1)}-${f2(d.getDate())}`;
  const medianoche = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Acepta fechas vacías o mal formadas sin romper la pantalla
  const deISO = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  return {
    id: pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    hoy: () => aISO(new Date()),
    enDias: n => { const d = medianoche(new Date()); d.setDate(d.getDate() + n); return aISO(d); },
    // NaN cuando no hay fecha: ninguna comparación (<, >=) la trata como vencida ni como próxima
    diasHasta: iso => { const d = deISO(iso); return d ? Math.round((d - medianoche(new Date())) / 864e5) : NaN; },
    entre: (a, b) => { const x = deISO(a), y = deISO(b); return x && y ? Math.round((y - x) / 864e5) : NaN; },
    relativo: n => Number.isNaN(n) ? 'sin fecha' : n < 0 ? `vencida hace ${-n} d` : n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} d`,
    corta: iso => { const d = deISO(iso); return d ? d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : ''; },
    larga: d => d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    dia: iso => { const d = deISO(iso); return d ? d.getDate() : ''; },
    mes: iso => { const d = deISO(iso); return d ? d.toLocaleDateString('es-PE', { month: 'short' }) : ''; },
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  };
})();
