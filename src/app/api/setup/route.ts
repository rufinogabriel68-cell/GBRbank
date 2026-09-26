import { db } from "@/db";
import { ensureProfile, expenseCategories, incomeCategories, jsonError } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Cria/repara a base do painel: perfil, categorias padrão, contas padrão,
 * configurações e "meu acerto". É idempotente — pode ser chamado quantas
 * vezes quiser sem duplicar nada.
 */
export async function POST() {
  try {
    const profile = await ensureProfile();
    const info = db.info();
    const repaired: string[] = [];

    const categories = await db.list("categories", { where: { profileId: profile.id } });
    if (!categories.length) {
      for (const name of incomeCategories) await db.create("categories", { profileId: profile.id, name, kind: "income", isDefault: true, color: "#42d6b7" });
      for (const name of expenseCategories) await db.create("categories", { profileId: profile.id, name, kind: "expense", isDefault: true, color: "#ff826e" });
      repaired.push("categorias padrão");
    }

    const accounts = await db.list("accounts", { where: { profileId: profile.id } });
    if (!accounts.length) {
      await db.create("accounts", { profileId: profile.id, name: "Carteira", type: "physical", balance: "0.00", description: "Dinheiro físico" });
      await db.create("accounts", { profileId: profile.id, name: "Banco", type: "digital", balance: "0.00", description: "Conta digital" });
      await db.create("accounts", { profileId: profile.id, name: "Reserva", type: "investment", balance: "0.00", description: "Poupança e investimentos" });
      repaired.push("contas padrão");
    }

    const settings = await db.findOne("settings", { profileId: profile.id });
    if (!settings) {
      await db.create("settings", { profileId: profile.id });
      repaired.push("configurações");
    }

    const settlement = await db.findOne("personal_settlement", { profileId: profile.id });
    if (!settlement) {
      await db.create("personal_settlement", { profileId: profile.id });
      repaired.push("meu acerto");
    }

    return Response.json({
      ok: true,
      profileId: profile.id,
      database: info.mode === "firestore" ? `Cloud Firestore (${info.projectId})` : info.label,
      remote: info.mode === "firestore",
      repaired: repaired.length ? repaired : "nada — tudo já estava configurado",
      message: info.warning ?? "Configuração inicial concluída. Seus dados estão no Firebase.",
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
