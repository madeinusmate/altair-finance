import { NextRequest, NextResponse } from "next/server";
import { authorizeLocalApiRequest, providedLocalApiToken } from "@/lib/local-api-guard";

export const proxy = (request: NextRequest): NextResponse => {
  const decision = authorizeLocalApiRequest(providedLocalApiToken(request.headers));
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/api/:path*"],
};
