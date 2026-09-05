import {copyFileSync, mkdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function stagePlaceholder(destination: string) {
  rmSync(destination, {recursive: true, force: true});
  mkdirSync(destination, {recursive: true});
  copyFileSync(fileURLToPath(new URL('../publishing/site/index.html', import.meta.url)), `${destination}/index.html`);
}
if (import.meta.main) stagePlaceholder(fileURLToPath(new URL('../publishing/.placeholder-artifact', import.meta.url)));
