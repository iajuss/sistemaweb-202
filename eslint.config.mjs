import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/generated/**", "**/node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    ignores: ["packages/adapters/src/repositories/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Raw Prisma is private to packages/adapters/src/repositories.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/domain/src/money.ts",
      "packages/adapters/src/money-normalizer.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSNumberKeyword",
          message: "Monetary modules must not use TypeScript number.",
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='z'][callee.property.name='number']",
          message: "Monetary modules must not use z.number().",
        },
      ],
    },
  },
  {
    files: ["packages/contracts/src/dossier-schema.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator[id.name='MonetaryFieldEnvelopeSchema'] TSNumberKeyword",
          message: "Monetary schemas must not use TypeScript number.",
        },
        {
          selector: "VariableDeclarator[id.name='MonetaryFieldEnvelopeSchema'] CallExpression[callee.type='MemberExpression'][callee.object.name='z'][callee.property.name='number']",
          message: "Monetary schemas must not use z.number().",
        },
      ],
    },
  },
);
