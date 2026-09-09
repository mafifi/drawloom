import type { JsonStore, AssetLibrary } from '@drawloom/host';
import type { PluginInstaller } from '@drawloom/plugins';
import type { OperatorController } from '@drawloom/workbench';
/** Trusted startup composition, deliberately not a model or HTTP command. */
export interface DesktopExtension {
  readonly installs: readonly PluginInstaller[];
  readonly controllers: ReadonlyMap<string, OperatorController>;
}
export interface DesktopCompositionContext {
  /** Namespaced persistence; the host owns its project/navigation records. */
  readonly store: JsonStore;
  /** put stores bytes AND registers the resulting asset for authenticated viewing. */
  readonly assets: AssetLibrary;
}
export type DesktopExtensionFactory = (host: DesktopCompositionContext) => Promise<DesktopExtension>;
