import { PAYEE_ICON_EDGE_PX, PAYEE_ICON_MAX_BYTES, normalizePayeeIconImage } from "./icon-image";

const SOURCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SOURCE_MAX_BYTES = 2 * 1024 * 1024;

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const subtype = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpeg";
  return `data:image/${subtype};base64,${btoa(binary)}`;
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Crop to a square and compress until the stored image fits the cap.
export const preparePayeeIconImage = async (file: File): Promise<string> => {
  if (!SOURCE_TYPES.has(file.type)) {
    throw new Error("Use a PNG, JPEG, or WebP image");
  }
  if (file.size > SOURCE_MAX_BYTES) {
    throw new Error("Choose an image under 2 MB");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = PAYEE_ICON_EDGE_PX;
  canvas.height = PAYEE_ICON_EDGE_PX;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not read that image");
  }

  const scale = Math.max(PAYEE_ICON_EDGE_PX / bitmap.width, PAYEE_ICON_EDGE_PX / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (PAYEE_ICON_EDGE_PX - width) / 2, (PAYEE_ICON_EDGE_PX - height) / 2, width, height);
  bitmap.close();

  const attempts: Array<{ type: string; quality: number }> = [
    { type: "image/webp", quality: 0.8 },
    { type: "image/webp", quality: 0.6 },
    { type: "image/jpeg", quality: 0.7 },
    { type: "image/jpeg", quality: 0.5 },
  ];

  for (const attempt of attempts) {
    const blob = await canvasBlob(canvas, attempt.type, attempt.quality);
    if (!blob || blob.size > PAYEE_ICON_MAX_BYTES) continue;
    return normalizePayeeIconImage(await blobToDataUrl(blob)) ?? "";
  }

  throw new Error("Payee image must be 16 KB or smaller");
};
