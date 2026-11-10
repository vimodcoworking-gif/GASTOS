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
  seccion: { mes: 'calendario', anio: 'grafica', admin: 'almacenamiento' },
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
  for (const hijo of hijos.flat()) if (hijo != null && hijo !== false) el.append(hijo);
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
  render();
}

// ---------- tema claro u oscuro ----------

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $('#cambiar-tema').textContent = tema === 'claro' ? 'Modo oscuro' : 'Modo claro';
  $('meta[name=theme-color]').content = tema === 'claro' ? '#f2f2f2' : '#000000';
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
  $('#categorias').replaceChildren(...CATEGORIAS[tipo].map((c) => h('option', { value: c })));
}

// Sin movimiento abre el alta; «fecha» propone un día concreto (el elegido en el calendario).
function abrirMovimiento(mov = null, fecha = null) {
  movEnEdicion = mov;
  const form = $('#form-mov');
  form.reset();
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

// Un movimiento como fila de lista; se usa en el calendario, en pendientes y en el listado del mes.
// Tocar el movimiento lo abre para editarlo o eliminarlo; al lado queda solo el botón de pagar.
function filaMovimiento(m, editar) {
  const contenido = [
    h('span', { class: 'cuerpo' },
      h('strong', null, m.descripcion,
        m.enSerie && h('span', { class: 'tenue', title: 'Se repite cada mes' }, ' ↻'),
        m.desdeCorreo && h('span', { class: 'tenue', title: 'Registrado desde tu correo de Gmail' }, ' 📧')),
      h('small', null, `${fechaCorta(m.fecha)} · ${m.categoria} `),
      chipEstado(m),
    ),
    h('span', { class: `monto ${m.tipo}` }, `${m.tipo === 'gasto' ? '−' : '+'}${dinero(m.monto)}`),
  ];
  if (!editar) return h('li', { class: 'mov' }, h('div', { class: 'mov-abrir' }, contenido));

  return h('li', { class: 'mov' },
    h('button', { type: 'button', class: 'mov-abrir', title: 'Editar o eliminar', onclick: () => abrirMovimiento(m) }, contenido),
    m.pagado
      ? h('button', { type: 'button', class: 'mini', onclick: () => marcarPagado(m, false), 'aria-label': `Deshacer el pago de ${m.descripcion}` }, 'Deshacer')
      : h('button', { type: 'button', class: 'mini primario', onclick: () => marcarPagado(m, true) }, m.tipo === 'gasto' ? 'Pagar' : 'Cobrar'),
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

const tarjeta = (etiqueta, valor, nota, clase = '') =>
  h('div', { class: `tarjeta ${clase}` },
    h('div', { class: 'etiqueta' }, etiqueta),
    h('div', { class: 'valor' }, valor),
    nota && h('div', { class: 'nota' }, nota),
  );

// Botones que cambian la sección visible de una vista sin volver a pedir los datos.
// opciones: [valor, etiqueta, contador opcional, contador en rojo]
function segmentos(vista, opciones) {
  return h('div', { class: 'segmentos', role: 'tablist' },
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
      h('div', { class: 'dos-columnas' },
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
        h('section', { class: 'panel' },
          estado.dia
            ? [
                h('header', null,
                  h('h3', null, fechaTexto(estado.dia, { weekday: 'long', day: 'numeric', month: 'long' })),
                  h('span', { class: 'espacio' }),
                  h('button', { type: 'button', class: 'mini', onclick: verDia(null) }, `Ver todo ${mesCorto}`)),
                listaMovimientos(delDia, editar, 'No hay movimientos este día.'),
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
                listaMovimientos([...sinPagar, ...actual.filter((m) => m.pagado)], editar, 'No hay movimientos este mes.'),
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
        h('header', null, h('h3', null, 'Movimientos del mes')),
        listaMovimientos(actual, editar, 'No hay movimientos este mes.'),
      ),
  };

  return [
    h('div', { class: 'periodo' },
      h('button', { type: 'button', class: 'cuadrado', onclick: () => irAMes(moverMes(estado.mes, -1)), 'aria-label': 'Mes anterior' }, '‹'),
      h('h2', null, nombreMes(estado.mes)),
      h('button', { type: 'button', class: 'cuadrado', onclick: () => irAMes(siguiente), 'aria-label': 'Mes siguiente' }, '›'),
      estado.mes !== mesActual && h('button', { type: 'button', onclick: () => irAMes(mesActual) }, 'Hoy'),
      h('span', { class: 'espacio' }),
      h('button', { type: 'button', title: 'Descargar el informe de este mes en PDF', onclick: () => descargarPdf(...rangoDeMes(estado.mes)) }, 'PDF'),
    ),

    h('div', { class: 'tarjetas' },
      tarjeta('Ingresos', dinero(t.ingresos), t.ingresosPendientes > 0 ? `${dinero(t.ingresosPendientes)} por recibir` : 'Todo recibido'),
      tarjeta('Gastos', dinero(t.gastos), `${dinero(t.gastos - t.gastosPendientes)} ya pagado`),
      tarjeta('Balance', dinero(t.balance), 'Ingresos menos gastos', 'destacada'),
      tarjeta('Falta por pagar', dinero(t.gastosPendientes), 'Gastos sin pagar del mes'),
    ),

    h('button', { type: 'button', class: 'tira', onclick: () => irAMes(siguiente), title: 'Ver el mes siguiente' },
      h('strong', null, `Próximo mes · ${nombreMes(siguiente, { month: 'long' })}`),
      h('span', null, `Ingresos ${dinero(tp.ingresos)}`),
      h('span', null, `Gastos ${dinero(tp.gastos)}`),
      h('span', null, h('b', null, `Balance ${dinero(tp.balance)}`)),
      h('span', { class: 'flecha', 'aria-hidden': 'true' }, '›'),
    ),

    segmentos('mes', [
      ['calendario', 'Calendario'],
      ['pendientes', 'Pendientes', pendientesVista.length, true],
      ['movimientos', 'Movimientos', actual.length],
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
      tarjeta('Ingresos del año', dinero(t.ingresos), t.ingresosPendientes > 0 ? `${dinero(t.ingresosPendientes)} por recibir` : 'Todo recibido'),
      tarjeta('Gastos del año', dinero(t.gastos), `${dinero(t.gastosPagados)} ya pagado`),
      tarjeta('Balance del año', dinero(t.balance), 'Ingresos menos gastos', 'destacada'),
      tarjeta('Falta por pagar', dinero(t.gastosPendientes), 'Gastos sin pagar del año'),
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
        h('table', null,
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

  const g = u.gmail;
  const cuando = (fecha) => (fecha ? new Date(fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'todavía no');
  const actualizar = (usuario) => {
    estado.usuario = usuario;
    render();
  };
  const revisar = () => intentar(async () => {
    avisar('Revisando tu correo…');
    const { nuevos, usuario } = await api('/auth/google/gmail/revisar', { method: 'POST' });
    actualizar(usuario);
    avisar(usuario.gmail?.error ? usuario.gmail.error : nuevos ? `${nuevos} gasto${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'} registrado${nuevos === 1 ? '' : 's'}` : 'No hay gastos nuevos en tu correo');
  });
  const pausar = (activo) => intentar(async () => actualizar((await api('/auth/google/gmail', { method: 'PATCH', body: { activo } })).usuario));
  const desvincular = () => {
    if (!confirm('¿Dejar de leer tu Gmail? Los gastos ya registrados se quedan en tu libro.')) return;
    intentar(async () => {
      actualizar((await api('/auth/google/gmail', { method: 'DELETE' })).usuario);
      avisar('Gmail desvinculado');
    });
  };

  const escanear = (ev) => {
    ev.preventDefault();
    const meses = ev.target.meses.value;
    intentar(async () => {
      const { mensaje, usuario } = await api('/auth/google/gmail/escanear', { method: 'POST', body: { meses } });
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
  const e = g?.escaneo;
  const textoEscaneo = e && (e.estado === 'en curso'
    ? `⏳ Revisando tus correos ${e.desde.startsWith('2004-01-01') ? 'de todo tu Gmail' : `del ${fechaDe(e.desde)} al ${fechaDe(e.hasta)}`}: ${e.revisados} revisados, ${e.registrados} movimientos registrados hasta ahora.`
    : e.estado === 'error'
      ? `La última revisión de correos anteriores falló: ${e.error}`
      : `Última revisión de correos anteriores (del ${fechaDe(e.desde)} al ${fechaDe(e.hasta)}): ${e.revisados} correos revisados, ${e.registrados} movimientos registrados${e.duplicados ? `, ${e.duplicados} ya estaban anotados` : ''}.${e.quedan ? ' Quedan más correos en ese periodo: vuelve a escanear para seguir.' : ''}`);

  const seccionEscaneo = g && h('div', { class: 'escaneo' },
    h('h4', null, 'Correos anteriores'),
    h('p', { class: 'tenue' }, 'Revisa los avisos de compras, pagos e ingresos que ya tienes en tu Gmail, de los meses que elijas o de todo tu correo, y regístralos en tu libro y calendario. Avanza solo por tandas hasta terminar. Los que ya anotaste (mismo monto y fecha) no se duplican. También puedes pedírselo al Asistente IA.'),
    textoEscaneo && h('p', { class: e.estado === 'error' ? 'error' : null }, textoEscaneo),
    e?.estado === 'en curso'
      ? h('div', { class: 'acciones' },
          h('button', { type: 'button', onclick: recargarCuenta }, 'Actualizar progreso'),
          h('button', { type: 'button', class: 'peligro', onclick: detenerEscaneo }, 'Detener'),
        )
      : h('form', { class: 'form-linea', onsubmit: escanear },
          h('label', null, 'Periodo',
            h('select', { name: 'meses' },
              h('option', { value: '1' }, 'Último mes'),
              h('option', { value: '3' }, 'Últimos 3 meses'),
              h('option', { value: '6' }, 'Últimos 6 meses'),
              h('option', { value: '12' }, 'Último año'),
              h('option', { value: '24' }, 'Últimos 2 años'),
              h('option', { value: 'todo' }, 'Todo mi correo'),
            )),
          h('button', { class: 'primario' }, 'Escanear correos'),
        ),
  );

  const seccionGmail = googleDisponible && h('section', { class: 'panel' },
    h('header', null, h('h3', null, 'Gastos desde tu Gmail'), g && h('span', { class: 'tenue' }, g.email)),
    g
      ? [
          h('p', null, g.activo
            ? 'El bot revisa tu correo cada pocos minutos y registra solo en tu libro y en el calendario los gastos e ingresos que te avisan tus bancos, Yape, Plin, tiendas y apps (compras, pagos, transferencias, yapeos recibidos, sueldo). Los verás marcados con 📧.'
            : 'La lectura de tu correo está en pausa: no se registra nada nuevo.'),
          g.error && h('p', { class: 'error' }, g.error),
          h('p', { class: 'tenue' }, `Última revisión: ${cuando(g.ultimaRevision)} · Registrados desde el correo: ${g.registrados}. Solo se leen correos recibidos desde el ${new Date(g.desde).toLocaleDateString('es')}.`),
          u.whatsapp
            ? h('p', { class: 'tenue' }, 'Cada movimiento que se registre te llegará también por WhatsApp; si alguno no es correcto, responde «deshacer».')
            : h('p', { class: 'tenue' }, 'Añade tu WhatsApp arriba para recibir un aviso cada vez que se registre un gasto.'),
          h('div', { class: 'acciones' },
            g.activo && h('button', { type: 'button', class: 'primario', onclick: revisar }, 'Revisar ahora'),
            h('button', { type: 'button', onclick: () => pausar(!g.activo) }, g.activo ? 'Pausar' : 'Reanudar'),
            h('button', { type: 'button', class: 'peligro', onclick: desvincular }, 'Desvincular'),
          ),
          seccionEscaneo,
        ]
      : [
          h('p', null, 'Vincula tu cuenta de Google para que el bot lea los avisos de compra y pago que te llegan por correo y los registre solo como gastos en tu libro.'),
          h('p', { class: 'tenue' }, 'Google te pedirá permiso para leer tus correos. Solo se abren los avisos de compras y pagos, nunca se envía ni se borra nada, y puedes desvincularlo cuando quieras.'),
          h('button', { type: 'button', class: 'primario', onclick: () => location.assign('/api/auth/google?modo=gmail') }, 'Vincular con Google'),
        ],
  );

  return [
    h('div', { class: 'periodo' }, h('h2', { class: 'izquierda' }, 'Mi cuenta')),
    h('section', { class: 'panel' },
      h('form', { class: 'form-linea', onsubmit: guardar },
        h('label', null, 'Nombre', h('input', { name: 'nombre', maxLength: 60, required: true, value: u.nombre })),
        h('label', null, 'Correo', h('input', { value: u.email, disabled: true })),
        h('label', null, 'WhatsApp (con código de país)',
          h('input', { name: 'whatsapp', type: 'tel', maxLength: 24, placeholder: '51 987 654 321', value: u.whatsapp ? `+${u.whatsapp}` : '' })),
        h('button', { class: 'primario' }, 'Guardar'),
      ),
    ),
    h('section', { class: 'panel' },
      h('header', null, h('h3', null, 'Para qué sirve el WhatsApp')),
      h('p', null, u.whatsapp
        ? 'El bot de WhatsApp te reconoce por este número: desde él puedes pedir tu estado de cuenta, tus deudas o el informe en PDF, y aquí recibirás los estados de cuenta que envíe el administrador.'
        : 'Añade tu número para poder pedir por WhatsApp tu estado de cuenta, tus deudas o el informe en PDF, y para recibir los estados de cuenta que envíe el administrador.'),
      h('p', { class: 'tenue' }, 'Escribe el número con el código de país (51 para Perú). Si lo dejas vacío, el bot no te responderá.'),
      !u.tienePassword && h('p', { class: 'tenue' }, 'Tu cuenta usa Google para entrar. Si quieres entrar también con contraseña, cierra sesión y usa «¿Olvidaste tu contraseña?».'),
    ),
    seccionGmail,
  ];
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

// ---------- render ----------

const VISTAS = {
  mes: { cargar: cargarMes, pintar: pintarMes },
  anio: { cargar: cargarAnio, pintar: pintarAnio },
  informe: { cargar: async () => null, pintar: pintarInforme },
  compartir: { cargar: cargarCompartir, pintar: pintarCompartir },
  cuenta: { cargar: async () => null, pintar: pintarCuenta },
  asistente: { cargar: () => api('/ia/estado'), pintar: pintarAsistente },
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
$('#instalar').addEventListener('click', async () => {
  $('#instalar').hidden = true;
  $('#menu').close();
  await avisoInstalacion?.prompt();
  avisoInstalacion = null;
});
window.addEventListener('appinstalled', () => ($('#instalar').hidden = true));

// ---------- arranque ----------

// Vuelta desde Google: ?google=entrar|nueva|gmail o ?errorGoogle=texto. Se quita de la dirección.
const vuelta = new URLSearchParams(location.search);
const resultadoGoogle = vuelta.get('google');
const errorGoogle = vuelta.get('errorGoogle');
if (resultadoGoogle || errorGoogle) history.replaceState(null, '', location.pathname);
if (resultadoGoogle === 'gmail' || resultadoGoogle === 'nueva') estado.vista = 'cuenta';

googleDisponible = await api('/auth/google/estado').then((r) => r.disponible).catch(() => false);
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
