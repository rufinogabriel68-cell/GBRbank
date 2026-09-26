import { ensureProfile, jsonError } from "@/lib/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    const password = String(body.password ?? "");
    if (password.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
    if (password !== String(body.confirmation ?? "")) throw new Error("As senhas não conferem.");
    const supabase = getSupabaseAdminClient();
    if (!supabase) throw new Error("Configure o Supabase Auth e a service role apenas no ambiente do servidor.");
    const { data, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (listError) throw listError;
    const user = data.users.find((item) => item.email === profile.email || item.user_metadata?.username === profile.username);
    if (!user) throw new Error("Administrador não encontrado no Supabase Auth.");
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    return Response.json({ ok: true, message: "Senha alterada com segurança." });
  } catch (error) {
    return jsonError(error);
  }
}
