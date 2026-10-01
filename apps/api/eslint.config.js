import base from "@repo/eslint-config";

export default [
  { ignores: ["dist", "openapi.json"] },
  ...base,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
