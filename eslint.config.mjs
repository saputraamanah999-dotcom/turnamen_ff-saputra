// ESLint flat config — Next.js 16 (eslint-config-next sudah flat config asli).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // Artefak build & sub-paket lokal (punya gaya sendiri / tidak di-lint):
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "agent/**",
      "broadcast-bridge/**",
      "observer-ai/**",
      "scripts/**",
      "documentation/**",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // react-hooks v7 membawa aturan gaya React Compiler yang super-ketat.
      // Beberapa pola di sengaja dipakai untuk animasi siaran (flash/pop skor
      // di leaderboard "adjust during render") + komponen shadcn vendor —
      // diturunkan ke warning agar error lint tetap berarti untuk bug nyata.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
