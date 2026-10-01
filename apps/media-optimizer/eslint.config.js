import base from "@repo/eslint-config";

export default [
  { ignores: ["dist", "dist-layer"] },
  ...base,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
