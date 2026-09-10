import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PreconfiguredClientSchema } from './plugin-oauth.js';

/** Explicit host setup action; neither packages nor tool-returned URIs invoke this. */
export async function readClientRegistration(path: string) {
  try {
    if (!isAbsolute(path)) throw Error('Absolute path required');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 65536) throw Error('Invalid file');
      const buffer = Buffer.alloc(65537);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > 65536) throw Error('File too large');
      return PreconfiguredClientSchema.parse(JSON.parse(buffer.subarray(0, offset).toString('utf8')));
    } finally { await file.close(); }
  } catch { throw Error('Cannot read client registration: select a regular JSON file up to 64 KiB with issuer and client information.'); }
}
