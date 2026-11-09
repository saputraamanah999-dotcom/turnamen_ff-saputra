import { redirect } from "next/navigation";

// Alias route — master prompt menyebut /admin/ai-observer; implementasi
// panel berada di /admin/observer (dipakai sidebar & dokumentasi).
export default function AiObserverAlias() {
  redirect("/admin/observer");
}
