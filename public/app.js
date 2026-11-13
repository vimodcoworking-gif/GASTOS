// Soles y dólares primero; después, todas las monedas que conoce el navegador.
const MONEDAS_FRECUENTES = ['PEN', 'USD', 'EUR'];
const MONEDAS = [
  ...MONEDAS_FRECUENTES,
  ...(Intl.supportedValuesOf?.('currency') ?? ['MXN', 'COP', 'ARS', 'CLP', 'BOB', 'UYU', 'PYG', 'VES', 'DOP', 'CRC', 'GTQ', 'BRL', 'GBP'])
    .filter((m) => !MONEDAS_FRECUENTES.includes(m)),
];
const nombresMoneda = new Intl.DisplayNames('es', { type: 'currency' });
const opcionesMoneda = () => MONEDAS.map((m) => h('option', { value: m }, `${m} · ${nombresMoneda.of(m)}`));

const CATEGORIAS = {
  gasto: ['Vivienda', 'Comida', 'Transporte', 'Servicios', 'Salud', 'Educación', 'Ocio', 'Ropa', 'Deudas', 'Suscripciones', 'Mascotas', 'Otros'],
  ingreso: ['Salario', 'Ventas', 'Freelance', 'Intereses', 'Regalos', 'Otros'],
};
const ROLES = { propietario: 'Propietario', editor: 'Puede editar', lector: 'Solo ver' };
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const estado = {
  usuario: null,
  libros: [],
  libroId: null,
  vista: 'mes',
  mes: hoy().slice(0, 7),
  dia: hoy(),
  anio: Number(hoy().slice(0, 4)),
  // Periodo elegido en «Compartir» para enviar el estado de cuenta.
  envio: { periodo: 'mes', desde: `${hoy().slice(0, 7)}-01`, hasta: hoy() },
  // Sección visible dentro de cada vista (los botones que evitan desplazarse).
  seccion: { mes: 'calendario', anio: 'grafica', admin: 'almacenamiento', categorias: 'gasto' },
};

// ---------- utilidades ----------

const $ = (selector, raiz = document) => raiz.querySelector(selector);

// Crea elementos sin innerHTML, así el texto de los usuarios nunca se interpreta como HTML.
function h(etiqueta, props, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave.startsWith('on')) el.addEventListener(clave.slice(2), valor);
    else if (clave in el) el[clave] = valor;
    else el.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat(Infinity)) if (hijo != null && hijo !== false) el.append(hijo);
  return el;
}

async function api(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${ruta}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && estado.usuario) {
      mostrarAcceso();
      // Por ejemplo, la licencia de VIMOD venció o se suspendió: se explica en la pantalla de acceso.
      if (datos?.error) $('#auth-error').textContent = datos.error;
    }
    const error = new Error(datos?.error ?? 'No se pudo completar la operación');
    error.estado = res.status;
    throw error;
  }
  return datos;
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function moverMes(mes, n) {
  const [anio, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(anio, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const fechaTexto = (fecha, opciones) =>
  new Date(`${fecha}T00:00:00Z`).toLocaleDateString('es', { ...opciones, timeZone: 'UTC' });
const nombreMes = (mes, opciones = { month: 'long', year: 'numeric' }) => fechaTexto(`${mes}-01`, opciones);
const fechaCorta = (fecha) => fechaTexto(fecha, { day: 'numeric', month: 'short' });

const libroActual = () => estado.libros.find((l) => l.id === estado.libroId);
const puedeEditar = () => Boolean(libroActual()) && libroActual().rol !== 'lector';

function dinero(monto) {
  const moneda = libroActual()?.moneda ?? 'PEN';
  try {
    // Formato peruano con símbolo corto: «S/ 2,720.50», «$ 2,720.50», «€ 2,720.50».
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, currencyDisplay: 'narrowSymbol' }).format(monto);
  } catch {
    return `${monto.toFixed(2)} ${moneda}`;
  }
}

// Importe de un movimiento: si se cobró en otra moneda, esa (p. ej. «US$ 94.39»); si no, la del libro.
function dineroMov(m) {
  if (!m.moneda || !(m.montoOriginal > 0)) return dinero(m.monto);
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: m.moneda }).format(m.montoOriginal);
  } catch {
    return `${m.montoOriginal.toFixed(2)} ${m.moneda}`;
  }
}

const entero = (n) => new Intl.NumberFormat('es-PE').format(n);

let temporizadorAviso;
function avisar(mensaje) {
  const el = $('#aviso');
  el.textContent = mensaje;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  // Los avisos largos (un error con su motivo) se dejan más tiempo para poder leerlos.
  temporizadorAviso = setTimeout(() => (el.hidden = true), mensaje.length > 80 ? 12000 : 3500);
}

// Ejecuta una acción y muestra el error como aviso si falla.
async function intentar(accion) {
  try {
    await accion();
  } catch (err) {
    avisar(err.message);
  }
}

function recordarLibro(id) {
  estado.libroId = id;
  try {
    localStorage.setItem('libro', id);
  } catch {
    // Almacenamiento bloqueado: simplemente no se recuerda la selección.
  }
}

// Cambia de mes y deja elegido el día de hoy si cae en él.
function irAMes(mes) {
  estado.mes = mes;
  estado.dia = hoy().startsWith(mes) ? hoy() : null;
  estado.vista = 'mes';
  render();
}

// ---------- acceso ----------

// entrar | registro | olvide (pedir el código) | codigo (escribirlo junto a la contraseña nueva)
let modoAcceso = 'entrar';
// Si el servidor tiene configurado el acceso con Google.
let googleDisponible = false;
// Cada cuántos minutos revisa el servidor los Gmail vinculados.
let minutosGmail = 10;
// Recarga el progreso de un escaneo mientras está en curso.
let temporizadorEscaneo = null;
// La lista de «Correos revisados» sigue abierta aunque la pantalla se redibuje.
let revisadosAbiertos = false;
const MODOS_ACCESO = {
  entrar: { boton: 'Entrar', pregunta: '¿No tienes cuenta?', cambiar: 'Crear una', destino: 'registro' },
  registro: { boton: 'Crear cuenta', pregunta: '¿Ya tienes cuenta?', cambiar: 'Entrar', destino: 'entrar' },
  olvide: { boton: 'Enviarme un código', pregunta: '¿La recordaste?', cambiar: 'Volver a entrar', destino: 'entrar' },
  codigo: { boton: 'Cambiar contraseña', pregunta: '¿No te llegó el código?', cambiar: 'Pedir otro', destino: 'olvide' },
};

function mostrarAcceso() {
  estado.usuario = null;
  for (const dialogo of document.querySelectorAll('dialog[open]')) dialogo.close();
  $('#app').hidden = true;
  $('#auth').hidden = false;
}

function pintarModoAcceso(modo = modoAcceso, info = '') {
  modoAcceso = modo;
  const textos = MODOS_ACCESO[modo];
  // Qué campos pide cada modo.
  const mostrar = (selector, visible) => {
    $(selector).hidden = !visible;
    $(`${selector} input`).required = visible;
  };
  mostrar('#campo-nombre', modo === 'registro');
  mostrar('#campo-whatsapp', modo === 'registro');
  mostrar('#campo-codigo', modo === 'codigo');
  mostrar('#campo-password', modo !== 'olvide');
  $('#etiqueta-password').textContent = modo === 'codigo' ? 'Contraseña nueva' : 'Contraseña';
  $('#form-auth [name=password]').autocomplete = modo === 'entrar' ? 'current-password' : 'new-password';
  $('#auth-enviar').textContent = textos.boton;
  $('#auth-pregunta').textContent = textos.pregunta;
  $('#auth-cambiar').textContent = textos.cambiar;
  $('#auth-olvide').parentElement.hidden = modo !== 'entrar';
  $('#auth-google-caja').hidden = !googleDisponible || (modo !== 'entrar' && modo !== 'registro');
  $('#auth-info').textContent = info || (modo === 'olvide' ? 'Escribe el correo de tu cuenta y te enviaremos un código para poner una contraseña nueva.' : '');
  $('#auth-error').textContent = '';
}

$('#auth-cambiar').addEventListener('click', () => pintarModoAcceso(MODOS_ACCESO[modoAcceso].destino));
$('#auth-olvide').addEventListener('click', () => pintarModoAcceso('olvide'));
$('#auth-google').addEventListener('click', () => location.assign('/api/auth/google?modo=entrar'));

$('#form-auth').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const email = form.email.value;
  try {
    if (modoAcceso === 'olvide') {
      const { mensaje } = await api('/auth/olvide', { method: 'POST', body: { email } });
      form.password.value = '';
      pintarModoAcceso('codigo', mensaje);
      return;
    }
    const peticiones = {
      entrar: ['/auth/login', { email, password: form.password.value }],
      registro: ['/auth/registro', { email, password: form.password.value, nombre: form.nombre.value, whatsapp: form.whatsapp.value }],
      codigo: ['/auth/restablecer', { email, password: form.password.value, codigo: form.codigo.value }],
    };
    const [ruta, body] = peticiones[modoAcceso];
    const { usuario } = await api(ruta, { method: 'POST', body });
    const cambiada = modoAcceso === 'codigo';
    form.reset();
    pintarModoAcceso('entrar');
    await entrar(usuario);
    if (cambiada) avisar('Contraseña cambiada');
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
});

$('#salir').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  mostrarAcceso();
});

async function entrar(usuario) {
  estado.usuario = usuario;
  $('#usuario').textContent = `${usuario.nombre} · ${usuario.email}`;
  $('#pestana-admin').hidden = !usuario.esAdmin;
  if (!usuario.esAdmin && estado.vista === 'admin') estado.vista = 'mes';
  $('#auth').hidden = true;
  $('#app').hidden = false;
  await cargarLibros();
  aplicarDestinoDeUrl();
  render();
  // Una sola vez: invitación a instalar la app (o, ya instalada, a activar las notificaciones).
  // Si no hubo nada que mostrar, en iPhone se enseña (una vez) cómo registrar los yapes con el atajo.
  setTimeout(() => abrirAvisoApp().then((mostrado) => { if (!mostrado) tutorialAtajoUnaVez(); }).catch(() => {}), 1500);
}

// ---------- tema claro u oscuro ----------

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $('#cambiar-tema').textContent = tema === 'claro' ? 'Modo oscuro' : 'Modo claro';
  $('meta[name=theme-color]').content = tema === 'claro' ? '#eef0e8' : '#12150e';
}

aplicarTema(document.documentElement.dataset.tema ?? 'claro');

$('#cambiar-tema').addEventListener('click', () => {
  const tema = document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro';
  aplicarTema(tema);
  try {
    localStorage.setItem('tema', tema);
  } catch {
    // Almacenamiento bloqueado: el tema vale solo para esta visita.
  }
});

// ---------- menú lateral ----------

$('#abrir-menu').addEventListener('click', () => $('#menu').showModal());

// Tocar fuera del menú (sobre el fondo oscurecido) lo cierra.
$('#menu').addEventListener('click', (ev) => {
  if (ev.target === ev.currentTarget) ev.currentTarget.close();
});

// Barra de navegación inferior (teléfonos): las vistas principales y «Más» para el resto del menú.
$('#nav-inferior').addEventListener('click', (ev) => {
  const boton = ev.target.closest('button');
  if (!boton) return;
  if (boton.id === 'nav-mas') return $('#menu').showModal();
  estado.vista = boton.dataset.vista;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#pestanas').addEventListener('click', (ev) => {
  const vista = ev.target.dataset?.vista;
  if (!vista) return;
  estado.vista = vista;
  $('#menu').close();
  render();
});

for (const boton of document.querySelectorAll('[data-cerrar]')) {
  boton.addEventListener('click', () => boton.closest('dialog').close());
}

// ---------- capturas de Yape, Plin o del banco ----------
// En el iPhone, Yape no deja leer sus avisos y su correo no siempre llega: se sube la captura de «Movimientos»,
// la IA la lee y aquí se eligen los que se registran (los que ya están en el libro vienen sin marcar).

function elegirCaptura() {
  const entrada = h('input', { type: 'file', accept: 'image/*,application/pdf' });
  entrada.hidden = true;
  entrada.addEventListener('change', () => {
    const archivo = entrada.files[0];
    entrada.remove();
    if (archivo) leerCaptura(archivo);
  });
  document.body.append(entrada);
  entrada.click();
}

// Las capturas del teléfono pesan varios MB: se reducen a 1800 px de alto o ancho en JPEG antes de subirlas.
async function reducirImagen(archivo) {
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/gif') return archivo;
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, 1800 / Math.max(imagen.width, imagen.height));
    if (escala === 1 && archivo.size < 1.5e6) return archivo;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((ok) => lienzo.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.88));
  } catch {
    return archivo; // p. ej. HEIC en un navegador que no lo abre: lo intenta el servidor.
  }
}

function dialogoCaptura() {
  let dlg = $('#dlg-captura');
  if (!dlg) {
    dlg = h('dialog', { id: 'dlg-captura', class: 'dlg-captura' });
    dlg.addEventListener('close', () => dlg.replaceChildren());
    document.body.append(dlg);
  }
  return dlg;
}

async function leerCaptura(archivo) {
  const libroId = estado.libroId;
  const dlg = dialogoCaptura();
  dlg.replaceChildren(
    h('h2', null, 'Leyendo la captura…'),
    h('p', { class: 'tenue' }, 'La IA está buscando los pagos y cobros. Tarda unos segundos.'),
    h('div', { class: 'cargando-captura', role: 'status' }, h('span'), h('span'), h('span')),
  );
  if (!dlg.open) dlg.showModal();
  try {
    const cuerpo = await reducirImagen(archivo);
    const res = await fetch(`/api/libros/${libroId}/capturas`, { method: 'POST', headers: { 'Content-Type': cuerpo.type || archivo.type || 'image/jpeg' }, body: cuerpo });
    const datos = await res.json().catch(() => null);
    if (!res.ok) throw new Error(datos?.error ?? 'No se pudo leer la captura.');
    if (!dlg.open) return;
    pintarCaptura(dlg, libroId, datos);
  } catch (err) {
    dlg.replaceChildren(
      h('h2', null, 'No se pudo leer'),
      h('p', { class: 'error' }, err.message),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', onclick: () => dlg.close() }, 'Cerrar'),
        h('button', { type: 'button', class: 'primario', onclick: () => { dlg.close(); elegirCaptura(); } }, 'Probar con otra')),
    );
  }
}

function pintarCaptura(dlg, libroId, { movimientos, nota }) {
  if (!movimientos.length) {
    dlg.replaceChildren(
      h('h2', null, 'No encontré movimientos'),
      h('p', { class: 'tenue' }, nota || 'No vi ningún pago ni cobro en la imagen. Prueba con una captura más nítida de la lista de movimientos.'),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', onclick: () => dlg.close() }, 'Cerrar'),
        h('button', { type: 'button', class: 'primario', onclick: () => { dlg.close(); elegirCaptura(); } }, 'Subir otra')),
    );
    return;
  }
  const moneda = libroActual()?.moneda;
  const casillas = [];
  const boton = h('button', { type: 'button', class: 'primario' });
  const contar = () => {
    const n = casillas.filter((c) => c.checked).length;
    boton.textContent = n ? `Registrar ${n}` : 'Elige alguno';
    boton.disabled = !n;
  };
  const filas = movimientos.map((m) => {
    const casilla = h('input', { type: 'checkbox', checked: !m.yaAnotado, onchange: contar });
    casillas.push(casilla);
    return h('label', { class: `fila-captura ${m.yaAnotado ? 'ya-anotado' : ''}` },
      casilla,
      h('span', { class: 'fila-captura-texto' },
        h('strong', null, m.descripcion),
        h('small', { class: 'tenue' },
          [fechaTexto(m.fecha, { weekday: 'short', day: 'numeric', month: 'short' }), m.hora, m.categoria].filter(Boolean).join(' · ')),
        h('span', { class: 'fila-captura-chips' },
          chipMedio(m),
          m.yaAnotado && h('span', { class: 'chip aviso-chip' }, 'Ya está en el libro'))),
      h('span', { class: `fila-captura-monto ${m.tipo}` },
        `${m.tipo === 'gasto' ? '−' : '+'} ${m.moneda && m.moneda !== moneda ? `${m.moneda} ${m.monto.toFixed(2)}` : dinero(m.monto)}`));
  });
  const repetidos = movimientos.filter((m) => m.yaAnotado).length;
  boton.addEventListener('click', async () => {
    const elegidos = movimientos.filter((_, i) => casillas[i].checked).map(({ yaAnotado, ...m }) => m);
    boton.disabled = true;
    boton.textContent = 'Registrando…';
    try {
      const { mensaje } = await api(`/libros/${libroId}/capturas/registrar`, { method: 'POST', body: { movimientos: elegidos } });
      dlg.close();
      avisar(mensaje.split('\n')[0].replace(/^✅\s*/, ''));
      render();
    } catch (err) {
      avisar(err.message);
      contar();
    }
  });
  dlg.replaceChildren(
    h('h2', null, `Encontré ${movimientos.length === 1 ? '1 movimiento' : `${movimientos.length} movimientos`}`),
    h('p', { class: 'tenue' }, repetidos
      ? `Marca los que quieras registrar. ${repetidos === 1 ? 'Uno ya estaba' : `${repetidos} ya estaban`} en el libro (mismo monto y día) y ${repetidos === 1 ? 'va' : 'van'} sin marcar.`
      : 'Marca los que quieras registrar.'),
    nota && h('p', { class: 'tenue nota-captura' }, nota),
    h('div', { class: 'lista-captura' }, filas),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'al-inicio', onclick: () => { dlg.close(); elegirCaptura(); } }, 'Otra captura'),
      h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancelar'),
      boton),
  );
  contar();
}

// ---------- libros ----------

async function cargarLibros() {
  estado.libros = (await api('/libros')).libros;
  let guardado = null;
  try {
    guardado = localStorage.getItem('libro');
  } catch {
    // Sin almacenamiento: se usa el primer libro.
  }
  const preferido = [estado.libroId, guardado].find((id) => estado.libros.some((l) => l.id === id));
  estado.libroId = preferido ?? estado.libros[0]?.id ?? null;

  $('#libro').replaceChildren(
    ...estado.libros.map((l) =>
      h('option', { value: l.id, selected: l.id === estado.libroId },
        l.rol === 'propietario' ? l.nombre : `${l.nombre} (de ${l.propietario})`),
    ),
  );
  pintarMoneda();
}

// El selector de moneda refleja el libro elegido; solo su propietario puede cambiarla.
function pintarMoneda() {
  const libro = libroActual();
  const selector = $('#moneda');
  if (!selector.options.length) selector.replaceChildren(...opcionesMoneda());
  selector.value = libro?.moneda ?? 'PEN';
  selector.disabled = libro?.rol !== 'propietario';
}

$('#libro').addEventListener('change', (ev) => {
  recordarLibro(ev.target.value);
  pintarMoneda();
  render();
});

$('#moneda').addEventListener('change', (ev) =>
  intentar(async () => {
    const libro = libroActual();
    try {
      await api(`/libros/${libro.id}`, { method: 'PATCH', body: { moneda: ev.target.value } });
      libro.moneda = ev.target.value;
      avisar(`Moneda del libro: ${nombresMoneda.of(libro.moneda)}`);
    } finally {
      pintarMoneda();
    }
    render();
  }),
);

let libroEnEdicion = null;

function abrirLibro(libro = null) {
  libroEnEdicion = libro;
  const form = $('#form-libro');
  $('#libro-titulo').textContent = libro ? 'Editar libro' : 'Nuevo libro';
  $('#libro-error').textContent = '';
  form.nombre.value = libro?.nombre ?? '';
  form.moneda.replaceChildren(...opcionesMoneda());
  form.moneda.value = libro?.moneda ?? libroActual()?.moneda ?? 'PEN';
  $('#menu').close();
  $('#dlg-libro').showModal();
}

$('#nuevo-libro').addEventListener('click', () => abrirLibro());

$('#form-libro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const body = { nombre: form.nombre.value, moneda: form.moneda.value };
  try {
    if (libroEnEdicion) {
      await api(`/libros/${libroEnEdicion.id}`, { method: 'PATCH', body });
    } else {
      const { libro } = await api('/libros', { method: 'POST', body });
      recordarLibro(libro.id);
    }
    $('#dlg-libro').close();
    await cargarLibros();
    render();
  } catch (err) {
    $('#libro-error').textContent = err.message;
  }
});

// ---------- movimientos ----------

let movEnEdicion = null;

function pintarTipoMovimiento() {
  const form = $('#form-mov');
  const tipo = form.tipo.value;
  $('#mov-pagado-texto').textContent = tipo === 'gasto' ? 'Ya está pagado' : 'Ya está recibido';
  const propias = (libroActual()?.categorias ?? []).filter((c) => c.tipo === tipo).map((c) => c.nombre);
  $('#categorias').replaceChildren(...[...new Set([...propias, ...CATEGORIAS[tipo]])].map((c) => h('option', { value: c })));
  pintarRecordar();
}

// El recordatorio por WhatsApp solo tiene sentido en un gasto que todavía no se pagó.
function pintarRecordar() {
  const form = $('#form-mov');
  const dias = estado.usuario?.recordatorio?.dias ?? 2;
  form.recordar.options[0].textContent = dias > 0 ? `Según mi ajuste (${dias === 1 ? '1 día' : `${dias} días`} antes)` : 'Según mi ajuste (solo el mismo día)';
  $('#campo-recordar').hidden = form.tipo.value !== 'gasto' || form.pagado.checked;
}

