import { db } from "@/db";
import { categoryKinds } from "@/db/schema";
import { byProfile, ensureProfile, jsonError, logAction } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await ensureProfile();
    return Response.json(await db.list("categories", { where: byProfile(profile.id), orderBy: [{ field: "createdAt", direction: "desc" }] }));
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da categoria.");
    if (!(categoryKinds as readonly string[]).includes(body.kind)) throw new Error("Tipo de categoria inválido.");
    const duplicated = await db.findOne("categories", { profileId: profile.id, name: String(body.name).trim(), kind: body.kind });
    if (duplicated) throw new Error("Já existe uma categoria com esse nome.");

    const category = await db.create("categories", {
      profileId: profile.id,
      name: String(body.name).trim(),
      kind: body.kind,
      color: body.color || (body.kind === "income" ? "#42d6b7" : "#ff826e"),
      isDefault: false,
    });
    await logAction(profile.id, "created", "category", category.id);
    return Response.json(category, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
