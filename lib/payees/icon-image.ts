export const PAYEE_ICON_EDGE_PX = 64;
export const PAYEE_ICON_MAX_BYTES = 16 * 1024;

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export class PayeeIconImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayeeIconImageError";
  }
}

const hasImageMagic = (type: string, bytes: Buffer): boolean => {
  if (type === "png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (type === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "webp") {
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
};

// Accept a data URL only after the bytes match PNG, JPEG, or WebP and stay under the cap.
export const normalizePayeeIconImage = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new PayeeIconImageError("Payee image must be a PNG, JPEG, or WebP");
  }

  const match = DATA_URL.exec(value);
  if (!match) {
    throw new PayeeIconImageError("Payee image must be a PNG, JPEG, or WebP");
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > PAYEE_ICON_MAX_BYTES) {
    throw new PayeeIconImageError("Payee image must be 16 KB or smaller");
  }
  if (!hasImageMagic(match[1], bytes)) {
    throw new PayeeIconImageError("Payee image must be a PNG, JPEG, or WebP");
  }

  return `data:image/${match[1]};base64,${match[2]}`;
};

const pngSize = (bytes: Buffer): { width: number; height: number } | null => {
  if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const webpSize = (bytes: Buffer): { width: number; height: number } | null => {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") {
    const limit = Math.min(bytes.length - 7, 48);
    for (let index = 20; index < limit; index += 1) {
      if (bytes[index] !== 0x9d || bytes[index + 1] !== 0x01 || bytes[index + 2] !== 0x2a) continue;
      return {
        width: bytes.readUInt16LE(index + 3) & 0x3fff,
        height: bytes.readUInt16LE(index + 5) & 0x3fff,
      };
    }
  }
  return null;
};

const jpegSize = (bytes: Buffer): { width: number; height: number } | null => {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
};

// Width and height of a data URL that already passed normalizePayeeIconImage.
export const payeeIconImageSize = (value: string): { width: number; height: number } | null => {
  const normalized = normalizePayeeIconImage(value);
  if (!normalized) return null;
  const match = DATA_URL.exec(normalized);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (match[1] === "png") return pngSize(bytes);
  if (match[1] === "webp") return webpSize(bytes);
  return jpegSize(bytes);
};