// Sin movimiento abre el alta; «fecha» propone un día concreto (el elegido en el calendario).
function abrirMovimiento(mov = null, fecha = null, tipo = null) {
  movEnEdicion = mov;
  const form = $('#form-mov');
  form.reset();
  if (!mov && tipo) form.tipo.value = tipo;
  $('#mov-titulo').textContent = mov ? 'Editar movimiento' : 'Nuevo movimiento';
  $('#mov-error').textContent = '';
  $('#mov-eliminar').hidden = !mov;
  form.repetir.options[0].textContent = mov?.enSerie ? 'No cambiar las repeticiones' : 'No repetir';
  if (mov) {
    form.tipo.value = mov.tipo;
    form.descripcion.value = mov.descripcion;
    form.monto.value = mov.monto;
    form.fecha.value = mov.fecha;
    form.categoria.value = mov.categoria;
    form.pagado.checked = mov.pagado;
    form.medio.value = mov.medio ?? '';
    form.entidad.value = mov.entidad ?? '';
    form.recordar.value = mov.recordar ?? '';
  } else {
    // Por defecto: el día pedido, hoy si estamos en el mes actual, o el primer día del mes visible.
    form.fecha.value = fecha ?? (hoy().startsWith(estado.mes) ? hoy() : `${estado.mes}-01`);
    form.pagado.checked = form.fecha.value <= hoy();
  }
  pintarTipoMovimiento();
  pintarRepeticion();
  $('#dlg-mov').showModal();
}

// Fecha de la repetición número «veces» (igual que en el servidor: el día 31 pasa al último del mes).
function fechaRepeticion(fecha, cada, veces) {
  const dias = { dia: 1, semana: 7, quincena: 14 }[cada];
  if (dias) return sumarDias(fecha, dias * veces);
  const meses = { mes: 1, bimestre: 2, trimestre: 3, semestre: 6, anio: 12 }[cada] * veces;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, mes - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes - 1 + meses, Math.min(dia, ultimo))).toISOString().slice(0, 10);
}

// Muestra el campo «cuántas veces» y explica hasta cuándo llegarán las repeticiones.
function pintarRepeticion() {
  const form = $('#form-mov');
  const cada = form.repetir.value;
  const activo = cada !== 'no';
  $('#campo-veces').hidden = !activo;
  form.veces.required = activo;
  const nota = $('#nota-repetir');
  nota.hidden = !activo;
  if (!activo) return;

  const veces = Number(form.veces.value);
  const valido = form.fecha.value && Number.isInteger(veces) && veces >= 1 && veces <= 366;
  nota.textContent = [
    valido && `Última repetición: ${fechaTexto(fechaRepeticion(form.fecha.value, cada, veces), { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    movEnEdicion?.enSerie && 'Sustituye las repeticiones posteriores a este movimiento.',
  ].filter(Boolean).join(' ');
}

$('#nuevo-rapido').addEventListener('click', () => abrirMovimiento(null, estado.vista === 'mes' ? estado.dia : null));

$('#mov-eliminar').addEventListener('click', () => {
  $('#dlg-mov').close();
  eliminarMovimiento(movEnEdicion);
});

$('#form-mov').addEventListener('change', (ev) => {
  if (ev.target.name === 'tipo') pintarTipoMovimiento();
  if (ev.target.name === 'pagado' || ev.target.name === 'fecha') pintarRecordar();
});
$('#form-mov').addEventListener('input', (ev) => {
  if (['repetir', 'veces', 'fecha'].includes(ev.target.name)) pintarRepeticion();
});

$('#form-mov').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const body = {
    tipo: form.tipo.value,
    descripcion: form.descripcion.value,
    monto: Number(form.monto.value),
    fecha: form.fecha.value,
    categoria: form.categoria.value,
    pagado: form.pagado.checked,
    medio: form.medio.value,
    entidad: form.entidad.value,
    recordar: form.recordar.value,
  };
  if (form.repetir.value !== 'no') {
    body.repetir = form.repetir.value;
    body.veces = Number(form.veces.value);
  }
  const base = `/libros/${estado.libroId}/movimientos`;
  try {
    if (movEnEdicion) {
      const { creados } = await api(`${base}/${movEnEdicion.id}`, { method: 'PATCH', body });
      if (creados > 0) avisar(`Se programaron ${creados} repeticiones`);
    } else {
      const { creados } = await api(base, { method: 'POST', body });
      if (creados > 1) avisar(`Se crearon ${creados} movimientos (el de hoy y ${creados - 1} repeticiones)`);
    }
    $('#dlg-mov').close();
    datosRecordados.clear();
    render();
  } catch (err) {
    $('#mov-error').textContent = err.message;
  }
});

// El cambio se pinta al instante y se confirma con el servidor después; si falla, se recarga lo real.
async function marcarPagado(mov, pagado) {
  const datos = memoria.vista === 'mes' ? memoria.datos : null;
  if (datos) {
    for (const lista of [datos.actual, datos.proximo, datos.pendientes]) {
      for (const m of lista) if (m.id === mov.id) m.pagado = pagado;
    }
    if (pagado) datos.pendientes = datos.pendientes.filter((m) => m.id !== mov.id);
    render(true);
  }
  datosRecordados.clear();
  try {
    await api(`/libros/${estado.libroId}/movimientos/${mov.id}`, { method: 'PATCH', body: { pagado } });
  } catch (err) {
    avisar(err.message);
  }
  render();
}

const eliminarMovimiento = (mov) =>
  intentar(async () => {
    if (!confirm(`¿Eliminar «${mov.descripcion}»?`)) return;
    const siguientes = mov.enSerie && confirm('Este movimiento se repite cada mes.\n¿Eliminar también las repeticiones de los meses siguientes?');
    await api(`/libros/${estado.libroId}/movimientos/${mov.id}${siguientes ? '?siguientes=1' : ''}`, { method: 'DELETE' });
    datosRecordados.clear();
    render();
  });

function chipEstado(mov) {
  if (mov.pagado) return h('span', { class: 'chip ok' }, mov.tipo === 'gasto' ? 'Pagado' : 'Recibido');
  if (mov.fecha < hoy()) return h('span', { class: 'chip vencido' }, mov.tipo === 'gasto' ? 'Vencido' : 'Atrasado');
  return h('span', { class: 'chip' }, mov.tipo === 'gasto' ? 'Pendiente' : 'Por recibir');
}

// Iconos de línea (SVG, 24×24) que toman el color del texto.
const TRAZOS_ICONO = {
  movil: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  enviar: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  banco: '<path d="M3 21h18"/><path d="M5 21V11M9.5 21V11M14.5 21V11M19 21V11"/><path d="M2 11 12 4l10 7z"/>',
  billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  mas: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  correo: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  sincronizar: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
  entrada: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  salida: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  balanza: '<path d="M12 3v18"/><path d="M7 21h10"/><path d="M4 7h16"/><path d="m7 7-3 7a3 3 0 0 0 6 0z"/><path d="m17 7-3 7a3 3 0 0 0 6 0z"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pulso: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  alza: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  billetera: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
  flecha: '<path d="m9 6 6 6-6 6"/>',
  'flecha-izq': '<path d="m15 6-6 6 6 6"/>',
  descargar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  lapiz: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  campana: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  alcancia: '<path d="M5 11a7 6 0 0 1 12-3.5h2.5l-1 3a6 6 0 0 1 1.5 2.5H21v3h-1.5a7 7 0 0 1-2.5 2.5V21h-3v-1.6a8 8 0 0 1-4 0V21H7v-2.4A6.5 6.5 0 0 1 5 11z"/><path d="M15 11h.01"/><path d="M9.5 7.5h3"/>',
  meta: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  avion: '<path d="M21 15.5 13.5 11V5a1.5 1.5 0 0 0-3 0v6L3 15.5V17l7.5-2.2V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4.2L21 17z"/>',
  casa: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  auto: '<path d="M5 16V12l2-5h10l2 5v4"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16.5" r="1"/><circle cx="16.5" cy="16.5" r="1"/>',
  estudio: '<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/>',
  regalo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8S10.5 3 8 4.5 9.5 8 12 8zm0 0s1.5-5 4-3.5S14.5 8 12 8z"/>',
  salud: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-4.5-4.5L6 21"/>',
};

function icono(nombre, titulo = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icono icono-${nombre}`);
  svg.setAttribute('aria-hidden', titulo ? 'false' : 'true');
  if (titulo) svg.setAttribute('role', 'img');
  // Los trazos son fijos (de este archivo), nunca texto de los usuarios.
  svg.innerHTML = `${titulo ? `<title>${titulo}</title>` : ''}${TRAZOS_ICONO[nombre] ?? ''}`;
  return svg;
}

// Medios de pago: nombre e icono de la etiqueta.
const MEDIOS = {
  yape: { nombre: 'Yape', icono: 'movil' },
  plin: { nombre: 'Plin', icono: 'enviar' },
  tarjeta: { nombre: 'Tarjeta', icono: 'tarjeta' },
  transferencia: { nombre: 'Transferencia', icono: 'banco' },
  efectivo: { nombre: 'Efectivo', icono: 'billete' },
  otro: { nombre: 'Otro', icono: 'mas' },
};
// Colores de las entidades más comunes (si no está, la etiqueta usa el color del medio).
const CLASE_ENTIDAD = { BCP: 'bcp', Interbank: 'interbank', BBVA: 'bbva', Scotiabank: 'scotiabank', 'Banco de la Nación': 'bn', Falabella: 'falabella', Ripley: 'ripley' };

function chipMedio(m) {
  if (!m.medio && !m.entidad) return null;
  const medio = MEDIOS[m.medio];
  // Con tarjeta o transferencia lo útil es el banco («BCP» con el icono de tarjeta); con Yape o Plin, la billetera.
  const texto = medio
    ? (m.entidad && ['tarjeta', 'transferencia', 'otro'].includes(m.medio) ? m.entidad : medio.nombre)
    : m.entidad;
  return h('span', {
    // El color del banco solo con tarjeta, transferencia u otro; Yape y Plin llevan el suyo.
    class: `chip medio medio-${m.medio ?? 'otro'} ${CLASE_ENTIDAD[m.entidad] && !['yape', 'plin'].includes(m.medio) ? `entidad-${CLASE_ENTIDAD[m.entidad]}` : ''}`,
    title: [medio?.nombre, m.entidad].filter(Boolean).join(' · '),
  }, icono(medio?.icono ?? 'banco'), texto);
}

// Filtro por medio de pago y entidad, compartido por el calendario y el listado del mes.
const pasaFiltroMedio = (m) => {
  const { medio, entidad } = estado.filtroMedio ?? {};
  if (medio === 'sin' ? m.medio : medio && m.medio !== medio) return false;
  return !entidad || m.entidad === entidad;
};

function filtroMedios(movimientos) {
  const actual = estado.filtroMedio ?? {};
  const cambiar = (cambios) => {
    estado.filtroMedio = { ...actual, ...cambios };
    render();
  };
  const cuantos = (medio) => movimientos.filter((m) => (medio === 'sin' ? !m.medio : m.medio === medio)).length;
  const opciones = [['', 'Todos', movimientos.length], ...Object.entries(MEDIOS).map(([clave, v]) => [clave, v.nombre, cuantos(clave), v.icono]), ['sin', 'Sin indicar', cuantos('sin')]]
    .filter(([clave, , n]) => clave === '' || n > 0 || clave === actual.medio);
  const entidades = [...new Set(movimientos.filter((m) => m.entidad && (!actual.medio || m.medio === actual.medio)).map((m) => m.entidad))].sort();
  const filtrados = movimientos.filter(pasaFiltroMedio);
  const suma = (tipo) => filtrados.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.monto, 0);
  const activo = Boolean(actual.medio || actual.entidad);
  return h('div', { class: 'filtro-medios' },
    h('div', { class: 'chips-filtro', role: 'group', 'aria-label': 'Filtrar por medio de pago' },
      opciones.map(([clave, texto, n, nombreIcono]) => h('button', {
        type: 'button',
        class: `filtro ${(actual.medio ?? '') === clave ? 'activo' : ''}`,
        'aria-pressed': String((actual.medio ?? '') === clave),
        onclick: () => cambiar({ medio: clave, entidad: '' }),
      }, nombreIcono && icono(nombreIcono), `${texto} `, h('small', null, n))),
      entidades.length > 0 && h('select', {
        class: 'filtro-entidad',
        'aria-label': 'Filtrar por banco o entidad',
        onchange: (ev) => cambiar({ entidad: ev.target.value }),
      },
        h('option', { value: '' }, 'Todos los bancos'),
        entidades.map((e) => h('option', { value: e, selected: actual.entidad === e }, e))),
    ),
    activo && h('p', { class: 'tenue filtro-total' },
      `${filtrados.length} movimientos · Gastos ${dinero(suma('gasto'))} · Ingresos ${dinero(suma('ingreso'))}`),
  );
}

// Un movimiento como fila de lista; se usa en el calendario, en pendientes y en el listado del mes.
// Tocar el movimiento lo abre para editarlo o eliminarlo; al lado queda solo el botón de pagar.
function filaMovimiento(m, editar) {
  const contenido = [
    h('span', { class: 'cuerpo' },
      h('strong', null, m.descripcion,
        m.enSerie && h('span', { class: 'marca', title: 'Se repite' }, icono('repetir', 'Se repite')),
        m.desdeCorreo && h('span', { class: 'marca', title: 'Registrado desde tu correo de Gmail' }, icono('correo', 'Desde tu correo')),
        !m.pagado && m.tipo === 'gasto' && m.recordar !== -1 && h('span', { class: 'marca campana', title: 'Te lo recordaré por WhatsApp' }, icono('campana', 'Con recordatorio'))),
      h('small', null, `${fechaCorta(m.fecha)} · ${m.categoria} `),
      chipMedio(m),
      chipEstado(m),
    ),
    h('span', { class: `monto ${m.tipo}`, ...(m.moneda && { title: `Equivale a ${dinero(m.monto)} con el tipo de cambio del día` }) },
      `${m.tipo === 'gasto' ? '−' : '+'}${dineroMov(m)}`,
      m.moneda && h('small', { class: 'equivalente' }, `≈ ${dinero(m.monto)}`)),
  ];
  if (!editar) return h('li', { class: 'mov' }, h('div', { class: 'mov-abrir' }, contenido));

  return h('li', { class: 'mov' },
    h('button', { type: 'button', class: 'mov-abrir', title: 'Editar o eliminar', onclick: () => abrirMovimiento(m) }, contenido),
    m.pagado
      ? h('button', { type: 'button', class: 'mini accion-mov', onclick: () => marcarPagado(m, false), title: 'Volver a dejarlo pendiente', 'aria-label': `Deshacer el pago de ${m.descripcion}` },
        icono('deshacer'), h('span', { class: 'accion-texto' }, 'Deshacer'))
      : h('button', { type: 'button', class: 'mini primario accion-mov', onclick: () => marcarPagado(m, true), 'aria-label': `${m.tipo === 'gasto' ? 'Pagar' : 'Cobrar'} ${m.descripcion}` },
        icono('check'), h('span', { class: 'accion-texto' }, m.tipo === 'gasto' ? 'Pagar' : 'Cobrar')),
  );
}

const listaMovimientos = (movimientos, editar, textoVacio) =>
  movimientos.length === 0
    ? h('p', { class: 'vacio' }, textoVacio)
    : h('ul', { class: 'lista' }, movimientos.map((m) => filaMovimiento(m, editar)));

function totales(movimientos) {
  const t = { ingresos: 0, gastos: 0, gastosPendientes: 0, ingresosPendientes: 0 };
  for (const m of movimientos) {
    if (m.tipo === 'gasto') {
      t.gastos += m.monto;
      if (!m.pagado) t.gastosPendientes += m.monto;
    } else {
      t.ingresos += m.monto;
      if (!m.pagado) t.ingresosPendientes += m.monto;
    }
  }
  t.balance = t.ingresos - t.gastos;
  return t;
}

// Tarjeta de resumen: icono y etiqueta arriba, el importe grande y una nota; con «progreso» (0 a 1),
// una barra fina que muestra, por ejemplo, cuánto de lo gastado ya está pagado.
const tarjeta = (etiqueta, valor, nota, clase = '', { icono: nombreIcono, tono, progreso } = {}) =>
  h('div', { class: `tarjeta ${clase} ${tono ? `tono-${tono}` : ''}` },
    h('div', { class: 'tarjeta-cabeza' },
      nombreIcono && h('span', { class: 'icono-caja' }, icono(nombreIcono)),
      h('div', { class: 'etiqueta' }, etiqueta)),
    h('div', { class: 'valor' }, valor),
    nota && h('div', { class: 'nota' }, nota),
    progreso !== undefined && h('div', { class: 'progreso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progreso * 100)) },
      h('span', { style: `width:${Math.min(Math.max(progreso, 0), 1) * 100}%` })),
  );

// Botones que cambian la sección visible de una vista sin volver a pedir los datos.
// opciones: [valor, etiqueta, contador opcional, contador en rojo]
function segmentos(vista, opciones) {
  return h('div', { class: `segmentos n${opciones.length}`, role: 'tablist' },
    opciones.map(([valor, etiqueta, contador, rojo]) =>
      h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(estado.seccion[vista] === valor),
        onclick: () => {
          estado.seccion[vista] = valor;
          render(true);
        },
      }, etiqueta, contador > 0 && h('span', { class: rojo ? 'cuenta' : 'cuenta neutra' }, String(contador))),
    ),
  );
}

// ---------- vista: mes · gráficas ----------

