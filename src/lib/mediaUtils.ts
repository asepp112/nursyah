export async function compressImageToDataUrl(
  file: File,
  maxDimension = 640,
  quality = 0.78,
  maxChars = 230000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        let targetDim = maxDimension;
        let currentQuality = quality;

        for (let attempt = 0; attempt < 5; attempt++) {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height && width > targetDim) {
            height = Math.round((height * targetDim) / width);
            width = targetDim;
          } else if (height > targetDim) {
            width = Math.round((width * targetDim) / height);
            height = targetDim;
          }
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas tidak tersedia pada browser ini.'));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
          if (dataUrl.length <= maxChars) {
            resolve(dataUrl);
            return;
          }
          currentQuality = Math.max(0.35, currentQuality - 0.14);
          targetDim = Math.max(320, Math.round(targetDim * 0.75));
        }

        reject(new Error('Ukuran gambar terlalu besar setelah dikompresi. Pilih foto yang lebih kecil.'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function readFileAsBoundedDataUrl(file: File, maxBytes = 320000): Promise<string> {
  if (file.type.startsWith('image/')) {
    return compressImageToDataUrl(file, 960, 0.78, Math.min(maxBytes, 350000));
  }
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(
        new Error(
          `Ukuran berkas (${Math.round(file.size / 1024)} KB) melebihi batas aman ${Math.round(
            maxBytes / 1024
          )} KB agar database tetap ringan.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
