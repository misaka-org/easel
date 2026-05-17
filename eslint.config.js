import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 忽略构建产物 + 非项目 tsconfig 内的文件
  {
    ignores: [
      'dist/',
      'dist-playground/',
      'coverage/',
      'node_modules/',
      'vite.config.ts',
      'tsup.config.ts',
      'vitest.config.ts',
      'docs/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // snake_case 为主，类型用 PascalCase
    '@typescript-eslint/naming-convention': [
      'error',
        // 默认 snake_case/UPPER_CASE（编码规范允许任选），前导下划线 for 私有
        { selector: 'default', format: ['snake_case', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        // 类型 PascalCase
        { selector: 'typeLike', format: ['PascalCase'] },
        // 枚举值 snake_case
        { selector: 'enumMember', format: ['snake_case'] },
        // 对象字面量键名任意
        { selector: 'objectLiteralProperty', format: null },
        // 导入绑定任意
        { selector: 'import', format: null },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // 测试文件放宽
    files: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/naming-convention': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    // 已有代码遗留的大量 unsafe 访问，逐步修复
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