const NOMBRE_MEDIO_CORTO = { yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro' };
const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

// Tarjeta pequeña con un dato destacado (mismo diseño que las del resumen).
const dato = (etiqueta, valor, nota, nombreIcono, tono) => tarjeta(etiqueta, valor, nota, 'dato', { icono: nombreIcono, tono });

/**
 * Barras horizontales ordenadas (gastos por categoría, por medio de pago…): una sola serie, así que el color
 * es el de la serie y cada barra lleva su importe y su porcentaje escritos.
 * «filas»: [{ nombre, total, icono?, cuantos }]
 */
function barrasHorizontales(filas, { serie = 'gasto', vacio = 'Sin datos este mes.', max = 8 } = {}) {
  if (!filas.length) return h('p', { class: 'vacio' }, vacio);
  const total = filas.reduce((s, f) => s + f.total, 0);
  // Más de «max» filas: el resto se agrupa en «Otras» para que la lista no se alargue.
  const visibles = filas.length > max
    ? [...filas.slice(0, max - 1), { nombre: `Otras (${filas.length - max + 1})`, total: filas.slice(max - 1).reduce((s, f) => s + f.total, 0), cuantos: filas.slice(max - 1).reduce((s, f) => s + f.cuantos, 0) }]
    : filas;
  const mayor = Math.max(...visibles.map((f) => f.total));
  return h('ul', { class: 'barras-h' },
    visibles.map((f) => h('li', { title: `${f.nombre}: ${dinero(f.total)} (${porcentaje(f.total, total)} %) · ${f.cuantos} movimiento${f.cuantos === 1 ? '' : 's'}` },
      h('div', { class: 'barras-h-nombre' }, f.icono && icono(f.icono), h('span', null, f.nombre)),
      h('div', { class: 'barras-h-pista' }, h('div', { class: `barras-h-barra serie-${serie}`, style: `width:${Math.max((f.total / mayor) * 100, 1.5)}%` })),
      h('div', { class: 'barras-h-valor' }, h('strong', null, dinero(f.total)), h('small', null, `${porcentaje(f.total, total)} %`)),
    )));
}

// Agrupa movimientos por una clave y suma sus importes, de mayor a menor.
function agrupar(movimientos, clave) {
  const grupos = new Map();
  for (const m of movimientos) {
    const k = clave(m);
    const g = grupos.get(k) ?? { nombre: k, total: 0, cuantos: 0 };
    g.total += m.monto;
    g.cuantos += 1;
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total);
}

/**
 * Ingresos y gastos acumulados día a día: dos líneas (azul ingresos, naranja gastos) con leyenda,
 * etiqueta al final de cada línea y una guía al pasar el dedo o el ratón que muestra los valores del día.
 */
function graficaAcumulada(movimientos, mes) {
  const [anio, numMes] = mes.split('-').map(Number);
  const diasMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const esActual = hoy().startsWith(mes);
  // En el mes en curso la línea llega hasta hoy; lo programado después no se dibuja como hecho.
  const ultimoDia = esActual ? Number(hoy().slice(8, 10)) : diasMes;
  const acumulado = (tipo) => {
    const porDia = Array(diasMes + 1).fill(0);
    for (const m of movimientos) if (m.tipo === tipo) porDia[Number(m.fecha.slice(8, 10))] += m.monto;
    const serie = [];
    let suma = 0;
    for (let d = 1; d <= ultimoDia; d += 1) {
      suma += porDia[d];
      serie.push(suma);
    }
    return serie;
  };
  const ingresos = acumulado('ingreso');
  const gastos = acumulado('gasto');
  const tope = Math.max(1, ...ingresos, ...gastos);
  // Escala «redonda» para las tres líneas guía.
  const paso = 10 ** Math.floor(Math.log10(tope));
  const maximo = Math.ceil(tope / paso) * paso;
  const x = (dia) => (diasMes === 1 ? 0 : ((dia - 1) / (diasMes - 1)) * 100);
  const y = (valor) => 100 - (valor / maximo) * 100;
  const trazo = (serie) => serie.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'linea-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = [0.5, 1].map((f) => `<line class="guia" x1="0" x2="100" y1="${y(maximo * f)}" y2="${y(maximo * f)}"/>`).join('')
    + `<line class="base" x1="0" x2="100" y1="100" y2="100"/>`
    + `<path class="serie-linea serie-ingreso" d="${trazo(ingresos)}"/>`
    + `<path class="serie-linea serie-gasto" d="${trazo(gastos)}"/>`;

  const ultimo = ultimoDia;
  const punto = (serie, clase) => h('span', { class: `punto-final ${clase}`, style: `left:${x(ultimo)}%;top:${y(serie[ultimo - 1])}%` });
  const guia = h('div', { class: 'linea-guia', hidden: true });
  const marcaI = h('span', { class: 'punto-guia serie-ingreso', hidden: true });
  const marcaG = h('span', { class: 'punto-guia serie-gasto', hidden: true });
  const tip = h('div', { class: 'tooltip', hidden: true, role: 'status' });
  const area = h('div', { class: 'linea-area' }, svg, punto(ingresos, 'serie-ingreso'), punto(gastos, 'serie-gasto'), guia, marcaI, marcaG, tip);

  // Guía al pasar el puntero: el día más cercano, con sus dos acumulados y lo de ese día.
  const mostrar = (ev) => {
    const caja = area.getBoundingClientRect();
    const fraccion = Math.min(Math.max((ev.clientX - caja.left) / caja.width, 0), 1);
    const dia = Math.min(Math.max(Math.round(fraccion * (diasMes - 1)) + 1, 1), ultimo);
    const i = dia - 1;
    const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
    const delDia = (tipo) => movimientos.filter((m) => m.fecha === fecha && m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
    for (const [el, serie] of [[marcaI, ingresos], [marcaG, gastos]]) {
      el.hidden = false;
      el.style.left = `${x(dia)}%`;
      el.style.top = `${y(serie[i])}%`;
    }
    guia.hidden = false;
    guia.style.left = `${x(dia)}%`;
    tip.hidden = false;
    tip.replaceChildren(
      h('strong', null, fechaTexto(fecha, { weekday: 'short', day: 'numeric', month: 'short' })),
      h('div', null, h('i', { class: 'muestra serie-ingreso' }), `Ingresos: ${dinero(ingresos[i])}`, delDia('ingreso') ? h('small', null, ` (+${dinero(delDia('ingreso'))} ese día)`) : null),
      h('div', null, h('i', { class: 'muestra serie-gasto' }), `Gastos: ${dinero(gastos[i])}`, delDia('gasto') ? h('small', null, ` (+${dinero(delDia('gasto'))} ese día)`) : null),
    );
    // El cuadro se pone al lado contrario del puntero para no taparlo.
    tip.style.left = fraccion > 0.55 ? 'auto' : `calc(${x(dia)}% + 12px)`;
    tip.style.right = fraccion > 0.55 ? `calc(${100 - x(dia)}% + 12px)` : 'auto';
  };
  const ocultar = () => [guia, marcaI, marcaG, tip].forEach((el) => { el.hidden = true; });
  area.addEventListener('pointermove', mostrar);
  area.addEventListener('pointerdown', mostrar);
  area.addEventListener('pointerleave', ocultar);

  const etiquetasX = [1, Math.ceil(diasMes / 2), diasMes].map((d) => h('span', { style: `left:${x(d)}%` }, fechaTexto(`${mes}-${String(d).padStart(2, '0')}`, { day: 'numeric', month: 'short' })));
  return h('div', { class: 'grafica-linea' },
    h('div', { class: 'leyenda' },
      h('span', null, h('i', { class: 'muestra serie-ingreso' }), 'Ingresos ', h('strong', null, dinero(ingresos.at(-1) ?? 0))),
      h('span', null, h('i', { class: 'muestra serie-gasto' }), 'Gastos ', h('strong', null, dinero(gastos.at(-1) ?? 0))),
    ),
    h('div', { class: 'linea-marco' },
      h('div', { class: 'eje-y' }, h('span', { style: 'top:0%' }, dinero(maximo)), h('span', { style: 'top:50%' }, dinero(maximo / 2)), h('span', { style: 'top:100%' }, dinero(0))),
      area,
    ),
    h('div', { class: 'eje-x' }, etiquetasX),
    esActual && ultimo < diasMes && h('p', { class: 'tenue nota-grafica' }, 'Hasta hoy. Lo programado para los próximos días está en «Pendientes».'),
  );
}

function seccionAnalisis(actual) {
  const gastos = actual.filter((m) => m.tipo === 'gasto');
  const ingresos = actual.filter((m) => m.tipo === 'ingreso');
  const t = totales(actual);
  const esActual = hoy().startsWith(estado.mes);
  const [anio, numMes] = estado.mes.split('-').map(Number);
  const dias = esActual ? Number(hoy().slice(8, 10)) : new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const hechosHastaHoy = gastos.filter((m) => !esActual || m.fecha <= hoy());
  const mayor = [...gastos].sort((a, b) => b.monto - a.monto)[0];
  const porDia = agrupar(hechosHastaHoy, (m) => m.fecha)[0];
  const tipo = estado.analisisTipo ?? 'gasto';
  const deTipo = tipo === 'gasto' ? gastos : ingresos;
  const cambiarTipo = (nuevo) => () => {
    estado.analisisTipo = nuevo;
    render(true);
  };
  const conmutador = h('div', { class: 'conmutador', role: 'group', 'aria-label': 'Ver gastos o ingresos' },
    ['gasto', 'ingreso'].map((v) => h('button', { type: 'button', class: tipo === v ? 'activo' : '', 'aria-pressed': String(tipo === v), onclick: cambiarTipo(v) }, v === 'gasto' ? 'Gastos' : 'Ingresos')));

  if (!actual.length) return h('section', { class: 'panel' }, h('p', { class: 'vacio' }, 'No hay movimientos este mes para mostrar gráficas.'));

  return h('div', { class: 'analisis' },
    h('div', { class: 'tarjetas datos' },
      dato('Gasto promedio por día', dinero(hechosHastaHoy.reduce((s, m) => s + m.monto, 0) / Math.max(dias, 1)), esActual ? `en los ${dias} días que van del mes` : `en ${dias} días`, 'pulso', 'gasto'),
      dato('Mayor gasto', mayor ? dinero(mayor.monto) : '—', mayor ? `${mayor.descripcion} · ${fechaCorta(mayor.fecha)}` : 'Sin gastos', 'alza', 'gasto'),
      dato('Día con más gasto', porDia ? fechaCorta(porDia.nombre) : '—', porDia ? `${dinero(porDia.total)} en ${porDia.cuantos} movimiento${porDia.cuantos === 1 ? '' : 's'}` : 'Sin gastos', 'calendario', 'gasto'),
      dato('Ahorro del mes', dinero(t.balance), t.ingresos > 0 ? (t.balance >= 0 ? `${porcentaje(t.balance, t.ingresos)} % de lo que entró` : 'Este mes sale más de lo que entra') : 'Sin ingresos este mes', 'billetera', t.balance >= 0 ? 'ingreso' : 'pendiente'),
    ),
    h('section', { class: 'panel' },
      h('header', null, h('h3', null, 'Cómo va el mes'), h('span', { class: 'tenue' }, 'ingresos y gastos acumulados día a día')),
      graficaAcumulada(actual, estado.mes),
    ),
    h('div', { class: 'dos-columnas' },
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, tipo === 'gasto' ? 'Gastos por categoría' : 'Ingresos por categoría'), h('span', { class: 'espacio' }), conmutador),
        barrasHorizontales(agrupar(deTipo, (m) => m.categoria || 'General'), { serie: tipo, vacio: tipo === 'gasto' ? 'Sin gastos este mes.' : 'Sin ingresos este mes.' }),
      ),
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, tipo === 'gasto' ? 'Gastos por medio de pago' : 'Ingresos por medio')),
        barrasHorizontales(
          agrupar(deTipo, (m) => (m.medio ? [NOMBRE_MEDIO_CORTO[m.medio], ['tarjeta', 'transferencia'].includes(m.medio) && m.entidad].filter(Boolean).join(' · ') : 'Sin indicar'))
            .map((f) => ({ ...f, icono: MEDIOS[Object.keys(NOMBRE_MEDIO_CORTO).find((k) => f.nombre.startsWith(NOMBRE_MEDIO_CORTO[k]))]?.icono })),
          { serie: tipo, vacio: 'Sin datos este mes.' },
        ),
      ),
    ),
  );
}

// Movimientos agrupados por día, del más reciente al más antiguo, con lo que entró y salió cada día.
function listaPorDia(movimientos, editar, textoVacio) {
  if (!movimientos.length) return h('p', { class: 'vacio' }, textoVacio);
  const dias = new Map();
  for (const m of [...movimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))) {
    if (!dias.has(m.fecha)) dias.set(m.fecha, []);
    dias.get(m.fecha).push(m);
  }
  const ayer = sumarDias(hoy(), -1);
  return h('div', { class: 'por-dia' },
    [...dias.entries()].map(([fecha, lista]) => {
      const suma = (tipo) => lista.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
      const titulo = fecha === hoy() ? 'Hoy' : fecha === ayer ? 'Ayer' : fechaTexto(fecha, { weekday: 'long', day: 'numeric', month: 'short' });
      return h('section', { class: 'grupo-dia' },
        h('header', { class: 'cabecera-dia' },
          h('strong', { class: 'capital' }, titulo),
          h('span', { class: 'totales-dia' },
            suma('ingreso') > 0 && h('span', { class: 'monto ingreso' }, `+${dinero(suma('ingreso'))}`),
            suma('gasto') > 0 && h('span', { class: 'monto gasto' }, `−${dinero(suma('gasto'))}`)),
        ),
        h('ul', { class: 'lista' }, lista.map((m) => filaMovimiento(m, editar))),
      );
    }),
  );
}

// ---------- vista: mes ----------

// Una sola petición trae el mes, el siguiente y los pendientes.
const cargarMes = () => api(`/libros/${estado.libroId}/mes?mes=${estado.mes}&hasta=${sumarDias(hoy(), 30)}`);

// Rejilla del mes: punto rojo si ese día hay un pago sin hacer, punto gris si hay otros movimientos.
function calendario(movimientos) {
  const porDia = new Map();
  for (const m of movimientos) {
    const dia = porDia.get(m.fecha) ?? { pendiente: false, otros: false, correo: false };
    if (m.tipo === 'gasto' && !m.pagado) dia.pendiente = true;
    else if (m.desdeCorreo) dia.correo = true;
    else dia.otros = true;
    porDia.set(m.fecha, dia);
  }

  const [anio, mes] = estado.mes.split('-').map(Number);
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  // La semana empieza en lunes: getUTCDay() da 0 para el domingo.
  const huecos = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;

  const celdas = DIAS_SEMANA.map((d) => h('div', { class: 'dia-semana', 'aria-hidden': 'true' }, d));
  for (let i = 0; i < huecos; i++) celdas.push(h('span'));
  for (let d = 1; d <= diasDelMes; d++) {
    const fecha = `${estado.mes}-${String(d).padStart(2, '0')}`;
    const info = porDia.get(fecha);
    const descripcion = [
      fechaTexto(fecha, { weekday: 'long', day: 'numeric', month: 'long' }),
      info?.pendiente && 'con pagos pendientes',
      info?.otros && 'con movimientos',
      info?.correo && 'con movimientos de tu correo',
    ].filter(Boolean).join(', ');
    celdas.push(
      h('button', {
        type: 'button',
        class: ['dia', fecha === hoy() && 'hoy', fecha === estado.dia && 'elegido'].filter(Boolean).join(' '),
        'aria-label': descripcion,
        'aria-pressed': String(fecha === estado.dia),
        onclick: () => {
          estado.dia = fecha;
          render(true);
        },
      },
        String(d),
        h('span', { class: 'puntos' },
          info?.pendiente && h('span', { class: 'punto rojo' }),
          info?.otros && h('span', { class: 'punto' }),
          info?.correo && h('span', { class: 'punto correo' }),
        ),
      ),
    );
  }

  return [
    h('div', { class: 'calendario' }, celdas),
    h('div', { class: 'leyenda' },
      h('span', null, h('span', { class: 'punto rojo' }), 'Pago pendiente'),
      h('span', null, h('span', { class: 'punto' }), 'Pagado o ingreso'),
      movimientos.some((m) => m.desdeCorreo) && h('span', null, h('span', { class: 'punto correo' }), 'Desde tu correo'),
    ),
  ];
}

function pintarMes({ actual, proximo, pendientes }) {
  const t = totales(actual);
  const tp = totales(proximo);
  const editar = puedeEditar();
  const siguiente = moverMes(estado.mes, 1);
  const mesActual = hoy().slice(0, 7);
  const delDia = estado.dia ? actual.filter((m) => m.fecha === estado.dia) : [];
  const esMesActual = estado.mes === mesActual;
  const sinPagar = actual.filter((m) => !m.pagado);
  // En el mes en curso, «pendientes» incluye lo vencido y los próximos 30 días; en otro mes, lo de ese mes.
  const pendientesVista = esMesActual ? pendientes : sinPagar;
  const mesCorto = nombreMes(estado.mes, { month: 'long' });
  const verDia = (dia) => () => {
    estado.dia = dia;
    render(true);
  };

  const secciones = {
    calendario: () =>
      h('div', { class: 'dos-columnas columnas-calendario' },
        h('section', { class: 'panel' },
          // El mes también se cambia desde aquí, sin subir al principio de la página.
          h('div', { class: 'nav-calendario' },
            h('button', { type: 'button', class: 'cuadrado', onclick: () => irAMes(moverMes(estado.mes, -1)), 'aria-label': 'Mes anterior' }, '‹'),
            h('strong', { class: 'capital' }, nombreMes(estado.mes)),
            h('button', { type: 'button', class: 'cuadrado', onclick: () => irAMes(siguiente), 'aria-label': 'Mes siguiente' }, '›'),
            !esMesActual && h('button', { type: 'button', class: 'mini', onclick: () => irAMes(mesActual) }, 'Hoy'),
          ),
          calendario(actual),
        ),
        // Movimientos del día o del mes: en PC, del mismo alto que el calendario y con la lista deslizable.
        h('section', { class: 'panel panel-dia' },
          estado.dia
            ? [
                h('header', null,
                  h('h3', null, fechaTexto(estado.dia, { weekday: 'long', day: 'numeric', month: 'long' })),
                  h('span', { class: 'espacio' }),
                  h('button', { type: 'button', class: 'mini', onclick: verDia(null) }, `Ver todo ${mesCorto}`)),
                filtroMedios(delDia),
                h('div', { class: 'lista-desliza' }, listaMovimientos(delDia.filter(pasaFiltroMedio), editar, 'No hay movimientos este día con ese filtro.')),
                editar && h('div', { class: 'pie-panel' },
                  h('button', { type: 'button', class: 'primario ancho', onclick: () => abrirMovimiento(null, estado.dia) }, '+ Añadir en este día')),
              ]
            : [
                // Sin día elegido se ve el mes entero: primero lo que falta por pagar o cobrar.
                h('header', null,
                  h('h3', null, `Pagos de ${mesCorto}`),
                  h('span', { class: 'tenue' }, sinPagar.length
                    ? `${sinPagar.length} ${sinPagar.length === 1 ? 'pendiente' : 'pendientes'} · ${dinero(t.gastosPendientes)} por pagar`
                    : actual.length ? 'todo al día' : '')),
                filtroMedios(actual),
                h('div', { class: 'lista-desliza' }, listaMovimientos([...sinPagar, ...actual.filter((m) => m.pagado)].filter(pasaFiltroMedio), editar, 'No hay movimientos este mes con ese filtro.')),
                h('p', { class: 'tenue pie-panel' }, 'Toca un día del calendario para ver solo los de esa fecha.'),
              ],
        ),
      ),
    pendientes: () =>
      h('section', { class: 'panel' },
        h('header', null,
          h('h3', null, 'Pagos y cobros pendientes'),
          h('span', { class: 'tenue' }, esMesActual ? 'vencidos y próximos 30 días' : `de ${nombreMes(estado.mes)}`)),
        listaMovimientos(pendientesVista, editar, esMesActual ? 'No hay nada pendiente. ¡Todo al día!' : `No hay nada pendiente en ${mesCorto}.`),
      ),
    movimientos: () =>
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Movimientos del mes'), h('span', { class: 'tenue' }, 'del más reciente al más antiguo')),
        filtroMedios(actual),
        listaPorDia(actual.filter(pasaFiltroMedio), editar, 'No hay movimientos este mes con ese filtro.'),
      ),
    analisis: () => seccionAnalisis(actual),
  };

  // Gastos de los últimos 7 días del mes (hasta hoy en el mes en curso), para la tarjeta principal.
  const finSemana = esMesActual ? hoy() : `${estado.mes}-${String(new Date(Date.UTC(Number(estado.mes.slice(0, 4)), Number(estado.mes.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(finSemana, i - 6)).map((fecha) => ({
    fecha,
    total: actual.filter((m) => m.tipo === 'gasto' && m.fecha === fecha).reduce((s, m) => s + m.monto, 0),
  }));
  const mayorSemana = Math.max(1, ...semana.map((d) => d.total));

  return [
    // En PC la tarjeta principal y las tres de totales van lado a lado; en tableta y teléfono, una debajo de otra.
    h('div', { class: 'cabecera-mes' },
    h('section', { class: 'heroe' },
      h('div', { class: 'heroe-nav' },
        h('button', { type: 'button', class: 'circulo', onclick: () => irAMes(moverMes(estado.mes, -1)), 'aria-label': 'Mes anterior' }, icono('flecha-izq')),
        h('div', { class: 'mes-pildora' }, icono('calendario'), h('h2', { class: 'capital', title: nombreMes(estado.mes) },
          h('span', { class: 'mes-largo' }, nombreMes(estado.mes)), h('span', { class: 'mes-corto' }, nombreMes(estado.mes, { month: 'short', year: 'numeric' })))),
        h('button', { type: 'button', class: 'circulo', onclick: () => irAMes(siguiente), 'aria-label': 'Mes siguiente' }, icono('flecha')),
        h('span', { class: 'espacio' }),
        estado.mes !== mesActual && h('button', { type: 'button', class: 'pildora-suave', onclick: () => irAMes(mesActual) }, 'Hoy'),
        h('button', { type: 'button', class: 'circulo', title: 'Descargar el informe de este mes en PDF', 'aria-label': 'Descargar PDF del mes', onclick: () => descargarPdf(...rangoDeMes(estado.mes)) }, icono('descargar')),
      ),
      h('div', { class: 'heroe-cuerpo' },
        h('div', { class: 'heroe-saldo' },
          h('span', { class: 'icono-caja grande' }, icono('billetera')),
          h('div', null,
            h('div', { class: 'heroe-monto' }, dinero(t.balance)),
            h('div', { class: `heroe-nota ${t.balance < 0 ? 'negativo' : 'positivo'}` },
              icono(t.balance < 0 ? 'salida' : 'entrada'),
              t.balance < 0 ? ' Balance del mes: gastas más de lo que entra' : ' Balance del mes: vas en positivo')),
          // Resumen de la gráfica de al lado (solo en PC, donde hay sitio debajo del balance).
          h('div', { class: 'heroe-resumen' },
            h('div', null, h('small', null, 'Gastos últimos 7 días'), h('strong', null, dinero(semana.reduce((s, d) => s + d.total, 0)))),
            h('div', null, h('small', null, 'Promedio por día'), h('strong', null, dinero(semana.reduce((s, d) => s + d.total, 0) / 7))),
            h('div', null, h('small', null, 'Día con más gasto'), h('strong', { class: 'capital' },
              Math.max(...semana.map((d) => d.total)) > 0 ? fechaTexto(semana.reduce((a, d) => (d.total > a.total ? d : a)).fecha, { weekday: 'long', day: 'numeric' }) : '—'))),
        ),
        h('div', { class: 'heroe-barras', role: 'img', 'aria-label': `Gastos de los últimos 7 días: ${semana.map((d) => `${fechaCorta(d.fecha)} ${dinero(d.total)}`).join(', ')}` },
          semana.map((d) => h('div', { class: `heroe-dia ${d.fecha === hoy() ? 'hoy' : ''} ${d.total > 0 && d.total === mayorSemana ? 'maximo' : ''}`, title: `${fechaTexto(d.fecha, { weekday: 'long', day: 'numeric', month: 'short' })}: ${dinero(d.total)}` },
            h('div', { class: 'heroe-pista' }, h('div', { class: 'heroe-barra', style: `height:${Math.max((d.total / mayorSemana) * 100, d.total ? 6 : 2)}%` })),
            h('small', null, fechaTexto(d.fecha, { weekday: 'narrow' })))),
          lineaSemana(semana, mayorSemana),
        ),
      ),
      editar && h('div', { class: 'heroe-acciones' },
        h('button', { type: 'button', class: 'pildora lima', onclick: () => abrirMovimiento(null, estado.dia, 'gasto') }, icono('salida'), h('span', { class: 'texto-largo' }, 'Añadir gasto'), h('span', { class: 'texto-corto' }, 'Gasto')),
        h('button', { type: 'button', class: 'pildora blanca', onclick: () => abrirMovimiento(null, estado.dia, 'ingreso') }, icono('entrada'), h('span', { class: 'texto-largo' }, 'Añadir ingreso'), h('span', { class: 'texto-corto' }, 'Ingreso')),
        h('button', { type: 'button', class: 'pildora captura', onclick: elegirCaptura, title: 'Sube la captura de «Movimientos» de Yape, Plin o del banco, una constancia o una boleta' },
          icono('imagen'), h('span', { class: 'texto-largo' }, 'Subir captura de Yape, Plin o del banco'), h('span', { class: 'texto-corto' }, 'Subir captura de Yape o banco')),
      ),
    ),

    h('div', { class: 'tarjetas tres con-balance' },
      tarjeta('Ingresos', dinero(t.ingresos), t.ingresosPendientes > 0 ? `${dinero(t.ingresos - t.ingresosPendientes)} recibido · ${dinero(t.ingresosPendientes)} por recibir` : 'Todo recibido',
        '', { icono: 'entrada', tono: 'ingreso', progreso: t.ingresos > 0 ? (t.ingresos - t.ingresosPendientes) / t.ingresos : 0 }),
      tarjeta('Gastos', dinero(t.gastos), `${dinero(t.gastos - t.gastosPendientes)} pagado · ${t.gastos > 0 ? Math.round(((t.gastos - t.gastosPendientes) / t.gastos) * 100) : 0} %`,
        '', { icono: 'salida', tono: 'gasto', progreso: t.gastos > 0 ? (t.gastos - t.gastosPendientes) / t.gastos : 0 }),
      tarjeta('Balance', dinero(t.balance),
        t.ingresos > 0 ? `Gastas el ${Math.round((t.gastos / t.ingresos) * 100)} % de lo que entra` : t.gastos > 0 ? 'Sin ingresos este mes' : 'Ingresos menos gastos',
        t.balance < 0 ? 'balance-negativo' : '', { icono: 'balanza', tono: 'balance' }),
      conInsignia(tarjeta('Falta por pagar', dinero(t.gastosPendientes), sinPagar.filter((m) => m.tipo === 'gasto').length ? `${sinPagar.filter((m) => m.tipo === 'gasto').length} pagos pendientes este mes` : 'Nada pendiente este mes',
        'clara', { icono: 'reloj', tono: 'pendiente' }), sinPagar.filter((m) => m.tipo === 'gasto').length),
    ),
    ),

    h('button', { type: 'button', class: 'tira', onclick: () => irAMes(siguiente), title: 'Ver el mes siguiente' },
      h('span', { class: 'icono-caja' }, icono('calendario')),
      h('span', { class: 'tira-titulo' }, h('small', null, 'Próximo mes'), h('strong', { class: 'capital' }, nombreMes(siguiente, { month: 'long' }))),
      h('span', { class: 'tira-datos' },
        h('span', { class: 'tira-dato' }, h('small', null, 'Ingresos'), h('b', null, dinero(tp.ingresos))),
        h('span', { class: 'tira-dato' }, h('small', null, 'Gastos'), h('b', null, dinero(tp.gastos))),
        h('span', { class: 'tira-dato' }, h('small', null, 'Balance'), h('b', { class: tp.balance < 0 ? 'negativo' : '' }, dinero(tp.balance)))),
      h('span', { class: 'flecha', 'aria-hidden': 'true' }, icono('flecha')),
    ),

    segmentos('mes', [
      ['calendario', 'Calendario'],
      ['pendientes', 'Pendientes', pendientesVista.length, true],
      ['movimientos', 'Movimientos', actual.length],
      ['analisis', 'Gráficas'],
    ]),
    secciones[estado.seccion.mes](),
  ];
}

// ---------- vista: año ----------

const cargarAnio = () => api(`/libros/${estado.libroId}/resumen?anio=${estado.anio}`);

function pintarAnio(r) {
  const t = r.totales;
  const maximo = Math.max(1, ...r.meses.flatMap((m) => [m.ingresos, m.gastos]));
  const claveMes = (m) => `${r.anio}-${String(m.mes).padStart(2, '0')}`;
  const irAAnio = (anio) => () => {
    estado.anio = anio;
    render();
  };
  const anioActual = Number(hoy().slice(0, 4));
  const signo = (n) => (n < 0 ? 'gasto' : '');

  const tablaCategorias = (titulo, lista, total) =>
    h('section', { class: 'panel' },
      h('header', null, h('h3', null, titulo)),
      lista.length === 0
        ? h('p', { class: 'vacio' }, 'Sin datos este año.')
        : h('table', null,
            h('tbody', null,
              lista.map((c) =>
                h('tr', null,
                  h('td', null, c.categoria, h('div', { class: 'barra-cat', style: `width:${(c.total / lista[0].total) * 100}%` })),
                  h('td', { class: 'monto' }, dinero(c.total)),
                  h('td', { class: 'monto tenue' }, `${Math.round((c.total / total) * 100)} %`),
                ),
              ),
            ),
          ),
    );

  const secciones = {
    grafica: () =>
      h('section', { class: 'panel' },
        h('header', null,
          h('h3', null, 'Ingresos y gastos por mes'),
          h('span', { class: 'espacio' }),
          h('div', { class: 'leyenda' },
            h('span', null, h('i', { class: 'trama-ingreso' }), 'Ingresos'),
            h('span', null, h('i', { class: 'trama-gasto' }), 'Gastos'),
          ),
        ),
        h('div', { class: 'grafica' },
          r.meses.map((m) =>
            h('button', {
              type: 'button',
              class: 'mes',
              onclick: () => irAMes(claveMes(m)),
              title: `${nombreMes(claveMes(m))}\nIngresos: ${dinero(m.ingresos)}\nGastos: ${dinero(m.gastos)}`,
            },
              h('div', { class: 'barras' },
                h('div', { class: 'columna trama-ingreso', style: `height:${(m.ingresos / maximo) * 100}%` }),
                h('div', { class: 'columna trama-gasto', style: `height:${(m.gastos / maximo) * 100}%` }),
              ),
              h('div', { class: 'nombre' }, nombreMes(claveMes(m), { month: 'short' }).replace('.', '')),
            ),
          ),
        ),
      ),
    meses: () =>
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Detalle por mes'), h('span', { class: 'tenue' }, 'toca un mes para abrirlo')),
        h('div', { class: 'tabla-scroll' },
          h('table', null,
            h('thead', null,
              h('tr', null,
                h('th', null, 'Mes'),
                h('th', { class: 'monto' }, 'Ingresos'),
                h('th', { class: 'monto' }, 'Gastos'),
                h('th', { class: 'monto ocultar-movil' }, 'Por pagar'),
                h('th', { class: 'monto' }, 'Balance'),
              ),
            ),
            h('tbody', null,
              r.meses.map((m) =>
                h('tr', { class: 'clic', onclick: () => irAMes(claveMes(m)) },
                  h('td', { class: 'capital' }, nombreMes(claveMes(m), { month: 'long' })),
                  h('td', { class: 'monto' }, dinero(m.ingresos)),
                  h('td', { class: 'monto' }, dinero(m.gastos)),
                  h('td', { class: 'monto ocultar-movil' }, dinero(m.gastosPendientes)),
                  h('td', { class: `monto ${signo(m.balance)}` }, dinero(m.balance)),
                ),
              ),
            ),
            h('tfoot', null,
              h('tr', null,
                h('td', null, `Total ${r.anio}`),
                h('td', { class: 'monto' }, dinero(t.ingresos)),
                h('td', { class: 'monto' }, dinero(t.gastos)),
                h('td', { class: 'monto ocultar-movil' }, dinero(t.gastosPendientes)),
                h('td', { class: 'monto' }, dinero(t.balance)),
              ),
            ),
          ),
        ),
      ),
    categorias: () =>
      h('div', { class: 'dos-columnas' },
        tablaCategorias('Gastos por categoría', r.categorias.filter((c) => c.tipo === 'gasto'), t.gastos),
        tablaCategorias('Ingresos por categoría', r.categorias.filter((c) => c.tipo === 'ingreso'), t.ingresos),
      ),
  };

  return [
    h('div', { class: 'periodo' },
      h('button', { type: 'button', class: 'cuadrado', onclick: irAAnio(r.anio - 1), 'aria-label': 'Año anterior' }, '‹'),
      h('h2', null, `Año ${r.anio}`),
      h('button', { type: 'button', class: 'cuadrado', onclick: irAAnio(r.anio + 1), 'aria-label': 'Año siguiente' }, '›'),
      r.anio !== anioActual && h('button', { type: 'button', onclick: irAAnio(anioActual) }, 'Este año'),
    ),

    h('div', { class: 'tarjetas' },
      tarjeta('Ingresos del año', dinero(t.ingresos), t.ingresosPendientes > 0 ? `${dinero(t.ingresosPendientes)} por recibir` : 'Todo recibido', '', { icono: 'entrada', tono: 'ingreso' }),
      tarjeta('Gastos del año', dinero(t.gastos), `${dinero(t.gastosPagados)} ya pagado`, '', { icono: 'salida', tono: 'gasto', progreso: t.gastos > 0 ? t.gastosPagados / t.gastos : 0 }),
      tarjeta('Balance del año', dinero(t.balance), 'Ingresos menos gastos', 'destacada', { icono: 'balanza' }),
      tarjeta('Falta por pagar', dinero(t.gastosPendientes), 'Gastos sin pagar del año', '', { icono: 'reloj', tono: 'pendiente' }),
    ),

    segmentos('anio', [['grafica', 'Gráfica'], ['meses', 'Por mes'], ['categorias', 'Categorías']]),
    secciones[estado.seccion.anio](),
  ];
}

// ---------- vista: informe en PDF ----------

// Primer y último día de un mes «AAAA-MM».
const rangoDeMes = (mes) => [`${mes}-01`, sumarDias(`${moverMes(mes, 1)}-01`, -1)];

const nombrePdf = (desde, hasta) => `gastos_${libroActual().nombre}_${desde}_a_${hasta}.pdf`;

async function pedirPdf(desde, hasta) {
  if (!desde || !hasta) throw new Error('Elige las dos fechas');
  const res = await fetch(`/api/libros/${estado.libroId}/informe.pdf?desde=${desde}&hasta=${hasta}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo generar el PDF');
  return res.blob();
}

