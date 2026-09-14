import { expect, test } from 'bun:test';
import { pluginGroups, readableName, pluginDescription } from './screen-language.js';

test('plugin browsing groups owned tools under their plugin and searches their content', () => {
  const entries = [
    { id:'p', name:'synthetic.text', kind:'plugin', description:'Write and revise text', origin:'drawloom' },
    { id:'t', name:'text.word_count', kind:'tool', description:'Count words', origin:'drawloom', ownerId:'p' },
    { id:'s', name:'Clear writing', kind:'skill', description:'Writing guidance', origin:'drawloom' },
  ];
  const groups = pluginGroups(entries, 'count');
  expect(groups).toHaveLength(1);
  expect(groups[0]?.entry.id).toBe('p');
  expect(groups[0]?.children.map(x => x.id)).toEqual(['t']);
  expect(pluginGroups(entries, '')).toHaveLength(2);
});
test('display names never change tool identity', () => {
  expect(readableName('synthetic.text')).toBe('Text studio');
  expect(readableName('knowledge.search')).toBe('Search knowledge');
  expect(readableName('A custom plugin')).toBe('A custom plugin');
  expect(pluginDescription({id:'p',kind:'plugin',name:'synthetic.text',origin:'drawloom',description:'Registered at startup'})).toBe('Write, revise and inspect documents.');
});
test('unknown owners and same-name plugins retain distinct identities', () => {
  const groups=pluginGroups([{id:'a',name:'Search',kind:'plugin',origin:'first'}, {id:'b',name:'Search',kind:'plugin',origin:'second'}, {id:'c',name:'Independent skill',kind:'skill',origin:'third',ownerId:'missing'}], '');
  expect(groups.map(g=>g.entry.id)).toEqual(['a','b','c']);
});
