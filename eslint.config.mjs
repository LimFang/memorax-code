import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/ts/**/*.ts", "packages/ts/**/*.mts", "packages/ts/**/*.cts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ["packages/ts/memorax-code-backend/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      // Input and path sanitizers intentionally match escaped C0 control ranges.
      "no-control-regex": "off",
    },
  },
  {
    files: ["packages/ts/**/*.mjs", "*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
