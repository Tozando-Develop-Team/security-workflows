// 消費側 Next.js リポへドロップイン
// 配置場所: <consumer-repo>/.eslintrc.security.cjs
//
// pr-scan.yml と weekly-scan.yml の Next.js ジョブから呼ばれる。
// 既存の .eslintrc.* とは独立した「セキュリティ専用」設定。

module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["security", "no-unsanitized"],
  extends: [
    "plugin:security/recommended-legacy",
    "plugin:no-unsanitized/recommended-legacy",
  ],
  rules: {
    // 既存 .eslintrc に上書きされないよう、ここでは security 系のみ
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-eval-with-expression": "error",
    "security/detect-pseudoRandomBytes": "error",
    "security/detect-possible-timing-attacks": "warn",
    "security/detect-unsafe-regex": "warn",
    "no-unsanitized/method": "error",
    "no-unsanitized/property": "error",
  },
  ignorePatterns: [
    "node_modules",
    ".next",
    "out",
    "dist",
    "build",
    "coverage",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
    "next-env.d.ts",
  ],
};

// 必要な npm devDependencies (consumer 側で実行):
//   npm i -D eslint @typescript-eslint/parser eslint-plugin-security eslint-plugin-no-unsanitized
