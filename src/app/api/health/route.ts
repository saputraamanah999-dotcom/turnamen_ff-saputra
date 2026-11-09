import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "STIKAR ESPORTS — Battle Off Friends",
    developer: "SAPUTRA DEVELOPER",
    time: new Date().toISOString(),
  });
}