function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = h('a', { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const descargarPdf = (desde, hasta) =>
  intentar(async () => {
    avisar('Generando el PDF…');
    guardarArchivo(await pedirPdf(desde, hasta), nombrePdf(desde, hasta));
    avisar('PDF descargado');
  });

// Abre el menú de compartir del dispositivo (correo, WhatsApp, Drive…) con el PDF adjunto.
const compartirPdf = (desde, hasta) =>
  intentar(async () => {
    avisar('Preparando el PDF…');
    const archivo = new File([await pedirPdf(desde, hasta)], nombrePdf(desde, hasta), { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [archivo] })) {
      guardarArchivo(archivo, archivo.name);
      avisar('Este dispositivo no permite compartir archivos: se descargó el PDF');
      return;
    }
    try {
      await navigator.share({ files: [archivo], title: `Estado de cuenta · ${libroActual().nombre}` });
    } catch (err) {
      // Cancelar el menú no es un error; cualquier otro fallo acaba en descarga.
      if (err.name !== 'AbortError') guardarArchivo(archivo, archivo.name);
    }
  });

function pintarInforme() {
  const mesHoy = hoy().slice(0, 7);
  const anio = hoy().slice(0, 4);
  const [desdeVisto, hastaVisto] = rangoDeMes(estado.mes);

  const rapido = (titulo, detalle, desde, hasta) =>
    h('button', { type: 'button', class: 'opcion', onclick: () => descargarPdf(desde, hasta) },
      h('strong', null, titulo),
      h('small', { class: 'capital' }, detalle),
    );
  const delMes = (titulo, mes) => rapido(titulo, nombreMes(mes), ...rangoDeMes(mes));

  const elegirFechas = (ev) => {
    ev.preventDefault();
    descargarPdf(ev.target.desde.value, ev.target.hasta.value);
  };

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Informe en PDF')),

    h('section', { class: 'panel' },
      h('header', null, h('h3', null, 'Descarga rápida'), h('span', { class: 'tenue' }, `libro «${libroActual().nombre}»`)),
      h('div', { class: 'opciones' },
        delMes('Mes pasado', moverMes(mesHoy, -1)),
        delMes('Este mes', mesHoy),
        delMes('Mes siguiente', moverMes(mesHoy, 1)),
        rapido('Todo el año', anio, `${anio}-01-01`, `${anio}-12-31`),
      ),
    ),

    h('section', { class: 'panel' },
      h('header', null, h('h3', null, 'Elegir fechas')),
      h('p', { class: 'tenue' }, 'Sirve para cualquier periodo: meses anteriores, el actual o fechas futuras con pagos programados.'),
      h('form', { class: 'form-linea', onsubmit: elegirFechas },
        h('label', null, 'Desde', h('input', { name: 'desde', type: 'date', required: true, value: desdeVisto })),
        h('label', null, 'Hasta', h('input', { name: 'hasta', type: 'date', required: true, value: hastaVisto })),
        h('button', { class: 'primario' }, 'Descargar PDF'),
      ),
    ),

    h('p', { class: 'tenue' }, 'El PDF incluye el resumen del periodo y la lista completa de gastos e ingresos, con su fecha, categoría, estado y monto.'),
  ];
}

// ---------- vista: compartir ----------

async function cargarCompartir() {
  const [{ miembros }, canales] = await Promise.all([api(`/libros/${estado.libroId}/miembros`), api('/canales')]);
  return { miembros, canales };
}

// Periodo elegido para enviar el estado de cuenta: [desde, hasta].
function periodoDeEnvio() {
  const mesHoy = hoy().slice(0, 7);
  const anio = hoy().slice(0, 4);
  const e = estado.envio;
  return {
    mes: rangoDeMes(mesHoy),
    pasado: rangoDeMes(moverMes(mesHoy, -1)),
    siguiente: rangoDeMes(moverMes(mesHoy, 1)),
    anio: [`${anio}-01-01`, `${anio}-12-31`],
    fechas: [e.desde, e.hasta],
  }[e.periodo];
}

function pintarCompartir({ miembros, canales }) {
  const libro = libroActual();
  const base = `/libros/${libro.id}`;
  const soyPropietario = libro.rol === 'propietario';
  const mesHoy = hoy().slice(0, 7);
  const envio = estado.envio;

  const enviarPor = (canal, extra = {}) =>
    intentar(async () => {
      const [desde, hasta] = periodoDeEnvio();
      if (!desde || !hasta) throw new Error('Elige las dos fechas');
      avisar('Enviando…');
      const { destino } = await api(`${base}/enviar`, { method: 'POST', body: { canal, desde, hasta, ...extra } });
      avisar(`Estado de cuenta enviado a ${destino}`);
    });

  const enviarCorreo = (ev) => {
    ev.preventDefault();
    enviarPor('correo', { para: ev.target.para.value });
  };

  const sinWhatsapp = !canales.whatsapp
    ? 'El bot de WhatsApp no está conectado ahora.'
    : !canales.miWhatsapp
      ? 'Añade tu número en «Mi cuenta» para recibirlo por WhatsApp.'
      : '';

  const cambiarRol = (miembro, rol) =>
    intentar(async () => {
      await api(`${base}/miembros/${miembro.id}`, { method: 'PATCH', body: { rol } });
      avisar(`${miembro.nombre}: ${ROLES[rol].toLowerCase()}`);
    });

  const quitar = (miembro) =>
    intentar(async () => {
      const esYo = miembro.id === estado.usuario.id;
      const pregunta = esYo ? `¿Salir del libro «${libro.nombre}»?` : `¿Quitar el acceso de ${miembro.nombre}?`;
      if (!confirm(pregunta)) return;
      await api(`${base}/miembros/${miembro.id}`, { method: 'DELETE' });
      if (esYo) await cargarLibros();
      render();
    });

  const invitar = (ev) => {
    ev.preventDefault();
    const form = ev.target;
    intentar(async () => {
      const { miembro } = await api(`${base}/miembros`, {
        method: 'POST',
        body: { email: form.email.value, rol: form.rol.value },
      });
      avisar(`${miembro.nombre} ya puede ver este libro`);
      render();
    });
  };

  const eliminarLibro = () =>
    intentar(async () => {
      if (!confirm(`¿Eliminar el libro «${libro.nombre}» y TODOS sus movimientos? No se puede deshacer.`)) return;
      await api(base, { method: 'DELETE' });
      estado.libroId = null;
      await cargarLibros();
      render();
    });

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Compartir')),

    h('section', { class: 'panel' },
      h('header', null, h('h3', null, 'Enviar el estado de cuenta'), h('span', { class: 'tenue' }, `libro «${libro.nombre}»`)),
      h('div', { class: 'form-linea' },
        h('label', null, 'Periodo',
          h('select', {
            'aria-label': 'Periodo del estado de cuenta',
            onchange: (ev) => {
              envio.periodo = ev.target.value;
              render(true);
            },
          },
            [
              ['mes', `Este mes · ${nombreMes(mesHoy)}`],
              ['pasado', `Mes pasado · ${nombreMes(moverMes(mesHoy, -1))}`],
              ['siguiente', `Mes siguiente · ${nombreMes(moverMes(mesHoy, 1))}`],
              ['anio', `Todo el año ${mesHoy.slice(0, 4)}`],
              ['fechas', 'Elegir fechas…'],
            ].map(([valor, etiqueta]) => h('option', { value: valor, selected: valor === envio.periodo }, etiqueta)),
          )),
        envio.periodo === 'fechas' && [
          h('label', { class: 'corto' }, 'Desde', h('input', { type: 'date', value: envio.desde, onchange: (ev) => (envio.desde = ev.target.value) })),
          h('label', { class: 'corto' }, 'Hasta', h('input', { type: 'date', value: envio.hasta, onchange: (ev) => (envio.hasta = ev.target.value) })),
        ],
      ),

      h('div', { class: 'opciones envio' },
        h('button', { type: 'button', class: 'opcion', disabled: Boolean(sinWhatsapp), onclick: () => enviarPor('whatsapp') },
          h('strong', null, 'A mi WhatsApp'),
          h('small', null, sinWhatsapp || `El bot lo envía a +${canales.miWhatsapp}`)),
        h('button', { type: 'button', class: 'opcion', onclick: () => compartirPdf(...periodoDeEnvio()) },
          h('strong', null, 'Compartir…'),
          h('small', null, 'Con las apps de este dispositivo')),
        h('button', { type: 'button', class: 'opcion', onclick: () => descargarPdf(...periodoDeEnvio()) },
          h('strong', null, 'Descargar PDF'),
          h('small', null, 'Guardarlo en este dispositivo')),
      ),

      h('form', { class: 'form-linea', onsubmit: enviarCorreo },
        h('label', null, 'Enviar por correo a',
          h('input', { name: 'para', type: 'email', required: true, value: canales.miCorreo, disabled: !canales.correo })),
        h('button', { class: 'primario', disabled: !canales.correo }, 'Enviar por correo'),
      ),
      !canales.correo && h('p', { class: 'tenue nota-repetir' },
        'El envío por correo aún no está configurado en el servidor. Mientras tanto, usa «Compartir…» y elige tu app de correo.'),
      h('p', { class: 'tenue pie-panel' }, 'Se envía un resumen del periodo y el PDF con la lista completa de gastos e ingresos.'),
    ),

    h('section', { class: 'panel' },
      h('header', null,
        h('h3', null, `Quién ve «${libro.nombre}»`),
        h('span', { class: 'tenue' }, `Moneda: ${libro.moneda} · Tu acceso: ${ROLES[libro.rol].toLowerCase()}`),
        h('span', { class: 'espacio' }),
        soyPropietario && h('button', { type: 'button', class: 'mini', onclick: () => abrirLibro(libro) }, 'Editar'),
        soyPropietario && h('button', { type: 'button', class: 'mini peligro', onclick: eliminarLibro }, 'Eliminar libro'),
      ),
      h('div', { class: 'tabla-scroll' },
        h('table', { class: 'tabla-miembros' },
          h('thead', null, h('tr', null, h('th', null, 'Persona'), h('th', null, 'Acceso'), h('th', null))),
          h('tbody', null,
            miembros.map((m) =>
              h('tr', null,
                h('td', null, m.nombre, m.id === estado.usuario.id && ' (tú)', h('div', { class: 'tenue correo' }, m.email)),
                h('td', null,
                  soyPropietario && m.rol !== 'propietario'
                    ? h('select', { 'aria-label': `Acceso de ${m.nombre}`, onchange: (ev) => cambiarRol(m, ev.target.value) },
                        h('option', { value: 'lector', selected: m.rol === 'lector' }, ROLES.lector),
                        h('option', { value: 'editor', selected: m.rol === 'editor' }, ROLES.editor),
                      )
                    : ROLES[m.rol],
                ),
                h('td', { class: 'acciones-fila' },
                  m.rol !== 'propietario' && (soyPropietario || m.id === estado.usuario.id) &&
                    h('button', { type: 'button', class: 'mini peligro', onclick: () => quitar(m) },
                      m.id === estado.usuario.id ? 'Salir del libro' : 'Quitar'),
                ),
              ),
            ),
          ),
        ),
      ),
    ),

    soyPropietario
      ? h('section', { class: 'panel' },
          h('header', null, h('h3', null, 'Invitar a alguien')),
          h('p', { class: 'tenue' }, 'La otra persona debe tener ya una cuenta. Escribe el correo con el que se registró.'),
          h('form', { class: 'form-linea', onsubmit: invitar },
            h('label', null, 'Correo', h('input', { name: 'email', type: 'email', required: true })),
            h('label', { class: 'corto' }, 'Acceso',
              h('select', { name: 'rol' },
                h('option', { value: 'lector' }, ROLES.lector),
                h('option', { value: 'editor' }, ROLES.editor),
              ),
            ),
            h('button', { class: 'primario' }, 'Compartir'),
          ),
        )
      : h('p', { class: 'tenue' }, 'Solo el propietario puede invitar a más personas o cambiar permisos.'),
  ];
}

// ---------- vista: mi cuenta ----------

// Cabecera de cada tarjeta de «Mi cuenta»: icono, título corto y una línea de explicación.
const cabeceraCuenta = (nombreIcono, titulo, sub, extra = null) => h('header', { class: 'cuenta-cabecera' },
  h('span', { class: 'icono-caja' }, icono(nombreIcono)),
  h('div', null, h('h3', null, titulo), sub && h('p', { class: 'tenue' }, sub)),
  extra);

