module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  overrides: [
    {
      // Tests run under vitest/jsdom or `node --test` — never in a browser. So the node globals
      // they legitimately reach for (process.cwd() to read a stylesheet off disk, because vitest
      // stubs stylesheet imports) are defined here. The browser env above is right for src/ and
      // wrong for the test files sitting inside it.
      files: ['**/*.test.js', '**/*.test.jsx'],
      env: { node: true },
    },
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // Not a TypeScript project — core domain shapes are documented centrally in
    // src/types.js (JSDoc typedefs) and PropTypes are kept on the public panel
    // components. Requiring PropTypes on every internal render helper is noise.
    'react/prop-types': 'off',
    // Allow the "omit a field via rest destructure" pattern, e.g.
    // const { id: _id, ...rest } = obj
    'no-unused-vars': ['error', { ignoreRestSiblings: true }],
  },
}
