// /display/:tournamentId — TV Display untuk turnamen tertentu.
import { TvDisplayPage } from "@/components/broadcast/tv-display";

export const metadata = {
  title: "TV Display — Battle Off Friends",
  robots: { index: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  return <TvDisplayPage tidOverride={tournamentId} />;
}
