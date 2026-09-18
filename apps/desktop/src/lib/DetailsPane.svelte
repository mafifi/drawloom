<script lang="ts">
  import {
    Alert,
    Badge,
    Button,
    StatefulButton,
    Collapsible,
    Empty,
    Field,
    Input,
    Select,
    Separator,
    Tabs,
    Textarea,
  } from "@drawloom/ui";
  import { CloseIcon } from "@drawloom/ui";
  import ArtifactViewer from "./ArtifactViewer.svelte";
  import PluginView from './PluginView.svelte';
  import WorkspaceResourceViewer from './WorkspaceResourceViewer.svelte';
  import type { DetailsPaneActions, DetailsPanePresentation } from './details-pane.js';
  let { presentation, actions, embedded = false }: { presentation: DetailsPanePresentation; actions: DetailsPaneActions; embedded?: boolean } = $props();
  const pluginView = $derived(presentation.pluginView);
  let pluginOpened = $state(false);
  const showPluginView = $derived(!!pluginView && presentation.workspaceMode === 'plugin');
  $effect(() => { if (presentation.detailsOpen && showPluginView) pluginOpened = true; });
</script>

<aside class="details-pane" class:plugin-pane={showPluginView} aria-label="Artifact and details">
  {#if !embedded}<header>
    <h2>
      {showPluginView ? "Workspace" : presentation.workspaceResource?.resource.title ?? presentation.artifact?.title ?? "Workspace"}
    </h2>
    <Button
      variant="ghost"
      size="icon"
      aria-label="Close artifact pane"
      onclick={actions.close}><CloseIcon aria-hidden="true" /></Button
    >
    <div class="workspace-header-actions">
      {#if presentation.narrow}<Button variant="ghost" onclick={actions.close}>Back to conversation</Button>{/if}
      <div class="workspace-size-controls">
        <Field.Label for="workspace-width" class="sr-only">Workspace width</Field.Label>
        <Input id="workspace-width" aria-label="Workspace width" type="range" min="320" max="720" step="20" value={presentation.detailsWidth} oninput={(event) => actions.setWidth(Number(event.currentTarget.value))} />
        <Button variant="ghost" aria-pressed={presentation.detailsExpanded} onclick={() => actions.setExpanded(!presentation.detailsExpanded)}>{presentation.detailsExpanded ? 'Restore workspace' : 'Expand workspace'}</Button>
      </div>
    </div>
  </header>
  <Separator />{/if}
  {#if pluginView && !showPluginView}
    <div class="px-5 pt-4"><Button variant="ghost" onclick={() => actions.setWorkspaceMode('plugin')}>Back to workbench</Button></div>
  {/if}
  {#if pluginOpened && pluginView}
    <div class="plugin-workspace" class:workspace-content-hidden={!presentation.detailsOpen || !showPluginView} aria-hidden={!presentation.detailsOpen || !showPluginView} inert={!presentation.detailsOpen || !showPluginView}>
      <PluginView view={pluginView} conversationId={presentation.conversationId} mediaRevision={presentation.mediaRevision} />
    </div>
  {/if}
  {#if presentation.detailsOpen && !showPluginView}
    {#if presentation.workspaceResource}
      {#key presentation.workspaceResource.entryId + ':' + presentation.workspaceResource.resource.id}
        <WorkspaceResourceViewer presentation={presentation.workspaceResource} />
      {/key}
    {:else}
    <Tabs.Root
      value={presentation.pane}
      onValueChange={(value) => {
        if (value === "preview" || value === "details") actions.setPane(value);
      }}
    >
      <Tabs.List class="mx-5 mt-4"
        ><Tabs.Trigger value="preview">Preview</Tabs.Trigger><Tabs.Trigger
          value="details">Details</Tabs.Trigger
        ></Tabs.List
      >
      <section class="inspector-section">
        <Field.Group>
          {#if presentation.groups.length}
            <Field.Field
              ><Field.Label for="review-group">Review group</Field.Label>
              <Select.Root type="single" value={presentation.groupId} onValueChange={actions.setGroup}>
                <Select.Trigger id="review-group" class="w-full"
                  >{presentation.groups.find(
                    (group) => group.id === presentation.groupId,
                  )?.title ?? "All groups"}</Select.Trigger
                >
                <Select.Content
                  ><Select.Group
                    ><Select.Item
                      value=""
                      label="All groups"
                    />{#each presentation.groups as group}<Select.Item
                        value={group.id}
                        label={group.title}
                      />{/each}</Select.Group
                  ></Select.Content
                >
              </Select.Root>
            </Field.Field>
          {/if}
          <Field.Field
            ><Field.Label for="artifact-selection">Artifact</Field.Label>
            <Select.Root type="single" value={presentation.artifactId} onValueChange={actions.setArtifact}>
              <Select.Trigger id="artifact-selection" class="w-full"
                >{presentation.artifact?.title ?? "Select an artifact"}</Select.Trigger
              >
              <Select.Content
                ><Select.Group
                  >{#each presentation.artifacts as item}<Select.Item
                      value={item.id}
                      label={item.title}
                    />{/each}</Select.Group
                ></Select.Content
              >
            </Select.Root>
          </Field.Field>
        </Field.Group>
      </section>
      <Tabs.Content value="preview">
        <section class="preview">
          {#if presentation.artifact}
            {#if presentation.editing}
              <Field.Group
                ><Field.Field
                  ><Field.Label for="document-revision"
                    >Document revision</Field.Label
                  ><Textarea
                    id="document-revision"
                    class="document-editor"
                    value={presentation.editText}
                    oninput={(event) => actions.setEditText(event.currentTarget.value)}
                  /><Field.Description
                    >Changing document or conversation cancels this unsaved
                    edit.</Field.Description
                  ></Field.Field
                ></Field.Group
              >
              <div class="actions">
                <StatefulButton disabled={presentation.busy} pending={presentation.pendingCommand?.kind === 'operator' && presentation.pendingCommand.command.kind === 'revise_document'} onclick={() => actions.saveRevision()}
                  >Save revision</StatefulButton
                ><Button variant="outline" onclick={() => actions.setEditing(false)}
                  >Cancel</Button
                >
              </div>
            {:else}
              <ArtifactViewer artifact={presentation.artifact} />
              {#if presentation.artifact.content.kind === "text" && presentation.artifact.editable && presentation.candidate}<Button
                  variant="outline"
                  class="edit-document"
                  onclick={() => actions.setEditing(true)}>Edit document</Button
                >{/if}
            {/if}
          {:else}<Empty.Root
              ><Empty.Description
                >Send a draft or attach a file to start reviewing.</Empty.Description
              ></Empty.Root
            >{/if}
        </section>
        {#if presentation.compare}
          <section class="comparison">
            <h3>Compare revisions</h3>
            {#each presentation.comparableCandidates as candidate}<h4>
                {candidate.label}
              </h4>
              {#each presentation.operatorArtifacts.filter( (a) => candidate.artifactIds.includes(a.id), ) as artifact}<ArtifactViewer
                  {artifact}
                />{/each}
            {:else}<Empty.Root
                ><Empty.Description
                  >No other revision for this output.</Empty.Description
                ></Empty.Root
              >{/each}
          </section>
        {/if}
      </Tabs.Content>
      <Tabs.Content value="details">
        <section class="preview">
          <h3>Workbench readiness</h3>
          <p>{presentation.operatorSummary}</p>
          <Badge variant="secondary"
            >{presentation.readiness.replaceAll("_", " ")}</Badge
          >
          {#if presentation.artifact?.content.kind === "asset"}<dl>
              <dt>Type</dt>
              <dd>{presentation.artifact.content.asset.mediaType}</dd>
              <dt>Size</dt>
              <dd>{presentation.artifact.content.asset.size.toLocaleString()} bytes</dd>
            </dl>{/if}
          <p class="text-muted-foreground">{presentation.notice}</p>
        </section>
      </Tabs.Content>
    </Tabs.Root>
    <Separator />
    <section class="candidate-section">
      <h3>Candidates</h3>
      {#each presentation.candidates as candidate}
        <Button
          variant={presentation.candidate?.id === candidate.id ? "secondary" : "ghost"}
          class="candidate-row h-auto w-full flex-col items-start"
          aria-pressed={presentation.candidate?.id === candidate.id}
          onclick={() => actions.setCandidate(candidate.id)}
        >
          <span class="whitespace-normal text-left"
            >{candidate.label}{candidate.reviewAction
              ? " · Recovery action"
              : ""}{candidate.stale ? " · stale" : ""}</span
          >
          <Badge
            variant={candidate.selectedForOutput ? "secondary" : "outline"}
            class="max-w-full whitespace-normal text-left"
            >{candidate.selectedForOutput
              ? "Selected output"
              : candidate.status.replace("_", " ")}{presentation.selectedCandidateId === candidate.id
              ? " · bookmarked"
              : ""}</Badge
          >
        </Button>
      {/each}
      <div class="actions">
        <Button
          variant="outline"
          disabled={!presentation.comparableCandidates.length}
          aria-pressed={presentation.compare}
          onclick={() => actions.setCompare(!presentation.compare)}>Compare</Button
        ><StatefulButton
          variant="outline"
          disabled={!presentation.candidate || presentation.busy}
          pending={presentation.pendingCommand?.kind === 'operator' && presentation.pendingCommand.command.kind === 'select_candidate'}
          onclick={() =>
            presentation.candidate &&
            actions.operator({
              kind: "select_candidate",
              candidateId: presentation.candidate.id,
            })}>Bookmark revision</StatefulButton
        >
      </div>
    </section>
    <Separator />
    <Collapsible.Root class="inspector-section">
      <Collapsible.Trigger
        >{#snippet child({ props })}<Button
            {...props}
            variant="ghost"
            class="w-full justify-start"
            >{presentation.candidate?.reviewAction ? "Recovery action" : "Review"}</Button
          >{/snippet}</Collapsible.Trigger
      >
      <Collapsible.Content class="flex flex-col gap-3">
        {#if presentation.candidate?.reviewAction}<p>
            {presentation.candidate.reviewAction.description}
          </p>
          {#if presentation.candidate.status === "accepted"}<p>
              Recovery action already applied.
            </p>{/if}{/if}
        <Field.Group
          ><Field.Field
            ><Field.Label for="review-notes">Review notes</Field.Label><Textarea
              id="review-notes"
              value={presentation.reviewSummary}
              oninput={(event) => actions.setReviewSummary(event.currentTarget.value)}
              placeholder="What should be kept or changed?"
            /></Field.Field
          ></Field.Group
        >
        <div class="actions">
          <StatefulButton
            variant="outline"
            pending={presentation.pendingCommand?.kind === 'operator' && presentation.pendingCommand.command.kind === 'review_candidate' && presentation.pendingCommand.command.decision === 'rejected'}
            disabled={!presentation.candidate ||
              presentation.busy ||
              Boolean(
                presentation.candidate.reviewAction && presentation.candidate.status === "accepted",
              )}
            onclick={() =>
              presentation.candidate &&
              actions.operator({
                kind: "review_candidate",
                candidateId: presentation.candidate.id,
                decision: "rejected",
                summary: presentation.reviewSummary,
              })}>Reject</StatefulButton
          >
          <StatefulButton
            pending={presentation.pendingCommand?.kind === 'operator' && presentation.pendingCommand.command.kind === 'review_candidate' && presentation.pendingCommand.command.decision === 'accepted'}
            disabled={!presentation.candidate ||
              presentation.busy ||
              Boolean(
                presentation.candidate.reviewAction && presentation.candidate.status === "accepted",
              )}
            onclick={() =>
              presentation.candidate &&
              actions.operator({
                kind: "review_candidate",
                candidateId: presentation.candidate.id,
                decision: "accepted",
                summary: presentation.reviewSummary,
              })}>{presentation.candidate?.reviewAction?.label ?? "Accept"}</StatefulButton
          >
        </div>
        {#each presentation.reviews.filter((r) => r.candidateId === presentation.candidate?.id) as review}<p
          >
            {review.summary || "Review recorded."}
          </p>
          {#each review.findings as finding}<p>
              {finding.severity}: {finding.path} — {finding.summary}
            </p>{/each}{/each}
      </Collapsible.Content>
    </Collapsible.Root>
    <Separator />
    <Collapsible.Root class="inspector-section">
      <Collapsible.Trigger
        >{#snippet child({ props })}<Button
            {...props}
            variant="ghost"
            class="w-full justify-start">Tool activity</Button
          >{/snippet}</Collapsible.Trigger
      >
      <Collapsible.Content>
        {#each presentation.pendingTools as start}<Alert.Root
            ><Alert.Description
              >Unresolved invocation: {start.tool}. No committed outcome; do not
              assume success or retry.</Alert.Description
            ></Alert.Root
          >
          <pre>{JSON.stringify(start, null, 2)}</pre>{/each}
        {#each presentation.activity as result}<pre>{JSON.stringify(
              result,
              null,
              2,
            )}</pre>{:else}{#if !presentation.pendingTools.length}<Empty.Root
              ><Empty.Description
                >No tool activity in this conversation.</Empty.Description
              ></Empty.Root
            >{/if}{/each}
      </Collapsible.Content>
    </Collapsible.Root>
    <Separator />
    <Collapsible.Root class="inspector-section">
      <Collapsible.Trigger
        >{#snippet child({ props })}<Button
            {...props}
            variant="ghost"
            class="w-full justify-start">Costs</Button
          >{/snippet}</Collapsible.Trigger
      >
      <Collapsible.Content>
        <p>
          {presentation.provider === "synthetic"
            ? "Synthetic agent mode makes no model calls."
            : "Native provider charges are separate and not reported here."}
        </p>
        <p class="text-muted-foreground">
          {presentation.spendingSummary ??
            "This workbench supplies no tool spending report. This does not establish that tools are free."}
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
    {/if}
  {/if}
</aside>