function pintarCuenta() {
  const u = estado.usuario;
  const guardar = (ev) => {
    ev.preventDefault();
    const form = ev.target;
    intentar(async () => {
      const { usuario } = await api('/auth/yo', { method: 'PATCH', body: { nombre: form.nombre.value, whatsapp: form.whatsapp.value } });
      estado.usuario = usuario;
      $('#usuario').textContent = `${usuario.nombre} · ${usuario.email}`;
      avisar('Datos guardados');
      render();
    });
  };

  // Todos los Gmail vinculados (el principal primero). Se puede añadir hasta MAX_CORREOS.
  const MAX_CORREOS = 5;
  const correos = u.correos ?? (u.gmail ? [{ cuenta: 'principal', ...u.gmail }] : []);
  const varios = correos.length > 1;
  const cuando = (fecha) => (fecha ? new Date(fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'todavía no');
  const vincular = () => location.assign('/api/auth/google?modo=gmail');
  const actualizar = (usuario) => {
    estado.usuario = usuario;
    render();
  };
  const revisar = () => intentar(async () => {
    avisar('Revisando tu correo…');
    const { nuevos, usuario } = await api('/auth/google/gmail/revisar', { method: 'POST' });
    actualizar(usuario);
    const conError = (usuario.correos ?? []).find((c) => c.error);
    avisar(nuevos
      ? `${nuevos} movimiento${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'} registrado${nuevos === 1 ? '' : 's'}`
      : conError ? `${varios ? `${conError.email}: ` : ''}${conError.error}` : 'No hay gastos nuevos en tu correo');
  });
  const pausar = (c) => intentar(async () => actualizar((await api('/auth/google/gmail', { method: 'PATCH', body: { cuenta: c.cuenta, activo: !c.activo } })).usuario));
  const desvincular = (c) => {
    if (!confirm(`¿Dejar de leer ${c.email}? Los gastos ya registrados se quedan en tu libro.`)) return;
    intentar(async () => {
      actualizar((await api(`/auth/google/gmail?cuenta=${encodeURIComponent(c.cuenta)}`, { method: 'DELETE' })).usuario);
      avisar(`${c.email} desvinculado`);
    });
  };

  const escanear = (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const meses = form.meses.value;
    const cuerpo = meses === 'fechas' ? { meses, desde: form.desde.value, hasta: form.hasta.value } : { meses };
    if (meses === 'fechas' && (!cuerpo.desde || !cuerpo.hasta)) return avisar('Elige la fecha de inicio y la de fin.');
    if (meses === 'fechas' && cuerpo.desde > cuerpo.hasta) return avisar('La fecha de inicio debe ser anterior a la de fin.');
    intentar(async () => {
      const { mensaje, usuario } = await api('/auth/google/gmail/escanear', { method: 'POST', body: cuerpo });
      actualizar(usuario);
      avisar(mensaje);
    });
  };
  const detenerEscaneo = () => intentar(async () => {
    const { mensaje } = await api('/auth/google/gmail/escanear', { method: 'DELETE' });
    avisar(mensaje);
  });
  const recargarCuenta = () => intentar(async () => actualizar((await api('/auth/yo')).usuario));
  const fechaDe = (f) => new Date(f).toLocaleDateString('es', { timeZone: 'UTC' });
  const textoEscaneo = (e) => (e.estado === 'en curso'
    ? `⏳ Revisando tus correos ${e.desde.startsWith('2004-01-01') ? 'de todo tu Gmail' : `del ${fechaDe(e.desde)} al ${fechaDe(e.hasta)}`}: ${e.porLeer == null ? 'buscando tus avisos en Gmail…' : e.porLeer === 0 ? 'no hay avisos nuevos que leer, terminando…' : `leyendo con la IA el aviso ${Math.min(e.leidos + 1, e.porLeer)} de ${e.porLeer} (cada uno tarda unos segundos)…`} Van ${e.revisados} revisados y ${e.registrados} movimientos registrados${e.yaVistos ? ` (${e.yaVistos} ${e.releido ? 'ya estaban registrados' : 'ya se habían revisado antes'})` : ''}. Se actualiza solo.`
    : e.estado === 'error'
      ? `La última revisión de correos anteriores falló: ${e.error}`
      : `✅ Última revisión de correos anteriores (del ${fechaDe(e.desde)} al ${fechaDe(e.hasta)}): ${e.revisados} correos ${e.releido ? '' : 'nuevos '}revisados, ${e.registrados} movimientos registrados${e.duplicados ? `, ${e.duplicados} ya estaban anotados` : ''}.${e.yaVistos ? (e.releido ? ` Otros ${e.yaVistos} avisos de ese periodo ya estaban registrados en tu libro.` : ` Otros ${e.yaVistos} avisos de ese periodo ya los había revisado la sincronización automática: mira qué se hizo con cada uno en «Correos revisados».`) : ''}${e.quedan ? ' Quedan más correos en ese periodo: vuelve a escanear para seguir.' : ''}`);
  const escaneando = correos.some((c) => c.escaneo?.estado === 'en curso');
  // Mientras escanea, el progreso se recarga solo cada pocos segundos (sin pulsar nada).
  clearTimeout(temporizadorEscaneo);
  if (escaneando) {
    temporizadorEscaneo = setTimeout(async () => {
      if (estado.vista !== 'cuenta' || document.hidden) return;
      try {
        const { usuario } = await api('/auth/yo');
        // Si se está escribiendo en un campo, no se redibuja para no borrar lo escrito.
        if (estado.vista === 'cuenta' && !document.activeElement?.matches('input, select, textarea')) actualizar(usuario);
      } catch {
        // Sin conexión: se volverá a intentar al pulsar «Actualizar progreso».
      }
    }, 5000);
  }

  const seccionEscaneo = correos.length > 0 && h('div', { class: 'escaneo' },
    h('h4', null, 'Correos anteriores'),
    h('p', { class: 'tenue nota' }, 'Registra los avisos que ya tienes en el correo. No se duplican.'),
    correos.filter((c) => c.escaneo).map((c) => h('p', { class: c.escaneo.estado === 'error' ? 'error' : null }, varios ? h('strong', null, `${c.email}: `) : null, textoEscaneo(c.escaneo))),
    escaneando
      ? h('div', { class: 'acciones' },
          h('button', { type: 'button', onclick: recargarCuenta }, 'Actualizar progreso'),
          h('button', { type: 'button', class: 'peligro', onclick: detenerEscaneo }, 'Detener'),
        )
      : h('form', { class: 'form-linea', onsubmit: escanear },
          h('label', null, 'Periodo',
            h('select', {
              name: 'meses',
              // «Elegir fechas…» muestra las casillas de inicio y fin.
              onchange: (ev) => {
                const elegir = ev.target.value === 'fechas';
                for (const campo of ev.target.form.querySelectorAll('.solo-fechas')) campo.hidden = !elegir;
              },
            },
              h('option', { value: '1' }, 'Último mes'),
              h('option', { value: '3' }, 'Últimos 3 meses'),
              h('option', { value: '6' }, 'Últimos 6 meses'),
              h('option', { value: '12' }, 'Último año'),
              h('option', { value: '24' }, 'Últimos 2 años'),
              h('option', { value: 'todo' }, 'Todo mi correo'),
              h('option', { value: 'fechas' }, 'Elegir fechas…'),
            )),
          h('label', { class: 'solo-fechas', hidden: true }, 'Desde', h('input', { type: 'date', name: 'desde', min: '2004-01-01', max: hoy() })),
          h('label', { class: 'solo-fechas', hidden: true }, 'Hasta', h('input', { type: 'date', name: 'hasta', min: '2004-01-01', max: hoy(), value: hoy() })),
          h('button', { class: 'primario' }, varios ? 'Escanear todos mis correos' : 'Escanear correos'),
        ),
  );

  // Qué se hizo con cada correo revisado en la última semana, para entender por qué un aviso no aparece.
  const seccionRevisados = () => {
    const lista = h('div', { class: 'revisados' });
    const cargar = () => intentar(async () => {
      revisadosAbiertos = true;
      const { correos: revisados } = await api('/auth/google/gmail/revisados');
      lista.replaceChildren(revisados.length
        ? h('ul', null, revisados.map((c) => h('li', { class: c.registrado ? 'ok' : null },
            h('div', null, h('strong', null, c.asunto || '(sin asunto)'), h('span', { class: 'tenue' }, ` · ${c.remitente.replace(/<.*>/, '').replace(/"/g, '').trim()}${varios && c.buzon ? ` → ${c.buzon}` : ''} · ${cuando(c.cuando)}`)),
            h('div', { class: 'tenue' }, c.resultado || '—'),
            !c.registrado && h('button', { type: 'button', onclick: () => reintentar(c.id) }, 'Volver a revisar'),
          )))
        : h('p', { class: 'tenue' }, 'Todavía no se ha revisado ningún correo esta semana.'));
    });
    const reintentar = (id) => intentar(async () => {
      avisar('Revisando ese correo…');
      const { nuevos, resultado } = await api(`/auth/google/gmail/revisados/${encodeURIComponent(id)}/reintentar`, { method: 'POST' });
      avisar(nuevos ? 'Registrado: ya está en tu calendario' : resultado || 'No se registró nada');
      cargar();
    });
    if (revisadosAbiertos) cargar();
    return h('div', { class: 'escaneo' },
      h('h4', null, 'Correos revisados'),
      h('p', { class: 'tenue nota' }, 'Qué se hizo con cada aviso de la última semana.'),
      h('button', { type: 'button', onclick: cargar }, 'Ver correos revisados'),
      lista,
    );
  };

  // Una tarjeta por cada Gmail vinculado, con su estado y sus botones.
  const tarjetaCorreo = (c) => {
    // Sin permiso de Google: hay que volver a vincular ese mismo correo.
    const sinPermiso = /retir[oó] el permiso|vuelve a vincular/i.test(c.error);
    return h('div', { class: 'cuenta-correo' },
      h('div', { class: 'cuenta-correo-cabecera' },
        h('strong', null, c.email),
        h('span', { class: `etiqueta ${c.activo ? 'ok' : ''}` }, c.activo ? 'Activo' : sinPermiso ? 'Sin permiso' : 'En pausa'),
      ),
      c.error && h('p', { class: 'error' }, c.error),
      h('p', { class: 'tenue nota' }, `Revisado: ${cuando(c.ultimaRevision)} · ${c.registrados} registrados`),
      h('div', { class: 'acciones' },
        sinPermiso
          ? h('button', { type: 'button', class: 'primario', onclick: vincular }, 'Volver a vincular')
          : h('button', { type: 'button', onclick: () => pausar(c) }, c.activo ? 'Pausar' : 'Reanudar'),
        h('button', { type: 'button', class: 'peligro', onclick: () => desvincular(c) }, 'Desvincular'),
      ),
    );
  };

  const seccionGmail = googleDisponible && h('section', { class: 'panel cuenta-tarjeta ancha' },
    cabeceraCuenta('correo', 'Gastos desde tu Gmail', 'Registra solos los avisos de bancos, Yape, tiendas y apps.', varios && h('span', { class: 'estado-chip' }, `${correos.length} correos`)),
    correos.length
      ? [
          correos.some((c) => c.activo) && h('p', { class: 'sincronizacion' }, icono('sincronizar'), ` Automático cada ${minutosGmail} min. Los verás con `, icono('correo', 'el icono de correo'), '.'),
          correos.map(tarjetaCorreo),
          h('div', { class: 'acciones' },
            correos.some((c) => c.activo) && h('button', { type: 'button', class: 'primario', onclick: revisar }, 'Revisar ahora'),
            correos.length < MAX_CORREOS && h('button', { type: 'button', onclick: vincular }, '+ Añadir otro correo'),
          ),
          correos.length < MAX_CORREOS && h('p', { class: 'tenue nota' }, `Hasta ${MAX_CORREOS} cuentas de Gmail.`),
          seccionEscaneo,
          seccionRevisados(),
        ]
      : [
          h('p', { class: 'tenue nota' }, 'Solo se leen avisos de compras y pagos. Nunca se envía ni se borra nada.'),
          h('button', { type: 'button', class: 'primario', onclick: vincular }, 'Vincular con Google'),
        ],
  );

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Mi cuenta')),
    h('div', { class: 'cuenta-grid' },
      h('section', { class: 'panel cuenta-tarjeta ancha' },
        cabeceraCuenta('billetera', 'Tus datos', 'El bot de WhatsApp te reconoce por tu número.'),
        h('form', { class: 'form-cuenta form-perfil', onsubmit: guardar },
          h('label', null, 'Nombre', h('input', { name: 'nombre', maxLength: 60, required: true, value: u.nombre })),
          h('label', null, 'Correo', h('input', { value: u.email, disabled: true })),
          h('label', null, 'WhatsApp',
            h('input', { name: 'whatsapp', type: 'tel', maxLength: 24, placeholder: '+51 987 654 321', value: u.whatsapp ? `+${u.whatsapp}` : '' })),
          h('button', { class: 'primario' }, 'Guardar'),
        ),
        !u.tienePassword && h('p', { class: 'tenue nota' }, 'Entras con Google. Para usar contraseña: «¿Olvidaste tu contraseña?» al entrar.'),
      ),
      seccionRecordatorios(),
      seccionApp(),
      seccionGmail,
      seccionAvisosTelefono(),
    ),
  ];
}

// Yape, Plin y avisos del banco desde el teléfono: un enlace personal al que el teléfono reenvía cada
// notificación (Android) o la captura de la constancia (iPhone). El enlace se pide solo al abrir la sección.
function seccionAvisosTelefono() {
  const zona = h('div');
  const pintar = (enlace) => {
    const copiar = () => intentar(async () => {
      await navigator.clipboard.writeText(enlace);
      avisar('Enlace copiado');
    });
    const crear = (cambiar) => intentar(async () => {
      if (cambiar && !confirm('El enlace actual dejará de funcionar y tendrás que pegar el nuevo en tu teléfono. ¿Cambiarlo?')) return;
      pintar((await api('/avisos/enlace', { method: 'POST' })).enlace);
    });
    zona.replaceChildren(enlace
      ? h('div', null,
          h('div', { class: 'form-cuenta enlace-fila' },
            h('label', null, 'Tu enlace personal (no lo compartas)', h('input', { value: enlace, readOnly: true, onfocus: (ev) => ev.target.select() })),
            h('div', { class: 'botones-fila' },
              h('button', { type: 'button', class: 'primario', onclick: copiar }, 'Copiar'),
              h('button', { type: 'button', onclick: () => crear(true) }, 'Cambiar'))),
          h('details', { class: 'instrucciones' },
            h('summary', null, 'Android: automático con MacroDroid'),
            h('ol', null,
              h('li', null, 'Instala MacroDroid y crea una macro.'),
              h('li', null, 'Disparador: Notificación recibida → Yape (y Plin o tu banco).'),
              h('li', null, 'Acción: Solicitud HTTP · POST · URL: tu enlace · Cuerpo JSON: {"titulo":"[notification_title]","texto":"[notification]","app":"[app_name]"}'),
              h('li', null, 'Dale permiso de notificaciones y haz un yape de prueba.'),
            ),
          ),
          h('details', { class: 'instrucciones', open: esIOS },
            h('summary', null, 'iPhone: dos toques en la parte de atrás'),
            h('p', { class: 'tenue nota' }, 'Registra todos los pagos de «Movimientos» de Yape, también los pequeños.'),
            h('button', { type: 'button', class: 'primario', onclick: abrirTutorialAtajo }, 'Ver tutorial'),
          ),
        )
      : h('div', null,
          h('button', { type: 'button', class: 'primario', onclick: () => crear(false) }, 'Crear mi enlace'),
        ));
  };
  api('/avisos/enlace').then(({ enlace }) => pintar(enlace)).catch(() => zona.replaceChildren(h('p', { class: 'tenue' }, 'No se pudo cargar tu enlace. Recarga la página.')));
  return h('section', { class: 'panel cuenta-tarjeta ancha' },
    cabeceraCuenta('movil', 'Yape, Plin y avisos del teléfono', 'Registra los yapes que no llegan por correo, sin duplicar.'),
    zona,
  );
}

// ---------- vista: asistente de IA ----------

// Conversación de esta sesión: { de: 'yo' | 'ia', texto, pdfs?, error? }.
// La IA recuerda los últimos turnos en el servidor y los comparte con el bot de WhatsApp.
const chat = [];
let esperandoIa = false;

const SUGERENCIAS = [
  '¿Cuánto gasté este mes?',
  '¿Cuánto gasté el mes pasado?',
  'Compara mis gastos de los últimos 6 meses',
  'Analiza mis gastos del correo',
  'Escanea todos mis correos',
  '¿En qué categoría gasto más?',
  '¿Qué pagos tengo pendientes?',
  'Mándame el resumen del mes por WhatsApp',
  'Dame el PDF de este mes',
];

// Pinta *negrita* (el formato de WhatsApp que usa la IA) sin interpretar HTML.
const conNegritas = (texto) => texto.split(/(\*[^*\n]+\*)/).map((trozo) => (/^\*[^*\n]+\*$/.test(trozo) ? h('b', null, trozo.slice(1, -1)) : trozo));

function burbuja(mensaje, puedeWhatsapp) {
  if (mensaje.de === 'yo') return h('div', { class: 'burbuja yo' }, mensaje.texto);
  if (mensaje.pensando) return h('div', { class: 'burbuja ia tenue' }, 'Pensando…');
  const enviarWhatsapp = () => intentar(async () => {
    await api('/ia/whatsapp', { method: 'POST', body: { texto: mensaje.texto } });
    avisar('Enviado a tu WhatsApp');
  });
  return h('div', { class: `burbuja ia${mensaje.error ? ' con-error' : ''}` },
    h('div', null, ...conNegritas(mensaje.texto)),
    !mensaje.error && h('div', { class: 'burbuja-acciones' },
      ...(mensaje.pdfs ?? []).map((pdf) => h('button', {
        type: 'button',
        class: 'mini',
        onclick: () => {
          const bytes = Uint8Array.from(atob(pdf.datos), (c) => c.charCodeAt(0));
          guardarArchivo(new Blob([bytes], { type: 'application/pdf' }), pdf.nombre);
        },
      }, `Descargar ${pdf.nombre}`)),
      puedeWhatsapp && !mensaje.enviadoWhatsapp && h('button', { type: 'button', class: 'mini', onclick: enviarWhatsapp }, 'Enviar por WhatsApp'),
    ),
  );
}

function pintarAsistente(datos) {
  if (!datos.disponible) {
    return [
      h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Asistente IA')),
      h('section', { class: 'panel' },
        h('p', null, 'La IA no está activada todavía.'),
        h('p', { class: 'tenue' }, estado.usuario.esAdmin
          ? 'Actívala en Admin → IA: elige Claude o NVIDIA, guarda la clave y marca «Activar».'
          : 'Pide al administrador que la active.'),
      ),
    ];
  }

  const pintarLista = () => {
    const lista = $('#chat-lista');
    if (!lista) return;
    lista.replaceChildren(...(chat.length
      ? chat.map((m) => burbuja(m, datos.whatsapp))
      : [h('p', { class: 'vacio' }, 'Pregúntame por tus gastos, pídeme un análisis de lo que te llega por correo o que te mande un informe por WhatsApp.')]));
    lista.scrollTop = lista.scrollHeight;
  };

  const enviar = async (texto) => {
    texto = texto.trim();
    if (!texto || esperandoIa) return;
    esperandoIa = true;
    chat.push({ de: 'yo', texto });
    const pensando = { de: 'ia', pensando: true };
    chat.push(pensando);
    pintarLista();
    try {
      const r = await api('/ia/chat', { method: 'POST', body: { mensaje: texto, libroId: estado.libroId } });
      Object.assign(pensando, { pensando: false, texto: r.texto || 'Hecho.', pdfs: r.pdfs, enviadoWhatsapp: r.enviadoWhatsapp });
      // Si registró o borró algo, los datos de las otras vistas ya no valen.
      datosRecordados.clear();
    } catch (err) {
      Object.assign(pensando, { pensando: false, texto: err.message, error: true });
    } finally {
      esperandoIa = false;
      pintarLista();
    }
  };

  const alEnviar = (ev) => {
    ev.preventDefault();
    const campo = ev.target.mensaje;
    const texto = campo.value;
    campo.value = '';
    enviar(texto);
    campo.focus();
  };

  // La lista se pinta cuando ya está en la página.
  queueMicrotask(pintarLista);

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Asistente IA')),
    h('section', { class: 'panel chat-panel' },
      h('div', { id: 'chat-lista', class: 'chat-lista', 'aria-live': 'polite' }),
      h('div', { class: 'sugerencias' },
        ...SUGERENCIAS
          .filter((s) => datos.whatsapp || !s.includes('WhatsApp'))
          .map((s) => h('button', { type: 'button', class: 'mini', onclick: () => enviar(s) }, s)),
      ),
      h('form', { class: 'chat-form', onsubmit: alEnviar },
        h('input', { name: 'mensaje', maxLength: 1000, autocomplete: 'off', placeholder: 'Escribe tu pregunta…', 'aria-label': 'Mensaje para el asistente' }),
        h('button', { class: 'primario' }, 'Enviar'),
      ),
    ),
    h('p', { class: 'tenue' },
      datos.whatsapp
        ? 'Esta conversación se comparte con el bot de WhatsApp: puedes seguirla allí escribiendo «ia» y tu pregunta.'
        : 'Añade tu WhatsApp en «Mi cuenta» para recibir las respuestas y los informes allí.',
      datos.gmail ? '' : ' Vincula tu Gmail en «Mi cuenta» para que analice también los gastos que te llegan por correo.'),
  ];
}

// ---------- vista: administrador ----------

function tamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function cargarAdmin() {
  const [almacenamiento, { usuarios }, whatsapp, ia] = await Promise.all([
    api('/admin/almacenamiento'),
    api('/admin/usuarios'),
    api('/admin/whatsapp'),
    api('/admin/ia'),
  ]);
  return { almacenamiento, usuarios, whatsapp, ia };
}

// Mientras se espera el escaneo del QR, se consulta el estado cada 3 segundos y se repinta.
let sondeoWhatsapp = null;
function vigilarWhatsapp() {
  clearTimeout(sondeoWhatsapp);
  sondeoWhatsapp = setTimeout(async () => {
    if (estado.vista !== 'admin' || estado.seccion.admin !== 'whatsapp' || memoria.vista !== 'admin') return;
    try {
      memoria.datos.whatsapp = await api('/admin/whatsapp');
      render(true);
    } catch {
      // Fallo puntual de red: se reintenta en la siguiente vuelta.
      vigilarWhatsapp();
    }
  }, 3000);
}

const telefono = (numero) => (numero ? `+${numero}` : 'Sin WhatsApp');

