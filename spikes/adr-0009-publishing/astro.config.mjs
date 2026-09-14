import {defineConfig} from 'astro/config';

export default defineConfig({
  site: 'https://drawloom.org',
  base: '/',
  output: 'static',
  build: {inlineStylesheets: 'always'},
  devToolbar: {enabled: false},
});
