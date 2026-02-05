export const config = { runtime: "edge" };

export default function handler(request: Request) {
  const url = new URL(request.url);
  
  // Extract Finverse callback parameters
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const state = url.searchParams.get("state");
  
  // Default target - localhost for development/Electron
  let targetBase = "http://localhost:8528";
  
  // State format: "appId_state_base64EncodedTargetUrl"
  if (state) {
    const parts = state.split("_");
    if (parts.length >= 3) {
      try {
        const encodedTarget = parts.slice(2).join("_");
        const decoded = atob(encodedTarget);
        if (decoded.startsWith("http")) {
          targetBase = decoded;
        }
      } catch {
        // Use default on decode failure
      }
    }
  }
  
  // Build redirect URL
  const targetUrl = new URL("/accounts/connect", targetBase);
  if (code) targetUrl.searchParams.set("code", code);
  if (error) targetUrl.searchParams.set("error", error);
  if (errorDescription) targetUrl.searchParams.set("error_description", errorDescription);
  if (state) targetUrl.searchParams.set("state", state);
  
  return Response.redirect(targetUrl.toString(), 302);
}
