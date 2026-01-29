/**
 * Calculate file hash from metadata for duplicate detection
 * Hash is based on: filename + row_count + first_row_data + last_row_data
 */
export const calculateFileHash = async (
  filename: string,
  rowCount: number,
  firstRow: Record<string, string>,
  lastRow: Record<string, string>
): Promise<string> => {
  const data = `${filename}|${rowCount}|${JSON.stringify(firstRow)}|${JSON.stringify(lastRow)}`;
  
  // Use Web Crypto API in browser
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  
  // Fallback for Node.js (shouldn't be used in browser, but just in case)
  if (typeof process !== "undefined" && process.versions?.node) {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  }
  
  // Last resort: simple hash (not cryptographically secure, but works)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
};
