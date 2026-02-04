import { NextRequest, NextResponse } from "next/server";
import { getEncryptionKey } from "@/lib/api-utils";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check for tunnel URL from environment (set by Electron)
    const tunnelUrl = process.env.TUNNEL_URL;
    
    if (!tunnelUrl) {
      return NextResponse.json({
        available: false,
        active: false,
        message: "Tunnel is not active. Tunnel URL should be set via TUNNEL_URL environment variable."
      });
    }

    return NextResponse.json({
      available: true,
      active: true,
      url: tunnelUrl
    });

  } catch (error) {
    console.error("Error checking tunnel:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
