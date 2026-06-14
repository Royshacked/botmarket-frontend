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
