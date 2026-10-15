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
