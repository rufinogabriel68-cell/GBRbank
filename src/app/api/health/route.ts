import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "gbr-bank", database: "connected" });
  } catch {
    return Response.json({ ok: false, service: "gbr-bank", database: "unavailable" }, { status: 503 });
  }
}
