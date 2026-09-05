/**
 * Receipt attachments — truthful local-first implementation.
 *
 * FINOVA has no object storage (Supabase Buckets) provisioned, so receipts are
 * stored as compressed data URLs inside the transaction record (localStorage +
 * cloud row). This keeps the feature real: images survive reloads and sync,
 * without pretending a bucket exists. Limits are enforced, not decorative:
 *  - input must be an image file, max 10 MB before processing
 *  - output is downscaled to max 1024px and JPEG-compressed to ~200 KB target
 *  - anything still over 500 KB after compression is rejected with a clear reason
 */

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 500 * 1024;
const MAX_DIMENSION = 1024;
const INITIAL_QUALITY = 0.82;

export class ReceiptService {
  /**
   * Reads an image File and returns a compressed JPEG data URL.
   * Returns { dataUrl } on success or { error } with a human-readable reason.
   */
  public static async compress(file: File): Promise<{ dataUrl?: string; error?: string }> {
    if (!file.type.startsWith('image/')) {
      return { error: 'Receipts must be an image (JPG, PNG, or WebP).' };
    }
    if (file.size > MAX_INPUT_BYTES) {
      return { error: 'That image is over 10 MB. Please pick a smaller photo.' };
    }

    try {
      const raw = await readAsDataUrl(file);
      const img = await loadImage(raw);

      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'This browser cannot process images.' };
      ctx.drawImage(img, 0, 0, w, h);

      // Step quality down until we fit the budget, or give up honestly.
      let quality = INITIAL_QUALITY;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (byteLength(dataUrl) > MAX_OUTPUT_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (byteLength(dataUrl) > MAX_OUTPUT_BYTES) {
        return { error: 'This image is too detailed to store. Try a tighter crop.' };
      }
      return { dataUrl };
    } catch {
      return { error: 'Could not read that image. It may be corrupted.' };
    }
  }

  /** Rough decoded size of a data URL (base64 → bytes). */
  public static sizeOf(dataUrl: string): number {
    return byteLength(dataUrl);
  }
}

function byteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}
