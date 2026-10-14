import { NextRequest, NextResponse } from "next/server";
import { authorizeLocalApiRequest, LOCAL_API_TOKEN_HEADER } from "@/lib/local-api-guard";

export const proxy = (request: NextRequest): NextResponse => {
  const decision = authorizeLocalApiRequest(request.headers.get(LOCAL_API_TOKEN_HEADER));
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/api/:path*"],
};
