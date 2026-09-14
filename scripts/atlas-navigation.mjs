// Local atlas presentation, separate from the Archify renderer and product UI.
export function addAtlasNavigation(html, maps, current, destinations = []) {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  if (!html.includes('</head>') || !html.includes('<body>')) throw Error('Unsupported atlas document');
  if (maps.some(map => !/^[a-z0-9-]+$/.test(map.name))) throw Error('Invalid map name');
  if (destinations.length) html = html.replace(/<svg\b[^>]*>/, tag => tag.replace('role="img"', 'role="group"'));
  for (const destination of destinations) {
    if (!maps.some(map => map.name === destination.name)) throw Error('Missing destination map');
    const start = html.indexOf(`<g id="node-${escape(destination.id)}" `);
    if (start < 0) throw Error(`Missing atlas tile: ${destination.id}`);
    // Match balanced groups: Archify nodes contain nested icon groups.
    const tags = /<\/?g\b[^>]*>/g;
    tags.lastIndex = start;
    let depth = 0, end = -1, match;
    while ((match = tags.exec(html))) {
      depth += match[0].startsWith('</') ? -1 : match[0].endsWith('/>') ? 0 : 1;
      if (depth === 0) { end = tags.lastIndex; break; }
    }
    if (end < 0) throw Error('Unclosed atlas tile');
    const group = html.slice(start, end).replace(/^<g[^>]*>/, opening => opening.replace(/ (?:data-node-id|tabindex|role|aria-label|aria-pressed)="[^"]*"/g, ''));
    html = html.slice(0, start) + `<a href="${destination.name}.html" aria-label="Open ${escape(destination.title)} map" class="atlas-tile">${group}</a>` + html.slice(end);
  }
  const links = maps.map(map => `<a href="${map.name}.html"${map.name === current ? ' aria-current="page"' : ''}>${escape(map.title)}</a>`).join('');
  const nav = `<nav class="atlas-nav" aria-label="Repository atlas"><a href="overview.html">Ownership map</a><a href="index.md">Reading checklist</a><details><summary>Browse maps</summary><div>${links}</div></details></nav>`;
  const css = `<style>
    .atlas-nav { display:flex; flex-wrap:wrap; gap:16px; align-items:start; padding:16px 24px; font:14px/1.5 system-ui; position:relative; z-index:20; }
    .atlas-nav a,.atlas-nav summary { color:inherit; text-decoration:underline; text-underline-offset:4px; cursor:pointer; padding:6px; display:inline-block; }
    .atlas-nav details div { display:flex; flex-wrap:wrap; gap:8px; max-width:960px; }
    .atlas-nav [aria-current] { font-weight:700; }
    .atlas-nav a:focus-visible,.atlas-nav summary:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
    .atlas-tile { cursor:pointer; }
    .atlas-tile:hover rect,.atlas-tile:focus-visible rect { stroke:var(--text-primary,currentColor); stroke-width:3; }
    .atlas-tile:focus-visible { outline:2px solid currentColor; outline-offset:4px; }
  </style>`;
  return html.replace('</head>', css + '</head>').replace('<body>', '<body>' + nav);
}
