import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ensureProfile, jsonError, logAction } from "@/lib/server";

export async function POST(request: Request) {
  try {
    const profile = await ensureProfile();
    const body = await request.json();
    if (!String(body.name ?? "").trim()) throw new Error("Informe o nome da categoria.");
    if (!["income", "expense"].includes(body.kind)) throw new Error("Tipo de categoria inválido.");
    const [category] = await db.insert(categories).values({ profileId: profile.id, name: String(body.name).trim(), kind: body.kind, color: body.color || (body.kind === "income" ? "#42d6b7" : "#ff826e") }).returning();
    await logAction(profile.id, "created", "category", category.id);
    return Response.json(category, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    const profile = await ensureProfile();
    return Response.json(await db.select().from(categories).where(eq(categories.profileId, profile.id)).orderBy(desc(categories.createdAt)));
  } catch (error) {
    return jsonError(error, 500);
  }
}
