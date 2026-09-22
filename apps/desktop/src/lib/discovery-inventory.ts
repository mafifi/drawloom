import type { DesktopCatalogue } from "./protocol.js";
import type { DesktopViewModel } from "./view-model.svelte.js";

export type DiscoveryInventoryPresentation = Readonly<{
  catalogue?: DesktopCatalogue;
  cataloguePending: boolean;
  catalogueError: string;
  catalogueQuery: string;
}>;

export type DiscoveryInventoryActions = Readonly<{
  setQuery(value: string): void;
  refresh(force?: boolean): Promise<void>;
  loadMoreApps(): void;
  contributionsFor(id: string): ReturnType<DesktopViewModel["contributionsFor"]>;
  contributionCount(id: string): number;
  showMoreContributions(id: string): void;
  integrationIsPending(id: string): boolean;
  integrationAuthorizationUrl(id: string): string;
  integrationError(id: string): string;
  authenticateIntegration(id: string): Promise<void>;
}>;

export function discoveryInventoryPresentation(
  vm: DesktopViewModel,
): DiscoveryInventoryPresentation {
  return {
    catalogue: vm.catalogue,
    cataloguePending: vm.cataloguePending,
    catalogueError: vm.catalogueError,
    catalogueQuery: vm.catalogueQuery,
  };
}

export function discoveryInventoryActions(vm: DesktopViewModel): DiscoveryInventoryActions {
  return {
    setQuery: (value) => {
      vm.catalogueQuery = value;
    },
    refresh: (force = true) => vm.refreshCatalogue(force),
    loadMoreApps: () => vm.loadMoreApps(),
    contributionsFor: (id) => vm.contributionsFor(id),
    contributionCount: (id) => vm.contributionCount(id),
    showMoreContributions: (id) => vm.showMoreContributions(id),
    integrationIsPending: (id) => vm.integrationIsPending(id),
    integrationAuthorizationUrl: (id) => vm.integrationAuthorizationUrl(id),
    integrationError: (id) => vm.integrationError(id),
    authenticateIntegration: (id) => vm.authenticateIntegration(id),
  };
}
