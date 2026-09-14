import type { ResourceReference } from '@drawloom/host';

export type ResourceCardPresentation = Readonly<{
  resource: ResourceReference;
  isWorkingFile: boolean;
  canOpen: boolean;
  selectedForContext: boolean;
  pending: boolean;
  error: string;
}>;

export type ResourceCardActions = Readonly<{
  openWorkspace(): void;
  read(): void;
  toggleContext(): void;
}>;
