import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Tesseract.js (mesin OCR word-box, dipakai /api/ai/ocr) harus tetap
     external di bundle server — worker + wasm-nya tidak boleh dibungkus webpack. */
  serverExternalPackages: ["tesseract.js"],
  /* File tracing Next hanya menyalin ±25/87 berkas tesseract.js ke output
     standalone/Vercel — worker-script memuat berkas via require dinamis,
     jadi seluruh paket wajib disertakan. */
  outputFileTracingIncludes: {
    "/api/ai/ocr": ["./node_modules/tesseract.js/**/*"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
