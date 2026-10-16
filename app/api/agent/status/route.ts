import { NextResponse } from "next/server";
import { readAgentStatus, readHome } from "@/electron/owner-control";

export const dynamic = "force-dynamic";

export const GET = async (): Promise<NextResponse> => {
  const userData = process.env.ELECTRON_USER_DATA ?? readHome()?.userData;
  if (!userData) {
    return NextResponse.json({ enabled: false, stopped: false, running: false });
  }
  return NextResponse.json(readAgentStatus(userData));
};
