import { NextResponse } from "next/server";
import { readGrant, readHome, writeGrant } from "@/electron/owner-control";

export const dynamic = "force-dynamic";

export const POST = async (): Promise<NextResponse> => {
  const userData = process.env.ELECTRON_USER_DATA ?? readHome()?.userData;
  if (!userData) {
    return NextResponse.json({ error: "Open the Altair app to enable the agent grant" }, { status: 400 });
  }

  const grant = readGrant(userData);
  if (!grant?.enabled) {
    return NextResponse.json({ error: "No agent grant" }, { status: 400 });
  }

  writeGrant(userData, { enabled: true, stopped: false });
  return NextResponse.json({ ok: true });
};