function pintarAdmin(datos) {
  const { almacenamiento: a, usuarios, whatsapp: w, ia } = datos;
  const porcentaje = a.porcentaje < 0.1 && a.usado > 0 ? '< 0.1' : a.porcentaje.toFixed(1);

  // ----- WhatsApp -----
  const accionWhatsapp = (ruta, mensaje) => () =>
    intentar(async () => {
      datos.whatsapp = await api(`/admin/whatsapp/${ruta}`, { method: 'POST' });
      if (mensaje) avisar(mensaje);
      render(true);
    });

  const desvincular = () => {
    if (confirm('¿Desvincular WhatsApp? El bot dejará de responder y habrá que escanear el código de nuevo.')) accionWhatsapp('desconectar', 'WhatsApp desvinculado')();
  };

  const enviarEstado = (usuarioId, descripcion) =>
    intentar(async () => {
      if (!confirm(`¿Enviar ahora el estado de cuenta por WhatsApp a ${descripcion}?`)) return;
      avisar('Enviando…');
      const r = await api('/admin/whatsapp/enviar', { method: 'POST', body: { usuarioId } });
      avisar(r.fallos.length ? `Enviados: ${r.enviados}. No se pudo: ${r.fallos.join('; ')}` : `Estado de cuenta enviado (${r.enviados})`);
    });

  const estadosWhatsapp = {
    desconectado: 'Sin vincular',
    conectando: 'Conectando…',
    esperando_qr: 'Esperando a que escanees el código',
    conectado: `Conectado como ${telefono(w.numero)}`,
  };
  if (w.estado === 'conectando' || w.estado === 'esperando_qr') vigilarWhatsapp();

  // ----- IA -----
  // Proveedor que se está viendo en el formulario (al guardar pasa a ser el que usa el bot).
  const proveedorVisto = datos.proveedorVisto ?? ia.proveedor;
  const prov = ia.proveedores[proveedorVisto];

  const guardarIa = (ev) => {
    ev.preventDefault();
    const form = ev.target;
    intentar(async () => {
      const body = { proveedor: proveedorVisto, modelo: form.modelo.value, activa: form.activa.checked, responderTodo: form.responderTodo.checked };
      if (form.clave.value.trim()) body.clave = form.clave.value.trim();
      datos.ia = await api('/admin/ia', { method: 'PUT', body });
      datos.proveedorVisto = null;
      avisar(`Ajustes guardados. El bot usa ${datos.ia.proveedores[datos.ia.proveedor].nombre}.`);
      render(true);
    });
  };

  const probarIa = () =>
    intentar(async () => {
      avisar('Probando la conexión con la IA…');
      const r = await api('/admin/ia/probar', { method: 'POST' });
      avisar(r.mensaje);
    });

  const quitarClave = () =>
    intentar(async () => {
      if (!confirm('¿Borrar la clave guardada? La IA dejará de responder.')) return;
      datos.ia = await api('/admin/ia', { method: 'PUT', body: { proveedor: proveedorVisto, clave: null, activa: false } });
      render(true);
    });

  const crearUsuario = (ev) => {
    ev.preventDefault();
    const form = ev.target;
    intentar(async () => {
      const { usuario } = await api('/admin/usuarios', {
        method: 'POST',
        body: { nombre: form.nombre.value, email: form.email.value, password: form.password.value, whatsapp: form.whatsapp.value },
      });
      avisar(`Cuenta creada para ${usuario.nombre}`);
      render();
    });
  };

  const cambiarClave = (u) =>
    intentar(async () => {
      const password = prompt(`Contraseña nueva para ${u.nombre} (mínimo 8 caracteres).\nDespués tendrás que comunicársela tú.`);
      if (password === null) return;
      await api(`/admin/usuarios/${u.id}`, { method: 'PATCH', body: { password } });
      avisar(`Contraseña de ${u.nombre} cambiada`);
    });

  const eliminarUsuario = (u) =>
    intentar(async () => {
      const aviso = `¿Eliminar la cuenta de ${u.nombre} (${u.email})?\n\nSe borrarán también sus libros y todos los movimientos que contienen. No se puede deshacer.`;
      if (!confirm(aviso)) return;
      const { eliminado } = await api(`/admin/usuarios/${u.id}`, { method: 'DELETE' });
      avisar(`Cuenta de ${eliminado.nombre} eliminada (${eliminado.movimientos} movimientos borrados)`);
      // Si compartía algún libro contigo, la lista de libros puede haber cambiado.
      await cargarLibros();
      render();
    });

  const secciones = {
    almacenamiento: () =>
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Uso de la base de datos'), h('span', { class: 'tenue' }, `${porcentaje} % usado`)),
        h('div', { class: 'medidor', role: 'img', 'aria-label': `${porcentaje} % del almacenamiento usado` },
          h('div', { style: `width:${Math.max(a.porcentaje, a.usado > 0 ? 0.5 : 0)}%` }),
        ),
        h('p', { class: 'tenue nota-medidor' },
          a.clusterCompleto
            ? 'Incluye todas las bases de datos del clúster, porque el límite del plan es compartido.'
            : 'Solo se pudo medir la base de datos de esta app; si el clúster tiene otras, también ocupan espacio.'),
        h('p', { class: 'tenue nota-medidor' },
          `Tiempo de respuesta de la base de datos: ${a.latenciaMs} ms. `,
          a.latenciaMs > 150
            ? 'Es alto: el servidor y la base de datos están en regiones alejadas, y eso se nota en cada pantalla y en el bot.'
            : 'Es un buen valor.'),
        a.porcentaje >= 80 && h('p', { class: 'error' }, 'Queda poco espacio. Conviene borrar movimientos antiguos o ampliar el plan de MongoDB.'),
        a.bases.length > 1 && h('div', { class: 'tabla-scroll' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Base de datos'), h('th', { class: 'monto' }, 'Documentos'), h('th', { class: 'monto' }, 'Tamaño'))),
            h('tbody', null,
              a.bases.map((b) =>
                h('tr', null,
                  h('td', null, b.nombre, b.propia && h('span', { class: 'tenue' }, ' (esta app)')),
                  h('td', { class: 'monto' }, entero(b.documentos)),
                  h('td', { class: 'monto' }, tamano(b.bytes)),
                ),
              ),
            ),
          ),
        ),
      ),
    usuarios: () => [
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Usuarios registrados')),
        h('div', { class: 'tabla-scroll' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Persona'), h('th', { class: 'ocultar-movil' }, 'Registro'), h('th', { class: 'monto' }, 'Libros'), h('th', null))),
            h('tbody', null,
              usuarios.map((u) =>
                h('tr', null,
                  h('td', null, u.nombre, u.id === estado.usuario.id && ' (tú)',
                    h('div', { class: 'tenue correo' }, u.email),
                    h('div', { class: 'tenue' }, telefono(u.whatsapp))),
                  h('td', { class: 'ocultar-movil' }, u.registro),
                  h('td', { class: 'monto' }, String(u.libros)),
                  h('td', { class: 'acciones-fila' },
                    w.estado === 'conectado' && u.whatsapp &&
                      h('button', { type: 'button', class: 'mini', title: 'Enviarle su estado de cuenta por WhatsApp', onclick: () => enviarEstado(u.id, u.nombre) }, 'Enviar'),
                    h('button', { type: 'button', class: 'mini', title: 'Ponerle una contraseña nueva', onclick: () => cambiarClave(u) }, 'Contraseña'),
                    u.id !== estado.usuario.id &&
                      h('button', { type: 'button', class: 'mini peligro', onclick: () => eliminarUsuario(u) }, 'Eliminar'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Añadir usuario')),
        h('p', { class: 'tenue' }, 'Crea la cuenta y pásale el correo y la contraseña a la persona. Empezará con un libro «Personal» vacío.'),
        h('form', { class: 'form-linea', onsubmit: crearUsuario },
          h('label', null, 'Nombre', h('input', { name: 'nombre', maxLength: 60, required: true, autocomplete: 'off' })),
          h('label', null, 'Correo', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'off' })),
          h('label', null, 'Contraseña', h('input', { name: 'password', type: 'password', minLength: 8, maxLength: 72, required: true, autocomplete: 'new-password' })),
          h('label', null, 'WhatsApp (opcional)', h('input', { name: 'whatsapp', type: 'tel', maxLength: 24, placeholder: '51 987 654 321', autocomplete: 'off' })),
          h('button', { class: 'primario' }, 'Crear cuenta'),
        ),
      ),
    ],

    whatsapp: () => [
      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Bot de WhatsApp'), h('span', { class: w.estado === 'conectado' ? 'chip ok' : 'chip' }, estadosWhatsapp[w.estado])),
        w.aviso && h('p', { class: 'error' }, w.aviso),

        w.estado === 'desconectado' && [
          h('p', null, 'Vincula una cuenta de WhatsApp para que responda sola a los usuarios registrados: estado de cuenta, deudas, previsión e informes en PDF.'),
          h('button', { type: 'button', class: 'primario', onclick: accionWhatsapp('conectar') }, 'Conectar y mostrar código QR'),
        ],
        w.estado === 'conectando' && h('p', { class: 'tenue' }, 'Conectando con WhatsApp…'),
        w.estado === 'esperando_qr' && h('div', { class: 'zona-qr' },
          w.qr && h('img', { src: w.qr, alt: 'Código QR para vincular WhatsApp', width: 280, height: 280 }),
          h('ol', null,
            h('li', null, 'Abre WhatsApp en el teléfono que hará de bot.'),
            h('li', null, 'Entra en Ajustes (o el menú ⋮) → «Dispositivos vinculados».'),
            h('li', null, 'Pulsa «Vincular un dispositivo» y escanea este código.'),
            h('li', null, 'El código cambia cada pocos segundos; esta pantalla se actualiza sola.'),
          ),
        ),
        w.estado === 'conectado' && [
          h('p', null, `${w.conNumero} ${w.conNumero === 1 ? 'usuario tiene' : 'usuarios tienen'} número de WhatsApp registrado. El bot solo responde a esos números; el resto de tus contactos no nota nada.`),
          h('div', { class: 'form-linea' },
            h('button', { type: 'button', class: 'primario', disabled: w.conNumero === 0, onclick: () => enviarEstado('todos', `los ${w.conNumero} usuarios con WhatsApp`) }, 'Enviar estado de cuenta a todos'),
            h('button', { type: 'button', class: 'peligro', onclick: desvincular }, 'Desvincular'),
          ),
        ],
      ),

      h('section', { class: 'panel' },
        h('header', null, h('h3', null, 'Qué pueden escribirle')),
        h('ul', { class: 'ayuda' },
          h('li', null, h('b', null, 'resumen'), ' — estado de cuenta del mes'),
          h('li', null, h('b', null, 'deudas'), ' — pagos pendientes y vencidos'),
          h('li', null, h('b', null, 'proximo'), ' — previsión del mes siguiente'),
          h('li', null, h('b', null, 'año'), ' — totales del año'),
          h('li', null, h('b', null, 'pdf'), ' — informe del mes en PDF'),
          h('li', null, h('b', null, 'libros'), ' — ver o cambiar de libro'),
          h('li', null, h('b', null, 'menu'), ' — lista de opciones'),
          h('li', null, h('b', null, 'ia …'), ' — pregunta libre a la IA, si está activada'),
        ),
        h('p', { class: 'tenue' }, 'Para pedirle algo tú mismo, escríbete en tu propio chat de WhatsApp («Mensaje a ti mismo»). Tu número debe estar en «Mi cuenta».'),
        h('p', { class: 'tenue' }, 'Aviso: este método usa WhatsApp Web de forma no oficial. WhatsApp puede bloquear el número si detecta automatización o muchos envíos; lo más prudente es usar un número dedicado al bot.'),
      ),
    ],

    ia: () =>
      h('section', { class: 'panel' },
        h('header', null,
          h('h3', null, 'Inteligencia artificial'),
          h('span', { class: ia.disponible ? 'chip ok' : 'chip' }, ia.disponible ? `Activada · ${ia.proveedores[ia.proveedor].nombre}` : 'Desactivada')),
        h('p', null, 'Con la IA, los usuarios pueden preguntar al bot de WhatsApp con sus propias palabras, por ejemplo «ia ¿cuánto gasté en comida este mes?». La IA solo ve los datos del libro de quien pregunta y no puede modificar nada.'),
        h('form', { onsubmit: guardarIa },
          h('label', null, 'Proveedor',
            h('select', {
              name: 'proveedor',
              onchange: (ev) => {
                datos.proveedorVisto = ev.target.value;
                render(true);
              },
            }, Object.entries(ia.proveedores).map(([id, p]) => h('option', { value: id, selected: id === proveedorVisto }, p.nombre)))),
          h('label', null, `Clave de la API de ${prov.nombre}`,
            h('input', {
              name: 'clave', type: 'password', autocomplete: 'off', maxLength: 300,
              placeholder: prov.tieneClave ? `Guardada (termina en ${prov.finalClave}). Escribe otra para cambiarla.` : prov.ejemploClave,
              disabled: prov.origenClave === 'entorno',
            })),
          prov.origenClave === 'entorno' && h('p', { class: 'tenue' }, 'La clave viene de una variable de entorno del servidor; se cambia allí.'),
          h('label', null, 'Modelo',
            h('select', { name: 'modelo' }, Object.entries(prov.modelos).map(([id, nombre]) => h('option', { value: id, selected: id === prov.modelo }, nombre)))),
          proveedorVisto === 'nvidia' && h('p', { class: 'tenue nota-repetir' },
            prov.tieneClave
              ? 'La lista sale de tu cuenta de NVIDIA. No todos los modelos listados están habilitados: usa «Probar conexión» después de guardar.'
              : 'Guarda la clave para ver todos los modelos de tu cuenta.'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'activa', checked: ia.activa }), 'Activar la IA en el bot de WhatsApp'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'responderTodo', checked: ia.responderTodo }),
            'Responder a cualquier mensaje de un usuario registrado, sin necesidad de empezar por «ia»'),
          h('div', { class: 'form-linea' },
            h('button', { class: 'primario' }, 'Guardar'),
            h('button', { type: 'button', disabled: !ia.proveedores[ia.proveedor].tieneClave, onclick: probarIa, title: 'Prueba el proveedor y el modelo guardados' }, 'Probar conexión'),
            prov.origenClave === 'panel' && h('button', { type: 'button', class: 'peligro', onclick: quitarClave }, 'Borrar clave'),
          ),
        ),
        h('p', { class: 'tenue pie-panel' }, proveedorVisto === 'nvidia'
          ? 'La clave se crea en build.nvidia.com (API Keys) y empieza por «nvapi-». La cuenta gratuita incluye créditos limitados. Se guarda cifrada y nunca se muestra entera. Cada usuario tiene un límite de 40 preguntas a la IA por día.'
          : 'La clave se crea en console.anthropic.com (API Keys) y su uso es de pago, según los mensajes que se procesen. Se guarda cifrada y nunca se muestra entera. Cada usuario tiene un límite de 40 preguntas a la IA por día.'),
        h('p', { class: 'tenue' }, 'La IA puede equivocarse en alguna cuenta; los comandos (resumen, deudas…) siempre dan las cifras exactas.'),
        h('p', { class: 'tenue' }, 'No actives «responder a cualquier mensaje» si el bot usa tu número personal: contestaría a todo lo que te escriban los usuarios registrados.'),
      ),
  };

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Administrador')),

    h('div', { class: 'tarjetas' },
      tarjeta('Espacio libre', tamano(a.libre), `de ${tamano(a.limite)} en total`, 'destacada'),
      tarjeta('Espacio usado', tamano(a.usado), `${porcentaje} % del total`),
      tarjeta('Movimientos que aún caben', `≈ ${entero(a.movimientosQueCaben)}`, 'Estimación'),
      tarjeta('Movimientos guardados', entero(a.totales.movimientos),
        `${entero(a.totales.usuarios)} ${a.totales.usuarios === 1 ? 'usuario' : 'usuarios'} · ${entero(a.totales.libros)} ${a.totales.libros === 1 ? 'libro' : 'libros'}`),
    ),

    segmentos('admin', [['almacenamiento', 'Almacenamiento'], ['usuarios', 'Usuarios', usuarios.length], ['whatsapp', 'WhatsApp'], ['ia', 'IA']]),
    secciones[estado.seccion.admin](),
  ];
}

// ---------- tarjeta principal del mes: línea de la gráfica e insignia ----------

