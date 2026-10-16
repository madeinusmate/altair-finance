/**
 * Calculate SHA-256 hash of PDF file for duplicate detection
 */
export const calculatePdfHash = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use Web Crypto API
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  
  // Node.js fallback
  if (typeof process !== "undefined" && process.versions?.node) {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
  }
  
  // Last resort: simple hash
  const buffer = Buffer.from(arrayBuffer);
  let hash = 0;
  for (let i = 0; i < buffer.length; i++) {
    hash = ((hash << 5) - hash) + buffer[i];
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};
