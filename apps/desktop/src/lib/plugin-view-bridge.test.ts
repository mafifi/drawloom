import { expect, test } from 'bun:test';
import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { updatePluginViewTheme } from './plugin-view-bridge.js';

test('theme updates stop when the frame is closing or the bridge is disconnected', () => {
  const updates: unknown[] = [];
  const connected = {
    transport: {},
    setHostContext: (context: unknown) => { updates.push(context); },
  } as unknown as AppBridge;
  const closing = new AbortController();

  expect(updatePluginViewTheme(connected, closing.signal, 'dark')).toBe(true);
  expect(updates).toEqual([{ theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline'] }]);

  closing.abort();
  expect(updatePluginViewTheme(connected, closing.signal, 'light')).toBe(false);
  expect(updatePluginViewTheme({ ...connected, transport: undefined } as AppBridge, new AbortController().signal, 'light')).toBe(false);
  expect(updates).toHaveLength(1);
});
