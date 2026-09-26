import { ensureProfile, jsonError } from "@/lib/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const profile = await ensureProfile();
    const supabase = getSupabaseAdminClient();
    let auth = "local database profile ready";
    if (supabase) {
      const email = process.env.SUPABASE_ADMIN_EMAIL || "admin@gbrbank.local";
      const { error } = await supabase.auth.admin.createUser({ email, password: "admin", email_confirm: true, user_metadata: { username: "admin", name: "Gabriel" } });
      if (error && !error.message.toLowerCase().includes("already registered")) throw error;
      auth = "supabase auth admin ready";
    }
    return Response.json({ ok: true, profileId: profile.id, auth, message: "Configuração inicial concluída. Altere a senha admin na primeira configuração." });
  } catch (error) {
    return jsonError(error, 500);
  }
}
