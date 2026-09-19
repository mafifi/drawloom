export const settingsSections = [
  { id: "general", title: "General" },
  { id: "workbench", title: "Workbench" },
  { id: "permissions", title: "Tool permissions" },
  { id: "media", title: "Media sources" },
  { id: "integrations", title: "Integrations" },
] as const;

export function pluginSettingsTitle(page: { ownerTitle: string; title: string }) {
  return page.ownerTitle.trim().toLowerCase() === page.title.trim().toLowerCase()
    ? page.title
    : `${page.ownerTitle} · ${page.title}`;
}
