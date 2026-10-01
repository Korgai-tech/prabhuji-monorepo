import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommendedTypeChecked, {
  languageOptions: { parserOptions: { projectService: true } },
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "no-console": "error",
  },
});