// Línea suave (curva de Catmull-Rom pasada a Bézier) por lo alto de las 7 barras, con un punto en el día de más gasto.
function lineaSemana(semana, mayor) {
  const alto = semana.map((d) => Math.max((d.total / mayor) * 100, d.total ? 6 : 2));
  const suave = alto.map((v, i) => (alto[i - 1] ?? v) * 0.25 + v * 0.5 + (alto[i + 1] ?? v) * 0.25);
  const puntos = suave.map((v, i) => [((i + 0.5) / semana.length) * 100, 100 - Math.min(96, v * 0.9 + 6)]);
  let camino = `M${puntos[0][0]},${puntos[0][1]}`;
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [puntos[i - 1] ?? puntos[i], puntos[i], puntos[i + 1], puntos[i + 2] ?? puntos[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    camino += ` C${c1[0].toFixed(2)},${Math.min(100, c1[1]).toFixed(2)} ${c2[0].toFixed(2)},${Math.min(100, c2[1]).toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'heroe-linea');
  svg.setAttribute('aria-hidden', 'true');
  // Solo números calculados aquí: nada de texto de los usuarios.
  svg.innerHTML = `<path d="${camino}" class="heroe-linea-brillo"/><path d="${camino}" class="heroe-linea-trazo"/>`;
  const max = semana.findIndex((d) => d.total > 0 && d.total === mayor);
  return h('div', { class: 'heroe-linea-caja', 'aria-hidden': 'true' },
    svg,
    max >= 0 && h('span', { class: 'heroe-punto', style: `left:${puntos[max][0]}%;top:${puntos[max][1]}%` }));
}

function conInsignia(el, pendientes) {
  el.classList.add('con-insignia');
  el.append(h('span', { class: `insignia ${pendientes ? 'hay' : 'ok'}`, 'aria-hidden': 'true' },
    h('span', { class: 'insignia-fondo' }),
    h('span', { class: 'insignia-frente' }, pendientes ? h('b', null, String(pendientes)) : icono('check'))));
  return el;
}

// ---------- ventanas sencillas (metas, aportes, categorías) ----------

function ventana(nodos, { ancho = '' } = {}) {
  let dlg = $('#dlg-extra');
  if (!dlg) {
    dlg = h('dialog', { id: 'dlg-extra', class: 'dlg-extra' });
    dlg.addEventListener('close', () => dlg.replaceChildren());
    document.body.append(dlg);
  }
  dlg.className = `dlg-extra ${ancho}`;
  dlg.replaceChildren(...[nodos].flat(Infinity).filter(Boolean));
  if (!dlg.open) dlg.showModal();
  return dlg;
}

const COLORES = ['#9bd62f', '#3987e5', '#e0662f', '#e5484d', '#8b5cf6', '#14b8a6', '#f2a516', '#e5489b', '#64748b'];

function selectorColor(nombre, elegido) {
  return h('fieldset', { class: 'colores' },
    h('legend', null, 'Color'),
    COLORES.map((c, i) => h('label', { class: 'color', style: `--c:${c}`, title: c },
      h('input', { type: 'radio', name: nombre, value: c, checked: elegido ? elegido.toLowerCase() === c : i === 0 }),
      h('span', { 'aria-hidden': 'true' }))));
}

// ---------- metas de ahorro ----------

const ICONOS_META = [['meta', 'Meta'], ['avion', 'Viaje'], ['casa', 'Casa'], ['auto', 'Auto'], ['estudio', 'Estudios'], ['regalo', 'Regalo'], ['salud', 'Salud'], ['alcancia', 'Ahorro']];

const cargarMetas = () => api(`/libros/${estado.libroId}/metas`);

// Meses que quedan hasta la fecha límite (como mínimo 1).
function mesesHasta(fecha) {
  const [a, m] = fecha.split('-').map(Number);
  const [ha, hm] = hoy().split('-').map(Number);
  return Math.max(1, (a - ha) * 12 + (m - hm));
}

function anilloProgreso(fraccion, color) {
  const r = 26;
  const largo = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'anillo');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<circle cx="32" cy="32" r="${r}" class="anillo-pista"/><circle cx="32" cy="32" r="${r}" class="anillo-valor" style="stroke:${color};stroke-dasharray:${largo};stroke-dashoffset:${largo * (1 - Math.min(1, Math.max(0, fraccion)))}"/>`;
  return h('div', { class: 'anillo-caja' }, svg, h('span', null, `${Math.round(Math.min(1, fraccion) * 100)}%`));
}

function pintarMetas({ metas }) {
  const editar = puedeEditar();
  const total = metas.reduce((s, m) => s + m.ahorrado, 0);
  const objetivo = metas.reduce((s, m) => s + m.objetivo, 0);
  const cumplidas = metas.filter((m) => m.completada).length;

  const tarjetaMeta = (m) => {
    const color = m.color ?? COLORES[0];
    const falta = Math.max(0, m.objetivo - m.ahorrado);
    const porMes = m.fechaLimite && falta > 0 && m.fechaLimite >= hoy() ? falta / mesesHasta(m.fechaLimite) : null;
    const vencida = m.fechaLimite && m.fechaLimite < hoy() && !m.completada;
    return h('article', { class: `meta-tarjeta ${m.completada ? 'cumplida' : ''}`, style: `--c:${color}` },
      h('div', { class: 'meta-cabecera' },
        h('span', { class: 'icono-caja meta-icono' }, icono(m.icono ?? 'meta')),
        h('div', { class: 'meta-titulo' },
          h('h3', null, m.nombre),
          h('small', { class: vencida ? 'negativo' : 'tenue' },
            m.completada ? '¡Meta cumplida!' : m.fechaLimite ? `${vencida ? 'Venció' : 'Para'} el ${fechaTexto(m.fechaLimite, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Sin fecha límite')),
        editar && h('button', { type: 'button', class: 'circulo pequeno', title: 'Editar meta', 'aria-label': `Editar la meta ${m.nombre}`, onclick: () => abrirMeta(m) }, icono('lapiz')),
      ),
      h('div', { class: 'meta-cuerpo' },
        anilloProgreso(m.ahorrado / m.objetivo, color),
        h('div', { class: 'meta-cifras' },
          h('div', { class: 'meta-ahorrado' }, dinero(m.ahorrado)),
          h('small', { class: 'tenue' }, `de ${dinero(m.objetivo)}`),
          h('div', { class: 'meta-falta' }, m.completada ? 'Has llegado al objetivo' : `Faltan ${dinero(falta)}`),
          porMes && h('small', { class: 'tenue' }, `Ahorra ${dinero(porMes)} al mes para llegar a tiempo`))),
      h('div', { class: 'progreso meta-barra' }, h('span', { style: `width:${Math.min(100, (m.ahorrado / m.objetivo) * 100)}%;background:${color}` })),
      editar && h('div', { class: 'meta-acciones' },
        h('button', { type: 'button', class: 'primario', onclick: () => abrirAporte(m, 1) }, icono('entrada'), 'Aportar'),
        h('button', { type: 'button', disabled: m.ahorrado <= 0, onclick: () => abrirAporte(m, -1) }, icono('salida'), 'Retirar')),
      m.aportes.length > 0 && h('details', { class: 'meta-historial' },
        h('summary', null, `Historial (${m.aportes.length})`),
        h('ul', null, m.aportes.slice(0, 10).map((a) => h('li', null,
          h('span', null, fechaCorta(a.fecha), a.nota && h('small', { class: 'tenue' }, ` · ${a.nota}`)),
          h('b', { class: a.monto < 0 ? 'negativo' : 'positivo' }, `${a.monto < 0 ? '−' : '+'}${dinero(Math.abs(a.monto))}`),
          editar && h('button', { type: 'button', class: 'mini', 'aria-label': 'Quitar este aporte', title: a.conMovimiento ? 'Quitar (también borra su movimiento)' : 'Quitar', onclick: () => quitarAporte(m, a) }, '✕'))))),
    );
  };

  return [
    h('div', { class: 'periodo' },
      h('h2', { class: 'izquierda' }, 'Metas de ahorro'),
      h('span', { class: 'espacio' }),
      editar && h('button', { type: 'button', class: 'primario', onclick: () => abrirMeta(null) }, '+ Nueva meta')),
    metas.length > 0 && h('div', { class: 'tarjetas tres' },
      tarjeta('Total ahorrado', dinero(total), `${objetivo > 0 ? Math.round((total / objetivo) * 100) : 0} % de todas tus metas`, '', { icono: 'alcancia', tono: 'balance', progreso: objetivo > 0 ? total / objetivo : 0 }),
      tarjeta('Te falta', dinero(Math.max(0, objetivo - total)), `Objetivo total: ${dinero(objetivo)}`, '', { icono: 'meta', tono: 'gasto' }),
      tarjeta('Metas cumplidas', `${cumplidas} de ${metas.length}`, cumplidas === metas.length ? '¡Todas cumplidas!' : 'Sigue así', 'clara', { icono: 'check', tono: 'pendiente' })),
    metas.length
      ? h('div', { class: 'metas-grid' }, metas.map(tarjetaMeta))
      : h('section', { class: 'panel vacio-grande' },
        h('span', { class: 'icono-caja grande' }, icono('alcancia')),
        h('h3', null, 'Todavía no tienes metas de ahorro'),
        h('p', { class: 'tenue' }, 'Crea una meta (un viaje, un fondo de emergencia, una laptop…), ponle un objetivo y una fecha, y ve sumando lo que ahorras. Te diremos cuánto apartar cada mes para llegar.'),
        editar && h('button', { type: 'button', class: 'primario', onclick: () => abrirMeta(null) }, '+ Crear mi primera meta')),
  ];
}

function abrirMeta(meta) {
  const guardar = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const body = {
      nombre: f.nombre.value,
      objetivo: Number(f.objetivo.value),
      fechaLimite: f.fechaLimite.value || null,
      color: f.color.value,
      icono: f.icono.value,
      ...(!meta && Number(f.inicial.value) > 0 && { inicial: Number(f.inicial.value) }),
    };
    intentar(async () => {
      await api(`/libros/${estado.libroId}/metas${meta ? `/${meta.id}` : ''}`, { method: meta ? 'PATCH' : 'POST', body });
      $('#dlg-extra').close();
      avisar(meta ? 'Meta actualizada' : 'Meta creada');
      render();
    });
  };
  const borrar = () => {
    if (!confirm(`¿Eliminar la meta «${meta.nombre}»? Los gastos de ahorro que registraste se quedan en el libro.`)) return;
    intentar(async () => {
      await api(`/libros/${estado.libroId}/metas/${meta.id}`, { method: 'DELETE' });
      $('#dlg-extra').close();
      avisar('Meta eliminada');
      render();
    });
  };
  ventana(h('form', { onsubmit: guardar },
    h('h2', null, meta ? 'Editar meta' : 'Nueva meta de ahorro'),
    h('label', null, '¿Para qué ahorras?', h('input', { name: 'nombre', maxLength: 60, required: true, placeholder: 'Viaje a Cusco, fondo de emergencia…', value: meta?.nombre ?? '' })),
    h('div', { class: 'fila' },
      h('label', null, 'Objetivo', h('input', { name: 'objetivo', type: 'number', step: '0.01', min: '0.01', inputMode: 'decimal', required: true, value: meta?.objetivo ?? '' })),
      meta
        ? h('label', null, 'Fecha límite (opcional)', h('input', { name: 'fechaLimite', type: 'date', value: meta?.fechaLimite ?? '' }))
        : h('label', null, 'Ya tengo ahorrado', h('input', { name: 'inicial', type: 'number', step: '0.01', min: '0', inputMode: 'decimal', placeholder: '0' }))),
    !meta && h('label', null, 'Fecha límite (opcional)', h('input', { name: 'fechaLimite', type: 'date', min: hoy() })),
    h('fieldset', { class: 'iconos-meta' },
      h('legend', null, 'Icono'),
      ICONOS_META.map(([nombre, texto], i) => h('label', { title: texto },
        h('input', { type: 'radio', name: 'icono', value: nombre, checked: meta?.icono ? meta.icono === nombre : i === 0 }),
        h('span', null, icono(nombre), h('small', null, texto))))),
    selectorColor('color', meta?.color),
    h('div', { class: 'acciones' },
      meta && h('button', { type: 'button', class: 'peligro al-inicio', onclick: borrar }, 'Eliminar'),
      h('button', { type: 'button', onclick: () => $('#dlg-extra').close() }, 'Cancelar'),
      h('button', { class: 'primario' }, meta ? 'Guardar' : 'Crear meta')),
  ));
}

function abrirAporte(meta, signo) {
  const retiro = signo < 0;
  const guardar = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    intentar(async () => {
      const { meta: nueva } = await api(`/libros/${estado.libroId}/metas/${meta.id}/aportes`, {
        method: 'POST',
        body: { monto: signo * Number(f.monto.value), nota: f.nota.value, fecha: f.fecha.value, registrar: f.registrar.checked },
      });
      $('#dlg-extra').close();
      datosRecordados.clear();
      avisar(nueva.completada && !meta.completada ? `¡Cumpliste la meta «${meta.nombre}»! 🎉` : retiro ? 'Retiro anotado' : 'Aporte anotado');
      render();
    });
  };
  ventana(h('form', { onsubmit: guardar },
    h('h2', null, retiro ? `Retirar de «${meta.nombre}»` : `Aportar a «${meta.nombre}»`),
    h('p', { class: 'tenue' }, `Llevas ${dinero(meta.ahorrado)} de ${dinero(meta.objetivo)}.`),
    h('div', { class: 'fila' },
      h('label', null, 'Monto', h('input', { name: 'monto', type: 'number', step: '0.01', min: '0.01', ...(retiro && { max: meta.ahorrado }), inputMode: 'decimal', required: true, autofocus: true })),
      h('label', null, 'Fecha', h('input', { name: 'fecha', type: 'date', value: hoy(), max: hoy(), required: true }))),
    h('label', null, 'Nota (opcional)', h('input', { name: 'nota', maxLength: 80, placeholder: retiro ? 'Para qué lo usaste' : 'Quincena, propina…' })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'registrar', checked: !retiro }),
      h('span', null, retiro ? 'Registrarlo como ingreso en el libro (vuelve a tu balance)' : 'Registrarlo como gasto en el libro (categoría «Ahorro»), para que salga del balance del mes')),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', onclick: () => $('#dlg-extra').close() }, 'Cancelar'),
      h('button', { class: 'primario' }, retiro ? 'Retirar' : 'Aportar')),
  ));
}

function quitarAporte(meta, aporte) {
  if (!confirm(`¿Quitar el ${aporte.monto < 0 ? 'retiro' : 'aporte'} de ${dinero(Math.abs(aporte.monto))}?${aporte.conMovimiento ? ' También se borra el movimiento que se registró en el libro.' : ''}`)) return;
  intentar(async () => {
    await api(`/libros/${estado.libroId}/metas/${meta.id}/aportes/${aporte.id}`, { method: 'DELETE' });
    datosRecordados.clear();
    render();
  });
}

// ---------- categorías ----------

const cargarCategorias = () => api(`/libros/${estado.libroId}/categorias?mes=${estado.mes}`);

function pintarCategorias({ categorias }) {
  const editar = puedeEditar();
  const tipo = estado.seccion.categorias ?? 'gasto';
  const lista = categorias.filter((c) => c.tipo === tipo);
  const total = lista.reduce((s, c) => s + c.totalMes, 0);
  const conPresupuesto = lista.filter((c) => c.presupuesto);
  const presupuesto = conPresupuesto.reduce((s, c) => s + c.presupuesto, 0);
  const excedidas = conPresupuesto.filter((c) => c.totalMes > c.presupuesto);
  const mayor = Math.max(1, ...lista.map((c) => c.totalMes));
  const mesActual = hoy().slice(0, 7);

  const fila = (c, i) => {
    const color = c.color ?? COLORES[(i + 1) % COLORES.length];
    const uso = c.presupuesto ? c.totalMes / c.presupuesto : null;
    const estadoPres = uso === null ? null : uso > 1 ? 'excedido' : uso >= 0.8 ? 'cerca' : 'bien';
    return h('li', { class: 'categoria-fila', style: `--c:${color}` },
      h('button', { type: 'button', class: 'categoria-abrir', disabled: !editar, onclick: () => abrirCategoria(c), title: editar ? 'Editar categoría' : '' },
        h('span', { class: 'categoria-punto', 'aria-hidden': 'true' }, c.nombre.slice(0, 1).toUpperCase()),
        h('span', { class: 'categoria-texto' },
          h('strong', null, c.nombre),
          h('small', { class: 'tenue' }, c.cuantosMes ? `${c.cuantosMes} ${c.cuantosMes === 1 ? 'movimiento' : 'movimientos'} este mes` : 'Sin movimientos este mes'),
          h('span', { class: 'progreso' }, h('span', { style: `width:${Math.min(100, uso !== null ? uso * 100 : (c.totalMes / mayor) * 100)}%` }))),
        h('span', { class: 'categoria-monto' },
          h('b', null, dinero(c.totalMes)),
          c.presupuesto
            ? h('small', { class: `pres-${estadoPres}` }, estadoPres === 'excedido' ? `Te pasaste ${dinero(c.totalMes - c.presupuesto)}` : `de ${dinero(c.presupuesto)}`)
            : h('small', { class: 'tenue' }, total > 0 ? `${Math.round((c.totalMes / total) * 100)} %` : ''))));
  };

  return [
    h('div', { class: 'periodo' },
      h('button', { type: 'button', class: 'circulo', 'aria-label': 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); render(); } }, icono('flecha-izq')),
      h('div', { class: 'titulo-doble' }, h('small', null, 'Categorías'), h('h2', { class: 'capital' }, nombreMes(estado.mes))),
      h('button', { type: 'button', class: 'circulo', 'aria-label': 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); render(); } }, icono('flecha')),
      h('span', { class: 'espacio' }),
      estado.mes !== mesActual && h('button', { type: 'button', class: 'pildora-suave', onclick: () => { estado.mes = mesActual; render(); } }, 'Hoy'),
      editar && h('button', { type: 'button', class: 'primario boton-nueva', 'aria-label': 'Nueva categoría', onclick: () => abrirCategoria(null, tipo) }, '+', h('span', { class: 'texto-largo' }, ' Nueva'))),
    segmentos('categorias', [['gasto', 'Gastos'], ['ingreso', 'Ingresos']]),
    h('div', { class: 'tarjetas tres' },
      tarjeta(tipo === 'gasto' ? 'Gastado este mes' : 'Recibido este mes', dinero(total), `${lista.filter((c) => c.totalMes > 0).length} categorías con movimientos`, '', { icono: tipo === 'gasto' ? 'salida' : 'entrada', tono: tipo }),
      tarjeta('Presupuesto del mes', presupuesto ? dinero(presupuesto) : 'Sin definir',
        presupuesto ? `Te queda ${dinero(Math.max(0, presupuesto - conPresupuesto.reduce((s, c) => s + c.totalMes, 0)))}` : 'Toca una categoría para ponerle un límite', '', { icono: 'meta', tono: 'balance', ...(presupuesto && { progreso: Math.min(1, conPresupuesto.reduce((s, c) => s + c.totalMes, 0) / presupuesto) }) }),
      tarjeta('Sobre el presupuesto', String(excedidas.length), excedidas.length ? excedidas.map((c) => c.nombre).slice(0, 3).join(', ') : 'Todo dentro del límite', 'clara', { icono: 'reloj', tono: 'pendiente' })),
    h('section', { class: 'panel' },
      lista.length
        ? h('ul', { class: 'lista-categorias' }, lista.map(fila))
        : h('p', { class: 'vacio' }, tipo === 'gasto' ? 'Aún no hay categorías de gastos. Crea una o registra un gasto con su categoría.' : 'Aún no hay categorías de ingresos.'),
      editar && lista.length > 0 && h('p', { class: 'tenue nota-categorias' }, 'Toca una categoría para cambiarle el nombre, el color o ponerle un presupuesto mensual. Si la renombras, sus movimientos pasan al nuevo nombre.')),
  ];
}

function abrirCategoria(cat, tipoNuevo = 'gasto') {
  const tipo = cat?.tipo ?? tipoNuevo;
  const guardar = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    intentar(async () => {
      const { movidos } = await api(`/libros/${estado.libroId}/categorias`, {
        method: 'PUT',
        body: { nombre: f.nombre.value, tipo, color: f.color.value, presupuesto: f.presupuesto?.value ? Number(f.presupuesto.value) : null, ...(cat && { antes: cat.nombre }) },
      });
      await cargarLibros();
      $('#dlg-extra').close();
      datosRecordados.clear();
      avisar(movidos ? `Categoría guardada · ${movidos} movimientos actualizados` : 'Categoría guardada');
      render();
    });
  };
  const borrar = () => {
    if (!confirm(`¿Quitar la categoría «${cat.nombre}»? Sus movimientos pasan a «General».`)) return;
    intentar(async () => {
      const { movidos } = await api(`/libros/${estado.libroId}/categorias`, { method: 'DELETE', body: { nombre: cat.nombre, tipo } });
      await cargarLibros();
      $('#dlg-extra').close();
      datosRecordados.clear();
      avisar(movidos ? `Categoría quitada · ${movidos} movimientos pasaron a General` : 'Categoría quitada');
      render();
    });
  };
  ventana(h('form', { onsubmit: guardar },
    h('h2', null, cat ? 'Editar categoría' : `Nueva categoría de ${tipo === 'gasto' ? 'gastos' : 'ingresos'}`),
    h('label', null, 'Nombre', h('input', { name: 'nombre', maxLength: 40, required: true, value: cat?.nombre ?? '', placeholder: tipo === 'gasto' ? 'Comida, Transporte, Mascotas…' : 'Sueldo, Ventas…' })),
    tipo === 'gasto' && h('label', null, 'Presupuesto mensual (opcional)',
      h('input', { name: 'presupuesto', type: 'number', step: '0.01', min: '0', inputMode: 'decimal', placeholder: 'Sin límite', value: cat?.presupuesto ?? '' })),
    selectorColor('color', cat?.color),
    cat && h('p', { class: 'tenue' }, `${cat.movimientos} movimientos en total con esta categoría.`),
    h('div', { class: 'acciones' },
      cat && cat.nombre !== 'General' && h('button', { type: 'button', class: 'peligro al-inicio', onclick: borrar }, 'Quitar'),
      h('button', { type: 'button', onclick: () => $('#dlg-extra').close() }, 'Cancelar'),
      h('button', { class: 'primario' }, 'Guardar')),
  ));
}

// ---------- recordatorios por WhatsApp (en «Mi cuenta») ----------

function seccionRecordatorios() {
  const u = estado.usuario;
  const r = u.recordatorio ?? { dias: 2, mismoDia: true };
  const guardar = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    intentar(async () => {
      const { usuario } = await api('/auth/yo', { method: 'PATCH', body: { recordatorio: { dias: Number(f.dias.value), mismoDia: f.mismoDia.checked } } });
      estado.usuario = usuario;
      avisar('Recordatorios guardados');
      render();
    });
  };
  const probar = () => intentar(async () => {
    await api('/recordatorios/prueba', { method: 'POST' });
    avisar('Te envié un recordatorio de prueba por WhatsApp');
  });
  return h('section', { class: 'panel cuenta-tarjeta' },
    cabeceraCuenta('campana', 'Recordatorios de pago', 'Te aviso por WhatsApp y notificación antes de que venza un pago.'),
    h('form', { class: 'form-cuenta', onsubmit: guardar },
      h('label', null, 'Avisarme',
        h('select', { name: 'dias' },
          [[0, 'No avisar antes'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [5, '5 días antes'], [7, '1 semana antes']]
            .map(([v, t]) => h('option', { value: v, selected: r.dias === v }, t)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'mismoDia', checked: r.mismoDia }), h('span', null, 'También el mismo día')),
      h('div', { class: 'botones-fila' },
        h('button', { class: 'primario' }, 'Guardar'),
        h('button', { type: 'button', disabled: !u.whatsapp, onclick: probar }, 'Probar'))),
    h('p', { class: 'tenue nota' }, u.whatsapp ? 'De 8:00 a 21:00. Puedes cambiarlo en cada pago.' : 'Guarda tu WhatsApp para recibirlos.'));
}

// ---------- app instalada y notificaciones push ----------
// iPhone/iPad: la app se instala desde Safari («Compartir → Agregar a inicio») y, abierta desde ese icono
// (iOS 16.4 o posterior), puede recibir notificaciones. Android y PC: el navegador ofrece «Instalar».

const ua = navigator.userAgent;
const esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esAndroid = /android/i.test(ua);
const esSafariIOS = esIOS && !/crios|fxios|edgios|opios|gsa\//i.test(ua);
const enModoApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushPosible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const guardado = {
  leer(clave) { try { return localStorage.getItem(clave); } catch { return null; } },
  poner(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } },
};

function claveAplicacion(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

async function suscripcionActual() {
  if (!pushPosible()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// 'activo' | 'inactivo' | 'bloqueado' | 'instalar' (iPhone sin instalar) | 'no-disponible'
async function estadoNotificaciones() {
  if (esIOS && !enModoApp()) return 'instalar';
  if (!pushPosible()) return 'no-disponible';
  if (Notification.permission === 'denied') return 'bloqueado';
  return (await suscripcionActual()) && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

const nombreDispositivo = () => (esIOS ? (/ipad/i.test(ua) ? 'iPad' : 'iPhone') : esAndroid ? 'Android' : /windows/i.test(ua) ? 'PC Windows' : /mac/i.test(ua) ? 'Mac' : 'Navegador') + (enModoApp() ? ' (app)' : '');

async function activarNotificaciones() {
  if (esIOS && !enModoApp()) throw new Error('En iPhone, primero instala la app («Compartir → Agregar a inicio») y ábrela desde su icono.');
  if (!pushPosible()) throw new Error('Este navegador no admite notificaciones. Prueba con Chrome, Edge o Safari actualizados.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error(permiso === 'denied'
    ? 'Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador (o en Ajustes → Notificaciones → DUOLAB Gastos en el iPhone).'
    : 'No se dio permiso para las notificaciones.');
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api('/push/clave');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAplicacion(clave) });
  await api('/push/suscribir', { method: 'POST', body: { suscripcion: sub.toJSON(), dispositivo: nombreDispositivo() } });
  guardado.poner('push-activado', '1');
}

async function desactivarNotificaciones() {
  const sub = await suscripcionActual();
  if (sub) {
    await api('/push/suscribir', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

// Icono de «Compartir» de Safari, para que los pasos se reconozcan.
const iconoCompartir = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icono');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>';
  return svg;
};
const iconoAgregar = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icono');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>';
  return svg;
};

function pasosInstalar(plataforma) {
  const paso = (n, ...texto) => h('li', null, h('span', { class: 'paso-n' }, String(n)), h('span', null, ...texto));
  if (plataforma === 'ios') {
    return h('ol', { class: 'pasos' },
      !esSafariIOS && paso(0, h('b', null, 'Abre esta página en Safari'), ' (en otros navegadores del iPhone no siempre aparece la opción).'),
      paso(1, 'Toca ', h('span', { class: 'tecla' }, iconoCompartir(), 'Compartir'), ' en la barra de Safari (abajo, o arriba en iPad).'),
      paso(2, 'Baja y elige ', h('span', { class: 'tecla' }, iconoAgregar(), 'Agregar a inicio'), '. Luego toca ', h('b', null, 'Agregar'), '.'),
      paso(3, 'Abre ', h('b', null, 'DUOLAB Gastos'), ' desde el icono de tu pantalla de inicio.'),
      paso(4, 'Dentro de la app, toca ', h('b', null, 'Activar notificaciones'), ' y permite los avisos (iOS 16.4 o posterior).'));
  }
  if (plataforma === 'android') {
    return h('ol', { class: 'pasos' },
      paso(1, 'En Chrome, toca el menú ', h('b', null, '⋮'), ' (arriba a la derecha).'),
      paso(2, 'Elige ', h('b', null, 'Instalar app'), ' o ', h('b', null, 'Agregar a pantalla principal'), '.'),
      paso(3, 'Abre la app desde su icono y activa las notificaciones.'));
  }
  return h('ol', { class: 'pasos' },
    paso(1, 'En Chrome o Edge, pulsa el icono ', h('b', null, 'Instalar'), ' de la barra de direcciones (o el menú ⋮ → «Instalar DUOLAB Gastos»).'),
    paso(2, 'La app se abre en su propia ventana y queda en el menú Inicio o en el escritorio.'),
    paso(3, 'Activa las notificaciones para recibir los avisos aunque la tengas minimizada.'));
}

// Ventana de bienvenida: instalar la app y activar las notificaciones. Se muestra una sola vez
// (y, ya instalada, una vez más para pedir las notificaciones si faltan).
async function abrirAvisoApp({ forzar = false } = {}) {
  const instalada = enModoApp();
  const estadoPush = await estadoNotificaciones();
  let plataforma = esIOS ? 'ios' : esAndroid ? 'android' : 'pc';
  const cerrar = (dlg) => dlg.close();

  const contenido = () => {
    const botonNotificar = h('button', { type: 'button', class: 'primario ancho', onclick: async (ev) => {
      ev.target.disabled = true;
      try {
        await activarNotificaciones();
        await api('/push/prueba', { method: 'POST' }).catch(() => {});
        avisar('Notificaciones activadas en este dispositivo');
        $('#dlg-extra').close();
        if (estado.vista === 'cuenta') render();
      } catch (err) {
        avisar(err.message);
        ev.target.disabled = false;
      }
    } }, icono('campana'), 'Activar notificaciones');

    if (instalada) {
      return [
        h('div', { class: 'app-cabecera' }, h('img', { src: 'icons/app-duolab-192.png', alt: '', width: 64, height: 64 }),
          h('div', null, h('h2', null, '¡Ya tienes la app!'), h('p', { class: 'tenue' }, 'Activa las notificaciones para no perderte nada.'))),
        h('ul', { class: 'ventajas' },
          h('li', null, icono('correo'), 'Cada gasto o ingreso que llegue por correo, Yape o el banco, al momento'),
          h('li', null, icono('reloj'), 'Recordatorios de tus pagos antes de que venzan'),
          h('li', null, icono('check'), 'Sin abrir la app: llegan a la pantalla de bloqueo')),
        estadoPush === 'bloqueado'
          ? h('p', { class: 'aviso-bloqueo' }, esIOS ? 'Las notificaciones están bloqueadas. Actívalas en Ajustes → Notificaciones → DUOLAB Gastos.' : 'Las notificaciones están bloqueadas en este navegador. Permítelas desde el candado de la barra de direcciones.')
          : estadoPush !== 'activo' && botonNotificar,
        h('div', { class: 'acciones' }, h('button', { type: 'button', onclick: (ev) => cerrar(ev.target.closest('dialog')) }, estadoPush === 'activo' ? 'Cerrar' : 'Ahora no')),
      ];
    }
    const pestana = (id, texto) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(plataforma === id), onclick: () => { plataforma = id; pintar(); } }, texto);
    return [
      h('div', { class: 'app-cabecera' }, h('img', { src: 'icons/app-duolab-192.png', alt: '', width: 64, height: 64 }),
        h('div', null, h('h2', null, 'Instala DUOLAB Gastos'), h('p', { class: 'tenue' }, 'Úsala como una app: desde tu pantalla de inicio, a pantalla completa y con notificaciones.'))),
      h('ul', { class: 'ventajas' },
        h('li', null, icono('campana'), 'Notificaciones de cada gasto que llegue por correo o del banco, también los que no ves en tu bandeja'),
        h('li', null, icono('reloj'), 'Recordatorios de pago antes del vencimiento'),
        h('li', null, icono('movil'), 'Se abre al instante, sin barra del navegador, y funciona aunque la conexión sea lenta')),
      avisoInstalacion && !esIOS && h('button', { type: 'button', class: 'primario ancho', onclick: async () => {
        await avisoInstalacion.prompt();
        avisoInstalacion = null;
        $('#dlg-extra').close();
      } }, icono('descargar'), 'Instalar ahora'),
      h('div', { class: 'segmentos n3 pestanas-app', role: 'tablist' }, pestana('ios', 'iPhone / iPad'), pestana('android', 'Android'), pestana('pc', 'PC / Mac')),
      pasosInstalar(plataforma),
      !esIOS && estadoPush === 'inactivo' && botonNotificar,
      h('div', { class: 'acciones' },
        h('button', { type: 'button', onclick: (ev) => cerrar(ev.target.closest('dialog')) }, 'Ahora no'),
        h('button', { type: 'button', class: 'primario', onclick: (ev) => cerrar(ev.target.closest('dialog')) }, 'Entendido')),
    ];
  };
  const pintar = () => ventana(h('div', { class: 'aviso-app' }, contenido()), { ancho: 'dlg-app' });

  if (!forzar) {
    // Una sola vez: el aviso de instalar y, ya dentro de la app instalada, el de las notificaciones.
    const clave = instalada ? 'aviso-app-notificaciones-v1' : 'aviso-app-instalar-v1';
    if (guardado.leer(clave) || (instalada && estadoPush !== 'inactivo')) return false;
    guardado.poner(clave, '1');
  }
  pintar();
  return true;
}

// En «Mi cuenta»: estado de la app y de las notificaciones en este dispositivo.
function seccionApp() {
  const caja = h('section', { class: 'panel cuenta-tarjeta' },
    cabeceraCuenta('movil', 'App y notificaciones', 'En este dispositivo.'),
    h('p', { class: 'tenue' }, 'Comprobando…'));
  estadoNotificaciones().then((estadoPush) => {
    const textos = {
      activo: 'Te aviso de cada movimiento nuevo y de tus pagos por vencer.',
      inactivo: 'Actívalas para enterarte de cada gasto al momento.',
      bloqueado: esIOS ? 'Bloqueadas: actívalas en Ajustes → Notificaciones → DUOLAB.' : 'Bloqueadas: permítelas desde el candado de la barra de direcciones.',
      instalar: 'En iPhone, primero instala la app (Compartir → Agregar a inicio).',
      'no-disponible': 'Este navegador no las admite.',
    };
    const chip = (texto, ok) => h('span', { class: `estado-chip ${ok ? 'ok' : ''}` }, texto);
    const accion = (texto, clase, fn) => h('button', { type: 'button', class: clase, onclick: () => intentar(async () => { await fn(); render(); }) }, texto);
    caja.replaceChildren(
      caja.firstChild,
      h('div', { class: 'estado-filas' },
        h('div', null, h('span', null, 'App'), chip(enModoApp() ? 'Instalada' : 'En el navegador', enModoApp())),
        h('div', null, h('span', null, 'Notificaciones'), chip(estadoPush === 'activo' ? 'Activadas' : estadoPush === 'bloqueado' ? 'Bloqueadas' : 'Desactivadas', estadoPush === 'activo'))),
      h('p', { class: 'tenue nota' }, textos[estadoPush]),
      h('div', { class: 'botones-fila' },
        estadoPush === 'inactivo' && accion('Activar', 'primario', async () => { await activarNotificaciones(); avisar('Notificaciones activadas'); }),
        estadoPush === 'activo' && accion('Probar', 'primario', async () => { await api('/push/prueba', { method: 'POST' }); avisar('Notificación enviada'); }),
        estadoPush === 'activo' && accion('Desactivar', '', async () => { await desactivarNotificaciones(); avisar('Notificaciones desactivadas'); }),
        !enModoApp() && h('button', { type: 'button', onclick: () => abrirAvisoApp({ forzar: true }) }, 'Instalar app')));
  });
  return caja;
}

// Al abrir la app desde una notificación (o con ?vista= / ?seccion=), se va a esa parte.
function aplicarDestinoDeUrl() {
  const p = new URLSearchParams(location.search);
  const vista = p.get('vista');
  const seccion = p.get('seccion');
  if (vista && VISTAS[vista]) estado.vista = vista;
  if (seccion && ['calendario', 'pendientes', 'movimientos', 'analisis'].includes(seccion)) {
    estado.vista = 'mes';
    estado.seccion.mes = seccion;
  }
}

// ---------- tutorial del atajo de iPhone para registrar los yapes ----------
// Ventana paso a paso, con dibujos de cada pantalla. Se abre sola una vez en iPhone y desde «Mi cuenta».

async function enlaceAvisos() {
  const { enlace } = await api('/avisos/enlace');
  return enlace ?? (await api('/avisos/enlace', { method: 'POST' })).enlace;
}

// Bloque que imita una acción de la app Atajos.
const accionAtajo = (color, icono_, titulo, ...filas) => h('div', { class: 'atajo-accion', style: `--c:${color}` },
  h('div', { class: 'atajo-accion-titulo' }, h('span', { class: 'atajo-icono' }, icono_), h('b', null, titulo)),
  filas.map(([clave, valor]) => h('div', { class: 'atajo-fila' }, h('span', null, clave), h('span', { class: 'atajo-valor' }, valor))));

function pantallaYape() {
  // Datos inventados, solo de ejemplo.
  return h('div', { class: 'tel-mini' },
    h('div', { class: 'tel-barra' }, h('span', null, 'Mis movimientos'), h('small', null, 'Ejemplo')),
    [['Bodega Don Lucho', 'Hoy 9:15 am', '- S/ 3.50'], ['Ana Gómez*', 'Hoy 8:40 am', '- S/ 10.00'], ['*** *** 512', 'Ayer 7:05 pm', '- S/ 1.50']]
      .map(([n, t, m]) => h('div', { class: 'tel-fila' }, h('span', null, h('b', null, n), h('small', null, t)), h('span', { class: 'tel-monto' }, m))));
}

async function abrirTutorialAtajo() {
  let paso = 0;
  let enlace = null;
  const copiar = async (boton) => {
    try {
      enlace ??= await enlaceAvisos();
      await navigator.clipboard.writeText(enlace);
      boton.textContent = '✓ Enlace copiado';
    } catch {
      boton.textContent = 'Mantén pulsado el enlace para copiarlo';
    }
  };
  const campoEnlace = () => {
    const caja = h('div', { class: 'tutorial-enlace' }, h('code', null, 'Cargando tu enlace…'));
    enlaceAvisos().then((e) => {
      enlace = e;
      caja.replaceChildren(h('code', null, e));
    }).catch(() => caja.replaceChildren(h('code', null, 'No se pudo cargar. Ábrelo en Mi cuenta.')));
    return caja;
  };

  const PASOS = [
    {
      titulo: 'Registra tus yapes con dos toques',
      texto: 'Apple no deja que otras apps lean las notificaciones de Yape. Con este atajo, en Yape abres «Mostrar movimientos», tocas dos veces la parte de atrás del iPhone y se registran todos los pagos de la pantalla, también los pequeños. Se configura una sola vez (unos 3 minutos).',
      dibujo: () => h('div', { class: 'tutorial-dibujo' }, pantallaYape(), h('div', { class: 'toques' }, h('span'), h('span'), h('small', null, 'toc toc'))),
    },
    {
      titulo: '1. Copia tu enlace personal',
      texto: 'Es la dirección a la que el atajo manda la captura. No la compartas: con ella se registran pagos en tu cuenta.',
      dibujo: () => h('div', { class: 'tutorial-dibujo columna' }, campoEnlace(),
        h('button', { type: 'button', class: 'primario', onclick: (ev) => copiar(ev.currentTarget) }, 'Copiar enlace')),
    },
    {
      titulo: '2. Crea el atajo',
      texto: 'Abre la app Atajos, toca «+» arriba a la derecha, luego «Añadir acción» y busca «Hacer captura de pantalla».',
      dibujo: () => h('div', { class: 'tutorial-dibujo columna' },
        accionAtajo('#3987e5', '📸', 'Hacer captura de pantalla'),
        h('a', { class: 'boton-enlace', href: 'shortcuts://' }, 'Abrir la app Atajos')),
    },
    {
      titulo: '3. Envía la captura a tu enlace',
      texto: 'Añade «Obtener contenido de URL». En URL pega tu enlace. Toca la flechita «>» y elige Método POST y Cuerpo de la solicitud: Archivo → Captura de pantalla.',
      dibujo: () => h('div', { class: 'tutorial-dibujo columna' },
        accionAtajo('#3987e5', '📸', 'Hacer captura de pantalla'),
        accionAtajo('#2fb36b', '🌐', 'Obtener contenido de URL', ['URL', 'tu enlace'], ['Método', 'POST'], ['Cuerpo', 'Archivo'], ['Archivo', 'Captura de pantalla'])),
    },
    {
      titulo: '4. Muestra lo que se registró',
      texto: 'Añade «Obtener valor del diccionario» con la clave «mensaje» y después «Mostrar notificación» con ese valor. Así verás al momento qué pagos entraron.',
      dibujo: () => h('div', { class: 'tutorial-dibujo columna' },
        accionAtajo('#f2a516', '📖', 'Obtener valor del diccionario', ['Clave', 'mensaje']),
        accionAtajo('#e5484d', '🔔', 'Mostrar notificación', ['Texto', 'Valor del diccionario'])),
    },
    {
      titulo: '5. Ponle nombre y actívalo con Toque atrás',
      texto: 'Llama al atajo «Registrar Yape». Luego ve a Ajustes → Accesibilidad → Tocar → Toque atrás → Doble toque y elige «Registrar Yape».',
      dibujo: () => h('div', { class: 'tutorial-dibujo columna' },
        h('div', { class: 'ajustes-ruta' }, ['Ajustes', 'Accesibilidad', 'Tocar', 'Toque atrás', 'Doble toque'].map((t, i) => h('span', null, i ? '›' : '', h('b', null, t)))),
        h('div', { class: 'ajustes-opcion' }, h('span', null, 'Registrar Yape'), h('b', null, '✓'))),
    },
    {
      titulo: '¡Listo! Pruébalo',
      texto: 'Abre Yape → «Mostrar movimientos» y toca dos veces la parte de atrás del iPhone. En unos segundos te llega la notificación. Si mandas la misma lista otra vez, no se repite ningún pago.',
      dibujo: () => h('div', { class: 'tutorial-dibujo' }, pantallaYape(),
        h('div', { class: 'noti-mini' }, h('b', null, 'Registrar Yape'), h('span', null, '✅ 3 movimientos registrados · Total gastos: S/ 15.00'))),
    },
  ];

  const pintar = () => {
    const p = PASOS[paso];
    const ultimo = paso === PASOS.length - 1;
    ventana(h('div', { class: 'tutorial' },
      h('div', { class: 'tutorial-puntos', 'aria-label': `Paso ${paso + 1} de ${PASOS.length}` },
        PASOS.map((_, i) => h('span', { class: i === paso ? 'activo' : i < paso ? 'hecho' : '' }))),
      p.dibujo(),
      h('h2', null, p.titulo),
      h('p', null, p.texto),
      h('div', { class: 'acciones' },
        paso > 0
          ? h('button', { type: 'button', class: 'al-inicio', onclick: () => { paso -= 1; pintar(); } }, 'Atrás')
          : h('button', { type: 'button', class: 'al-inicio', onclick: () => $('#dlg-extra').close() }, 'Ahora no'),
        h('button', { type: 'button', class: 'primario', onclick: () => { if (ultimo) $('#dlg-extra').close(); else { paso += 1; pintar(); } } }, ultimo ? 'Entendido' : paso === 0 ? 'Empezar' : 'Siguiente')),
    ), { ancho: 'dlg-tutorial' });
  };
  pintar();
}

// Una sola vez en cada dispositivo (si ese día no se mostró ya el aviso de instalar la app).
function tutorialAtajoUnaVez() {
  if (guardado.leer('tutorial-atajo-v2')) return;
  guardado.poner('tutorial-atajo-v2', '1');
  abrirTutorialAtajo();
}

// ---------- render ----------

const VISTAS = {
  mes: { cargar: cargarMes, pintar: pintarMes },
  anio: { cargar: cargarAnio, pintar: pintarAnio },
  informe: { cargar: async () => null, pintar: pintarInforme },
  compartir: { cargar: cargarCompartir, pintar: pintarCompartir },
  cuenta: { cargar: async () => null, pintar: pintarCuenta },
  asistente: { cargar: () => api('/ia/estado'), pintar: pintarAsistente },
  metas: { cargar: cargarMetas, pintar: pintarMetas },
  categorias: { cargar: cargarCategorias, pintar: pintarCategorias },
  admin: { cargar: cargarAdmin, pintar: pintarAdmin },
};
// Número de la última descarga de datos; una descarga más antigua que termine tarde se descarta.
let cargas = 0;
// Últimos datos descargados, para repintar (cambio de sección o de día) sin volver a pedirlos.
let memoria = { vista: null, datos: null };

// Datos ya vistos de cada mes y año: al volver a ellos se pintan al instante mientras se actualizan
// por detrás. Se vacía con cualquier cambio, porque una repetición puede afectar a varios meses.
const datosRecordados = new Map();
function claveRecordada() {
  if (estado.vista === 'mes') return `mes|${estado.libroId}|${estado.mes}`;
  if (estado.vista === 'anio') return `anio|${estado.libroId}|${estado.anio}`;
  return null;
}

// Lo que se está viendo; si cambia mientras llega una descarga, esa descarga ya no se pinta.
const loQueSeVe = () => `${estado.vista}|${estado.libroId}|${estado.mes}|${estado.anio}`;

async function render(reutilizar = false) {
  const cont = $('#contenido');
  const libro = libroActual();

  for (const boton of document.querySelectorAll('#nav-inferior [data-vista]')) {
    if (boton.dataset.vista === estado.vista) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  for (const boton of $('#pestanas').children) {
    if (boton.dataset.vista === estado.vista) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  $('#titulo-libro').textContent = libro ? `${libro.nombre} · ${libro.moneda}` : '';
  $('#nuevo-rapido').hidden = !puedeEditar() || estado.vista === 'admin' || estado.vista === 'cuenta';

  if (!libro && estado.vista !== 'admin' && estado.vista !== 'cuenta') {
    cont.replaceChildren(h('p', { class: 'vacio' }, 'No tienes ningún libro. Abre el menú y crea uno con «+ Nuevo libro».'));
    return;
  }
  const vista = VISTAS[estado.vista];
  const pintar = () => cont.replaceChildren(...vista.pintar(memoria.datos).flat().filter(Boolean));
  // Repintar con lo que ya hay (cambio de sección o de día) no pide nada ni anula una descarga en curso.
  if (reutilizar && memoria.vista === estado.vista) return pintar();

  const miCarga = ++cargas;
  const viendo = loQueSeVe();
  const vigente = () => miCarga === cargas && viendo === loQueSeVe();
  try {
    const clave = claveRecordada();
    // Si ya se vio este mes o año, se enseña de inmediato lo recordado y luego se pone al día.
    if (clave && datosRecordados.has(clave)) {
      memoria = { vista: estado.vista, datos: datosRecordados.get(clave) };
      pintar();
    }
    const datos = await vista.cargar();
    if (!vigente()) return;
    if (clave) datosRecordados.set(clave, datos);
    memoria = { vista: estado.vista, datos };
    pintar();
  } catch (err) {
    if (vigente()) cont.replaceChildren(h('p', { class: 'error' }, err.message));
  }
}

// ---------- instalación como app ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Sin service worker la app funciona igual, solo que no se puede instalar.
  });
}

let avisoInstalacion = null;
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  avisoInstalacion = ev;
  $('#instalar').hidden = false;
});
$('#ver-tutorial').addEventListener('click', () => {
  $('#menu').close();
  abrirTutorialAtajo();
});
$('#instalar').addEventListener('click', async () => {
  $('#menu').close();
  if (!avisoInstalacion) return abrirAvisoApp({ forzar: true });
  await avisoInstalacion.prompt();
  avisoInstalacion = null;
});
window.addEventListener('appinstalled', () => ($('#instalar').hidden = true));
// «Instalar app» siempre a mano en el menú mientras no se use instalada (en iPhone explica los pasos).
if (!enModoApp()) $('#instalar').hidden = false;

// ---------- arranque ----------

// Vuelta desde Google: ?google=entrar|nueva|gmail o ?errorGoogle=texto. Se quita de la dirección.
const vuelta = new URLSearchParams(location.search);
const resultadoGoogle = vuelta.get('google');
const errorGoogle = vuelta.get('errorGoogle');
if (resultadoGoogle || errorGoogle) history.replaceState(null, '', location.pathname);
if (resultadoGoogle === 'gmail' || resultadoGoogle === 'nueva') estado.vista = 'cuenta';

googleDisponible = await api('/auth/google/estado').then((r) => {
  minutosGmail = r.minutos ?? minutosGmail;
  return r.disponible;
}).catch(() => false);
pintarModoAcceso();
try {
  const { usuario } = await api('/auth/yo');
  await entrar(usuario);
  if (errorGoogle) avisar(errorGoogle);
  else if (resultadoGoogle === 'gmail') avisar('Gmail vinculado: tus gastos por correo se registrarán solos');
  else if (resultadoGoogle === 'nueva') avisar('Cuenta creada con Google. Añade tu WhatsApp y vincula Gmail si quieres.');
} catch (err) {
  mostrarAcceso();
  // Sin sesión (401) es lo normal; un fallo del servidor sí se le cuenta al usuario.
  if (errorGoogle) $('#auth-error').textContent = errorGoogle;
  else if (err.estado !== 401) $('#auth-error').textContent = err.message;
}
