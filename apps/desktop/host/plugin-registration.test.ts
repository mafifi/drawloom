import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readClientRegistration } from './plugin-registration.js';

test('registration import reads only a bounded regular selected file and validates known fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-client-registration-'));
  try {
    const file = join(root, 'client.json');
    await writeFile(file, JSON.stringify({ issuer: 'https://issuer.example', information: { client_id: 'test', client_secret: 'fixture' } }));
    expect(await readClientRegistration(file)).toMatchObject({ information: { client_id: 'test' } });
    await symlink(file, join(root, 'link'));
    await expect(readClientRegistration(join(root, 'link'))).rejects.toThrow('registration');
    await expect(readClientRegistration(root)).rejects.toThrow('registration');
    await writeFile(file, 'x'.repeat(65537));
    await expect(readClientRegistration(file)).rejects.toThrow('registration');
    await writeFile(file, JSON.stringify({ issuer: 'https://issuer.example', information: { client_secret: 'fixture' } }));
    await expect(readClientRegistration(file)).rejects.toThrow('registration');
  } finally { await rm(root, { recursive: true, force: true }); }
});
