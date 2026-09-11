import { afterAll } from 'bun:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDesktopApplication } from './application.js';
const directories:string[]=[];
afterAll(async()=>{await Promise.all(directories.map(path=>rm(path,{recursive:true,force:true})));});
export async function addTestProject(app:Awaited<ReturnType<typeof createDesktopApplication>>){
  const directory=await mkdtemp(join(tmpdir(),'drawloom-test-working-'));directories.push(directory);
  return app.command({kind:'add_project',directory});
}
/** Explicit public test setup, never a product default or legacy migration. */
export async function createTestDesktopApplication(...args:Parameters<typeof createDesktopApplication>){
  const app=await createDesktopApplication(...args);
  const state=await app.snapshot();
  if(!state.projects.length && !state.conversations.length){
    await addTestProject(app);
    await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
  }
  return app;
}
