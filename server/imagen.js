// Prepara las fotos y capturas para la IA: una captura de iPhone pesa 2-4 MB y la IA de NVIDIA solo acepta
// imágenes de unos 180 KB (Claude, hasta 5 MB y como mucho 1568 px de lado). Se reducen y comprimen en JPEG
// manteniendo el texto legible.
import sharp from 'sharp';

// Tamaño máximo del archivo comprimido según el proveedor (NVIDIA cuenta el base64, que ocupa un 33 % más).
const LIMITE = { nvidia: 130 * 1024, claude: 3.5 * 1024 * 1024 };

export class ErrorImagen extends Error {}

/**
 * Devuelve { base64, mime: 'image/jpeg', ancho, alto, bytes } listo para la IA.
 * «proveedor»: 'nvidia' | 'claude' (por defecto, el más estricto).
 */
export async function imagenParaIa(buffer, proveedor = 'nvidia') {
  let base;
  try {
    // rotate() aplica la orientación de la foto; se quita el canal alfa (fondo blanco) para JPEG.
    base = sharp(buffer, { failOn: 'none', limitInputPixels: 80_000_000 }).rotate().flatten({ background: '#ffffff' });
    await base.metadata();
  } catch {
    throw new ErrorImagen('No pude abrir la imagen. Si es HEIC, en el atajo añade «Convertir imagen» a JPEG antes de enviarla.');
  }
  const { width = 0, height = 0 } = await base.metadata();
  if (!width || !height) throw new ErrorImagen('La imagen está vacía o dañada.');

  const limite = LIMITE[proveedor] ?? LIMITE.nvidia;
  // Ancho objetivo: las capturas del teléfono se leen bien a 720-1000 px de ancho.
  const anchos = proveedor === 'claude' ? [1100, 900] : [1000, 860, 760, 640, 540];
  const calidades = proveedor === 'claude' ? [82, 72] : [78, 68, 58, 48];
  let mejor = null;
  for (const anchoMax of anchos) {
    // Lado largo como mucho 1568 px (lo que la IA aprovecha); las capturas muy altas se reducen más.
    const escala = Math.min(1, anchoMax / width, 1568 / Math.max(width, height) * (proveedor === 'claude' ? 1 : 1.4));
    const ancho = Math.max(1, Math.round(width * escala));
    for (const calidad of calidades) {
      const salida = await base.clone().resize({ width: ancho, withoutEnlargement: true }).jpeg({ quality: calidad, mozjpeg: true }).toBuffer();
      mejor = salida;
      if (salida.length <= limite) {
        const meta = await sharp(salida).metadata();
        return { base64: salida.toString('base64'), mime: 'image/jpeg', ancho: meta.width, alto: meta.height, bytes: salida.length };
      }
    }
  }
  // Ni con la menor calidad cabe: se manda la más pequeña conseguida.
  const meta = await sharp(mejor).metadata();
  return { base64: mejor.toString('base64'), mime: 'image/jpeg', ancho: meta.width, alto: meta.height, bytes: mejor.length };
}

/** Si el cuerpo es multipart/form-data (atajo con «Formulario»), devuelve el primer archivo que traiga. */
export function archivoDeFormulario(buffer, tipoContenido = '') {
  const limite = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipoContenido);
  if (!limite || !Buffer.isBuffer(buffer)) return null;
  const separador = Buffer.from(`--${limite[1] ?? limite[2]}`);
  let desde = buffer.indexOf(separador);
  while (desde !== -1) {
    const siguiente = buffer.indexOf(separador, desde + separador.length);
    if (siguiente === -1) break;
    const parte = buffer.subarray(desde + separador.length, siguiente);
    const finCabecera = parte.indexOf('\r\n\r\n');
    if (finCabecera !== -1) {
      const cabecera = parte.subarray(0, finCabecera).toString('utf8');
      if (/filename=|content-type:\s*(image|application\/pdf|application\/octet-stream)/i.test(cabecera)) {
        const mime = /content-type:\s*([^\r\n;]+)/i.exec(cabecera)?.[1]?.trim() ?? 'application/octet-stream';
        // Se quita el salto de línea final de la parte.
        return { datos: parte.subarray(finCabecera + 4, parte.length - 2), mime };
      }
    }
    desde = siguiente;
  }
  return null;
}
