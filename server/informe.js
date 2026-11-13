import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Logo de DUOLAB para la cabecera del PDF (si falta el archivo, se escribe el nombre).
const LOGO = fileURLToPath(new URL('../public/logo-duolab.png', import.meta.url));

const MARGEN = 40;
const ALTO_FILA = 18;
// Fecha, descripción, categoría, estado y monto (suman el ancho útil de un A4: 515 pt).
const COLUMNAS = [
  { titulo: 'Fecha', ancho: 62 },
  { titulo: 'Descripción', ancho: 208 },
  { titulo: 'Categoría', ancho: 100 },
  { titulo: 'Estado', ancho: 65 },
  { titulo: 'Monto', ancho: 80, derecha: true },
];
const ANCHO = COLUMNAS.reduce((total, c) => total + c.ancho, 0);

// Las fuentes estándar del PDF solo cubren Latin-1: se normalizan espacios, guiones y comillas,
// y lo que no se puede dibujar (emojis, otros alfabetos) se quita.
const limpio = (valor) =>
  String(valor)
    .replace(/[  ]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\xff€]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();

export function formateador(moneda) {
  const crear = (currencyDisplay) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, currencyDisplay });
  let formato;
  try {
    formato = crear('narrowSymbol');
    // Símbolos fuera de Latin-1 (₹, ₩…) no se pueden dibujar: se usa el código de la moneda.
    if (/[^\x20-\xff€  ]/.test(formato.format(1))) formato = crear('code');
  } catch {
    return (n) => `${n.toFixed(2)} ${moneda}`;
  }
  return (n) => limpio(formato.format(n));
}

const fechaCorta = (fecha) => {
  const [anio, mes, dia] = fecha.toISOString().slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
};

function estadoDe(mov, hoy) {
  if (mov.tipo === 'ingreso') return mov.pagado ? 'Recibido' : 'Por recibir';
  if (mov.pagado) return 'Pagado';
  return mov.fecha < hoy ? 'Vencido' : 'Pendiente';
}

function encabezadoTabla(doc) {
  const y = doc.y;
  doc.rect(MARGEN, y, ANCHO, ALTO_FILA).fill('#111111');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  let x = MARGEN;
  for (const col of COLUMNAS) {
    doc.text(col.titulo.toUpperCase(), x + 5, y + 5.5, { width: col.ancho - 10, align: col.derecha ? 'right' : 'left', lineBreak: false });
    x += col.ancho;
  }
  doc.fillColor('#000000').y = y + ALTO_FILA;
}

// Salta de página si no caben «alto» puntos más; devuelve true si saltó.
function asegurarEspacio(doc, alto) {
  if (doc.y + alto <= doc.page.height - MARGEN - 20) return false;
  doc.addPage();
  return true;
}

