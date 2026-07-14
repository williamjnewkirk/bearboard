import type { Config } from 'tailwindcss';

// Keep in sync with packages/shared/src/colors.ts (BRAND_COLORS). Duplicated
// here because tailwind.config.ts can't resolve a workspace TS import.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          maroon: '#971B2F',
          crimson: '#BA0C2F',
          forest: '#13322B',
          green: '#215732',
        },
      },
    },
  },
  plugins: [],
};

export default config;
