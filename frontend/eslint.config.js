import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist", "node_modules", "mock", "vite.config.ts"]
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/incompatible-library": "off"
    }
  }
];
