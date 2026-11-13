# Asistencia de dirección · v1 (beta)

Panel de organización para un cortometraje de bajo presupuesto. Funciona en el navegador, sin servidor y sin internet.

## Cómo abrirlo
Abre `index.html` con Chrome, Edge o Firefox. Para que la base local funcione igual en todos los navegadores, lo ideal es servir la carpeta (por ejemplo `python -m http.server` y entrar a `http://localhost:8000`).

## Dónde se guardan los datos
En la base local del navegador (IndexedDB), en este equipo. No se envía nada a internet.
- **Copia de seguridad** (botón en el menú lateral): descarga todos los datos en un `.json`, los restaura o empieza un proyecto en limpio.
- Si limpias los datos del navegador, la base se borra: descarga copias con frecuencia.
- La base se llama `asistencia-direccion`. Si cambias la estructura de tablas, sube `VERSION` en `js/servicios/db.js`.

## Estructura
- `index.html` y `panel/`: panel principal.
- `modulos/<nombre>/`: un módulo por carpeta (hoy `equipo`, `tareas` y `cronograma`). Las carpetas van siempre en minúscula.
- `js/servicios/`: datos (`db.js`) y reglas de negocio (`equipo.service.js`, `tareas.service.js`, `cronograma.service.js`). Cada módulo lee de los servicios de los demás: no repite sus reglas.
- `js/componentes/`: menú lateral, formulario en diálogo y copia de seguridad, compartidos por todos los módulos.
- `data/semillas/semillas.js`: datos de ejemplo (se cargan una sola vez).

## Para sumar un módulo
1. Crea `modulos/<nombre>/<nombre>.html|js|css` copiando la estructura de `equipo`.
2. En `js/componentes/lateral.js` cambia el último valor de su fila a `true`.

## Fuente sin internet
Copia `HankenGrotesk-Variable.woff2` en `assets/fuentes/`. Sin ese archivo se usa la fuente de Google (con internet) o la del sistema.

## Módulo Gestión de tareas
- Cuatro vistas: **Panel de tareas**, **Tablero Kanban**, **Lista de tareas** y el formulario de **Registro** (cinco grupos: Identificación, Responsabilidad, Planificación, Seguimiento y Referencias).
- Cada tarea tiene un código (`T-001`…) único, que no cambia ni se reutiliza. Un enlace como `modulos/tareas/tareas.html#T-003` abre directamente su detalle.
- Responsables, departamentos y etapas se eligen desde los módulos Equipo y cargos y Etapas; las dependencias entre tareas no pueden formar ciclos.
- Cada cambio queda en el registro de la propia tarea y en el historial general.
- Para otros módulos: `Tareas.indicadores(d)`, `Tareas.vencida(t)`, `Tareas.avisos(d, t)` y los campos `inicio`, `vence` y `duracion` de cada tarea están pensados para que Cronograma y Etapas los reutilicen.

## Módulo Cronograma
- Tres vistas: **Panel del cronograma**, **Calendario** (semanal y diario) y **Lista de actividades**, más el formulario de **Registro** en cinco grupos (Identificación, Horario, Participantes, Relaciones y Seguimiento).
- Una tarea es el trabajo por hacer; una actividad es cuándo y dónde ocurre algo. Una actividad puede vincularse a varias tareas.
- Cada actividad tiene un código (`A-001`…) único e inmutable. Un enlace como `modulos/cronograma/cronograma.html#A-003` abre su detalle.
- Estados: Provisional, Confirmada, En curso, Realizada y Cancelada. «Reprogramada» no es un estado: se deduce del historial `reprogramaciones` (mover el horario de una actividad confirmada o en curso exige un motivo).
- La duración nunca se guarda: se calcula con el inicio y el fin.
- Los conflictos no se guardan: se calculan siempre con los datos de Equipo, Tareas y del propio cronograma (personas no disponibles o con doble reserva, orden entre actividades, vencimiento de tareas vinculadas).
- Fechas y horas se guardan como texto local `AAAA-MM-DDTHH:mm`.
- **Gantt (mejora futura):** no necesita otra base de datos. Puede dibujarse con `inicio`, `fin`, `predecesoras` (con su tipo de relación), `etapa` y `departamento` de cada actividad.

## Módulo 06 · Desglose de guion

Convierte un guion en escenas y elementos de producción, listos para revisar y repartir en tareas.

- **Importar** PDF, DOCX o TXT (o pegar el texto). TXT y DOCX funcionan abriendo la app con doble clic; **el PDF necesita servidor local** (`python -m http.server`) porque usa PDF.js (`assets/vendor/pdfjs`, sin internet). Un PDF escaneado no tiene texto: hay que pasarlo antes por OCR.
- **Escenas**: se detectan los encabezados (`INT.`/`EXT.`/`INT./EXT.`, número, locación y momento del día). Cada escena tiene su ficha (páginas, resumen, observaciones de dirección, estado de revisión) y se pueden registrar escenas a mano.
- **Análisis automático** por palabras clave (diccionario en `js/servicios/desglose.service.js`, constante `DICC`): personajes y extras, locaciones, utilería y decoración, vestuario/maquillaje/peluquería, vehículos y animales, sonido y música, efectos, necesidades técnicas. Toda detección es una propuesta: se confirma, corrige o descarta.
- **Guion marcado**: un color por categoría, categorías activables, clic en una palabra para revisarla, selección de texto para añadir elementos a mano.
- **Inventario**: un único registro por elemento, reutilizado en todas las escenas donde aparece; repetidos, estado (deducido de sus apariciones), filtros por categoría, escena, departamento y estado, edición y fusión de duplicados.
- **Revisión y versiones**: cada importación crea una versión; nunca se sobrescribe el desglose anterior. El estado del desglose se deduce del de sus escenas. Escenas y elementos dudosos y posibles duplicados se listan para revisar.
- **Con otros módulos**: «Crear tarea» desde un elemento (responsables de Equipo y cargos; la tarea guarda el vínculo y su estado se sigue en Gestión de tareas). `Desglose.escenasConNecesidades()` queda disponible para el Cronograma.

Tablas nuevas en la base (versión 3): `guiones`, `escenas`, `elementos`, `apariciones`. Pendiente para más adelante: comparar versiones, OCR, volver a analizar sin perder las correcciones.
