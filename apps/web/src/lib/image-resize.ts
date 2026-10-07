/**
 * Browser-side image preparation before upload (no server image library):
 * decode, scale down to fit `maxSize` px on the long side, re-encode. WebP
 * when the browser can encode it, else JPEG. Keeps photos from phones
 * (4000 px, 5 MB) at a sensible size and strips their metadata.
 */
export async function resizeImage(file: Blob, maxSize: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    // White background: transparent PNGs would turn black as JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const webp = await toBlob(canvas, 'image/webp', quality);
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await toBlob(canvas, 'image/jpeg', quality);
    if (!jpeg) throw new Error('Could not encode the image');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Full image (≤ 1600 px) + list thumbnail (≤ 320 px). */
export async function prepareProductImage(file: File): Promise<{ image: Blob; thumbnail: Blob }> {
  const [image, thumbnail] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 320, 0.8)]);
  return { image, thumbnail };
}
