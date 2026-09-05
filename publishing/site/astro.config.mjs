import {defineConfig} from 'astro/config';

export default defineConfig({
  site: 'https://mafifi.github.io',
  base: '/drawloom',
  output: 'static',
  outDir: process.env.JOURNAL_OUT_DIR || './dist',
  publicDir: './public',
});
