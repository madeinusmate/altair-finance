import { isAvatarDataUrl } from "@/lib/user-profile";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 256;

export const readAvatarFile = (file: File): Promise<string> => {
  if (!ALLOWED_TYPES.has(file.type)) {
    return Promise.reject(new Error("Use a JPEG, PNG, or WebP photo."));
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return Promise.reject(new Error("Choose a photo under 8 MB."));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that photo."));
        return;
      }

      const scale = Math.max(OUTPUT_SIZE / image.width, OUTPUT_SIZE / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (OUTPUT_SIZE - width) / 2, (OUTPUT_SIZE - height) / 2, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(objectUrl);

      if (!isAvatarDataUrl(dataUrl)) {
        reject(new Error("That photo is too large. Try another image."));
        return;
      }
      resolve(dataUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that photo."));
    };

    image.src = objectUrl;
  });
};
