import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O Firebase Admin usa pacotes nativos/dinâmicos que não devem ser
  // empacotados pelo bundler do Next (evita erro em produção na Vercel).
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "google-auth-library", "node-forge"],
};

export default nextConfig;
