import { expect, test } from 'vitest';
import type { DesktopViewModel } from './view-model.svelte.js';
import { composerResourcesPresentation, discoveryPickerPresentation } from './composer-view.js';

test('picker projection orders injected actions and context without committing a suggestion', () => {
  const vm = {
    pickerEntries: [], composerActions: [{ id: 'action:goal', title: 'Create goal', group: 'Actions', kind: 'action' }],
    pickerKind: 'add', pickerQuery: '', pickerContextOptions: [{ id: 'document:one', title: 'A document', group: 'Files', kind: 'file' }],
    pickerMatchCount: 0, catalogue: undefined, cataloguePending: false, catalogueError: '',
    pickerOpen: true, pickerActiveId: '', draft: 'Keep this draft',
  } as unknown as DesktopViewModel;
  const projection = discoveryPickerPresentation(vm);
  expect(projection.options.map(option => option.id)).toEqual(['action:attach', 'action:goal', 'document:one', 'action:context']);
  expect(projection.draftLength).toBe('Keep this draft'.length);
  expect(vm.draft).toBe('Keep this draft');
});

test('resource projection includes only the selected conversation workbench', () => {
  const vm = {
    nativeResources: [], nativeResourceMatchCount: 0,
    resourceIsPending: () => false, resourceError: () => '',
    state: { views: [
      { id: 'current', title: 'Current', workbenchId: 'text' },
      { id: 'other', title: 'Other', workbenchId: 'other' },
    ] }, conversation: { workbenchId: 'text' },
    resourceListings: {}, openedResources: [],
  } as unknown as DesktopViewModel;
  expect(composerResourcesPresentation(vm).views.map(view => view.id)).toEqual(['current']);
});
