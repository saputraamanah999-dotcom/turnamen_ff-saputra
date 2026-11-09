import { NextResponse } from "next/server";
import { ORG } from "@/lib/constants";

/** Info aplikasi — identitas platform BOF (pengganti placeholder "Hello, world!"). */
export async function GET() {
  return NextResponse.json({
    name: "STIKAR ESPORTS — Battle Off Friends (BOF)",
    institution: ORG.institution,
    developer: ORG.developer,
    services: {
      health: "/api/health",
      live: "/live",
      interactive: "/live/interactive",
      tvDisplay: "/display",
      admin: "/admin",
      agent: "STIKAR BROADCAST AGENT (lokal di PC produksi, port 8082)",
    },
  });
}
