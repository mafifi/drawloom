import {defineConfig} from 'astro/config';

export default defineConfig({
  site: 'https://mafifi.github.io',
  base: '/drawloom',
  output: 'static',
  build: {inlineStylesheets: 'always'},
  devToolbar: {enabled: false},
});
