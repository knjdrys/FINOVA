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

export interface ReceiptSuggestion {
  merchant?: string;
  /** Major units (e.g. 250.50), parsed from the file name — never from image text. */
  amountMajor?: number;
  /** ISO date YYYY-MM-DD parsed from the file name or file timestamp. */
  dateISO?: string;
  /** Always 'filename' — this stack ships no OCR engine, and we never claim otherwise. */
  source: 'filename';
}

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

  /**
   * Best-effort hints from the FILE NAME only (plus the file timestamp as a
   * date fallback). There is no OCR in this stack — no text is ever read from
   * the image pixels. Every hint must be reviewed and confirmed by the user;
   * callers must never auto-create a transaction from this output.
   */
  public static suggestFromFileName(fileName: string, lastModified?: number): ReceiptSuggestion {
    const suggestion: ReceiptSuggestion = { source: 'filename' };
    const base = fileName.replace(/\.[a-z0-9]+$/i, '');
    const normalized = base.replace(/[_-]+/g, ' ').trim();

    const dateMatch =
      normalized.match(/(20\d{2})[-. ]?(\d{2})[-. ]?(\d{2})/) ||
      normalized.match(/(\d{2})[-. ](\d{2})[-. ](20\d{2})/);
    if (dateMatch) {
      if (dateMatch[0].startsWith('20')) {
        suggestion.dateISO = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      } else {
        suggestion.dateISO = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }
    } else if (lastModified) {
      const d = new Date(lastModified);
      if (!isNaN(d.getTime())) suggestion.dateISO = d.toISOString().slice(0, 10);
    }

    const amountMatch = normalized.match(/(?:₱|php|p)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i);
    if (amountMatch) {
      const value = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0 && value < 100_000_000) {
        suggestion.amountMajor = Math.round(value * 100) / 100;
      }
    }

    const stopWords = new Set([
      'receipt', 'img', 'image', 'photo', 'pic', 'screenshot', 'scan', 'download',
      'whatsapp', 'telegram', 'signal', 'blind', 'php',
    ]);
    const tokens = normalized
      .replace(/[0-9.,₱$€£¥₹Rst]+/g, ' ')
      .split(/[^A-Za-z&']+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));
    if (dateMatch) {
      for (const part of dateMatch.slice(1)) {
        const i = tokens.indexOf(part);
        if (i >= 0) tokens.splice(i, 1);
      }
    }
    if (tokens.length > 0) {
      const merchant = tokens.slice(0, 3).join(' ');
      if (merchant.length >= 2) suggestion.merchant = merchant;
    }

    return suggestion;
  }

  /** True when at least one usable hint was extracted (used to decide whether to show review UI). */
  public static hasHints(s: ReceiptSuggestion): boolean {
    return s.merchant !== undefined || s.amountMajor !== undefined || s.dateISO !== undefined;
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
