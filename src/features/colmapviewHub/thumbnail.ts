/** Small card image, prepared locally from the upload's already-normalized preview. */
export async function makeHubThumbnail(preview: Blob): Promise<string> {
  const bitmap = await createImageBitmap(preview);
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 315;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The card preview could not be created.');
    context.fillStyle = '#151515';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    for (const quality of [0.7, 0.6, 0.5, 0.4, 0.3]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 64 * 1024) return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('The card preview could not be read.'));
        reader.readAsDataURL(blob);
      });
    }
    throw new Error('The card preview could not fit the thumbnail limit.');
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
