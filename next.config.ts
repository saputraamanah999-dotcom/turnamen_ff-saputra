import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Tesseract.js (mesin OCR word-box, dipakai /api/ai/ocr) harus tetap
     external di bundle server — worker + wasm-nya tidak boleh dibungkus webpack. */
  serverExternalPackages: ["tesseract.js"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
