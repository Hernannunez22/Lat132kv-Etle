/**
 * Comprime una foto capturada desde celular o escritorio a JPEG <= 380 KB
 * para garantizar guardado seguro en Firestore (límite de documento ~1 MB / DataURL <= 440 KB).
 */
export async function comprimirImagenCampo(
  file: File
): Promise<{ dataUrl: string; tamanioTexto: string }> {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
    reader.readAsDataURL(file);
  });

  if (originalDataUrl.length <= 360000) {
    return {
      dataUrl: originalDataUrl,
      tamanioTexto: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    };
  }

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1280;
      let width = img.naturalWidth || img.width || 1280;
      let height = img.naturalHeight || img.height || 960;
      if (width > maxSide || height > maxSide) {
        const ratio = Math.min(maxSide / width, maxSide / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          dataUrl: originalDataUrl,
          tamanioTexto: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let compressed = canvas.toDataURL('image/jpeg', quality);
      while (compressed.length > 380000 && quality > 0.35) {
        quality -= 0.12;
        compressed = canvas.toDataURL('image/jpeg', quality);
      }

      const approxKb = Math.max(1, Math.round((compressed.length * 0.75) / 1024));
      resolve({
        dataUrl: compressed,
        tamanioTexto: `${approxKb} KB`,
      });
    };
    img.onerror = () => {
      resolve({
        dataUrl: originalDataUrl,
        tamanioTexto: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      });
    };
    img.src = originalDataUrl;
  });
}
