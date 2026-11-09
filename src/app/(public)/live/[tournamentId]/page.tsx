"use client";
// /live/:tournamentId — Live broadcast untuk turnamen tertentu.
import { useParams } from "next/navigation";
import { LiveViewerPage } from "@/components/broadcast/live-viewer";

export default function Page() {
  const params = useParams<{ tournamentId: string }>();
  return <LiveViewerPage tidOverride={params?.tournamentId} />;
}
