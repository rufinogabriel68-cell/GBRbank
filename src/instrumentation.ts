/**
 * Executado uma vez no servidor, antes das rotas.
 *
 * A Vercel (e a maioria dos servidores) roda em UTC. Sem isso, "hoje",
 * "este mês" e os vencimentos atrasados virariam o dia 3 horas antes do
 * seu fuso real. Aqui fixamos o fuso do Brasil por padrão — você pode
 * sobrescrever com a variável TZ no ambiente.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (!process.env.TZ) {
    process.env.TZ = "America/Sao_Paulo";
    console.log(`[gbr-bank] Fuso horário definido para ${process.env.TZ}`);
  }
}
