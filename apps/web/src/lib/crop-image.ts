import type { Area } from 'react-easy-crop';

// Mismo tope que el backend (sharp resize 2000x2000 inside): subir más grande
// solo gasta datos móviles, el server lo achicaría igual.
const MAX_OUTPUT_SIZE = 2000;
const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen'));
    image.src = src;
  });
}

// Tamaño del rectángulo que contiene a la imagen rotada (react-easy-crop
// expresa el área recortada en coordenadas de este bounding box).
function rotatedSize(width: number, height: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height)
  };
}

/**
 * Recorta y rota la imagen en un canvas del tamaño final (no del bounding
 * box rotado completo): una foto de celular rotada puede pasar el límite de
 * ~16M píxeles de canvas de iOS Safari y salir en blanco sin error.
 * Las zonas sin imagen (esquinas al enderezar, transparencias de PNG) quedan
 * en blanco: JPEG no tiene canal alfa y si no se pintan salen negras.
 */
export async function cropImageToFile(
  src: string,
  area: Area,
  rotation: number,
  fileName: string
): Promise<File> {
  const image = await loadImage(src);
  const bBox = rotatedSize(image.naturalWidth, image.naturalHeight, rotation);

  const scale = Math.min(1, MAX_OUTPUT_SIZE / area.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no soporta edición de imágenes');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';

  // Coordenadas del bounding box → canvas de salida; luego rotar alrededor
  // del centro de la imagen, que coincide con el centro del bounding box.
  ctx.scale(scale, scale);
  ctx.translate(-area.x, -area.y);
  ctx.translate(bBox.width / 2, bBox.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.drawImage(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY)
  );
  if (!blob) throw new Error('No se pudo generar la imagen recortada');

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagen';
  return new File([blob], `${baseName}.jpg`, { type: OUTPUT_TYPE });
}