function tabla(doc, titulo, movimientos, dinero, hoy) {
  asegurarEspacio(doc, ALTO_FILA * 4 + 30);
  doc.moveDown(1.2).font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(titulo, MARGEN, doc.y);
  doc.moveDown(0.4);

  if (movimientos.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#666666').text('Sin movimientos en este periodo.', MARGEN, doc.y);
    return;
  }

  encabezadoTabla(doc);
  let total = 0;
  movimientos.forEach((mov, i) => {
    if (asegurarEspacio(doc, ALTO_FILA)) encabezadoTabla(doc);
    const y = doc.y;
    if (i % 2 === 1) doc.rect(MARGEN, y, ANCHO, ALTO_FILA).fill('#f3f3f3');

    const estado = estadoDe(mov, hoy);
    const celdas = [fechaCorta(mov.fecha), limpio(mov.moneda ? `${mov.descripcion} (${mov.moneda} ${mov.montoOriginal.toFixed(2)})` : mov.descripcion), limpio(mov.categoria), estado, dinero(mov.monto)];
    let x = MARGEN;
    COLUMNAS.forEach((col, c) => {
      const destacado = c === 3 && (estado === 'Vencido' || estado === 'Pendiente' || estado === 'Por recibir');
      doc.font(destacado || c === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(estado === 'Vencido' && c === 3 ? '#c4121c' : '#000000');
      doc.text(celdas[c], x + 5, y + 5, { width: col.ancho - 10, height: ALTO_FILA - 6, align: col.derecha ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += col.ancho;
    });
    doc.y = y + ALTO_FILA;
    total += mov.monto;
  });

  if (asegurarEspacio(doc, ALTO_FILA + 4)) encabezadoTabla(doc);
  const y = doc.y;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(1).stroke('#000000');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000');
  doc.text(`Total (${movimientos.length})`, MARGEN + 5, y + 6, { width: 300, lineBreak: false });
  doc.text(dinero(total), MARGEN, y + 6, { width: ANCHO - 5, align: 'right', lineBreak: false });
  doc.y = y + ALTO_FILA + 4;
}

function resumen(doc, datos) {
  const hueco = 8;
  const ancho = (ANCHO - hueco * (datos.length - 1)) / datos.length;
  const y = doc.y;
  datos.forEach(([etiqueta, valor, invertido], i) => {
    const x = MARGEN + i * (ancho + hueco);
    doc.roundedRect(x, y, ancho, 46, 6);
    if (invertido) doc.fill('#000000');
    else doc.lineWidth(0.8).stroke('#999999');
    doc.font('Helvetica').fontSize(7.5).fillColor(invertido ? '#cccccc' : '#666666')
      .text(etiqueta.toUpperCase(), x + 8, y + 9, { width: ancho - 16, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(invertido ? '#ffffff' : '#000000')
      .text(valor, x + 8, y + 23, { width: ancho - 16, lineBreak: false, ellipsis: true });
  });
  doc.fillColor('#000000').y = y + 46;
}

// Escribe en «salida» (la respuesta HTTP) el informe del periodo con todos los gastos e ingresos.
export function generarInforme(salida, { libro, desde, hasta, movimientos }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true, info: { Title: `Informe de gastos - ${limpio(libro.nombre)}` } });
  doc.pipe(salida);

  const dinero = formateador(libro.moneda);
  const hoy = new Date(new Date().toISOString().slice(0, 10));
  const gastos = movimientos.filter((m) => m.tipo === 'gasto');
  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso');
  const suma = (lista) => lista.reduce((total, m) => total + m.monto, 0);

  if (existsSync(LOGO)) doc.image(LOGO, MARGEN, MARGEN, { height: 20 });
  else doc.font('Helvetica-Bold').fontSize(20).text('DUOLAB', MARGEN, MARGEN, { characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(13).text('Informe de gastos', MARGEN, MARGEN + 26);
  doc.font('Helvetica').fontSize(10).fillColor('#444444')
    .text(`Libro: ${limpio(libro.nombre)}  ·  Moneda: ${libro.moneda}`, MARGEN, MARGEN + 44)
    .text(`Periodo: del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`, MARGEN, MARGEN + 58);
  doc.fillColor('#000000').y = MARGEN + 82;

  resumen(doc, [
    ['Ingresos', dinero(suma(ingresos))],
    ['Gastos', dinero(suma(gastos))],
    ['Balance', dinero(suma(ingresos) - suma(gastos)), true],
    ['Falta por pagar', dinero(suma(gastos.filter((m) => !m.pagado)))],
  ]);

  tabla(doc, 'Gastos', gastos, dinero, hoy);
  tabla(doc, 'Ingresos', ingresos, dinero, hoy);

  // Pie con numeración, una vez conocidas todas las páginas.
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    // Sin margen inferior para poder escribir en el pie sin que se cree otra página.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#777777');
    doc.text(`Generado el ${fechaCorta(new Date())}`, MARGEN, doc.page.height - 30, { lineBreak: false });
    doc.text(`Página ${i + 1} de ${count}`, MARGEN, doc.page.height - 30, { width: ANCHO, align: 'right', lineBreak: false });
  }
  doc.end();
}
