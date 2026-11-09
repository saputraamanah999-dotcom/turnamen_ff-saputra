import { redirect } from "next/navigation";

// Alias route — master prompt menyebut /admin/analytics; halaman analitik
// berada di /admin/statistics (dipakai sidebar & dokumentasi).
export default function AnalyticsAlias() {
  redirect("/admin/statistics");
}
