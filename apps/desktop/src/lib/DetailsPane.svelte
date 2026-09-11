<script lang="ts">
  import {
    Alert,
    Badge,
    Button,
    StatefulButton,
    Collapsible,
    Empty,
    Field,
    Select,
    Separator,
    Tabs,
    Textarea,
  } from "@drawloom/ui";
  import { CloseIcon } from "@drawloom/ui";
  import ArtifactViewer from "./ArtifactViewer.svelte";
  import PluginView from './PluginView.svelte';
  import type { DesktopViewModel } from "./view-model.svelte.js";
  let { vm, embedded = false }: { vm: DesktopViewModel; embedded?: boolean } = $props();
  const pluginView = $derived(vm.state?.views.find(view => view.workbenchId === vm.conversation?.workbenchId));
  let showPluginView = $state(false);
</script>

<aside class="details-pane" aria-label="Artifact and details">
  {#if !embedded}<header>
    <h2>
      {vm.artifact?.title ?? "Artifacts"}
    </h2>
    <Button
      variant="ghost"
      size="icon"
      aria-label="Close artifact pane"
      onclick={() => (vm.detailsOpen = false)}><CloseIcon aria-hidden="true" /></Button
    >
  </header>
  <Separator />{/if}
  {#if pluginView && vm.state}
    <div class="px-5 pt-4"><Button variant="outline" onclick={() => showPluginView = !showPluginView}>{showPluginView ? 'Show shared viewer' : `Open ${pluginView.title}`}</Button></div>
  {/if}
  {#if showPluginView && pluginView && vm.state}
    {#key vm.state.selectedId + ':' + pluginView.id}<PluginView view={pluginView} conversationId={vm.state.selectedId} mediaRevision={vm.state.mediaPolicy.revision} />{/key}
  {:else}
    <Tabs.Root
      value={vm.pane}
      onValueChange={(value) => {
        if (value === "preview" || value === "details") vm.pane = value;
      }}
    >
      <Tabs.List class="mx-5 mt-4"
        ><Tabs.Trigger value="preview">Preview</Tabs.Trigger><Tabs.Trigger
          value="details">Details</Tabs.Trigger
        ></Tabs.List
      >
      <section class="inspector-section">
        <Field.Group>
          {#if vm.state?.operator.groups?.length}
            <Field.Field
              ><Field.Label for="review-group">Review group</Field.Label>
              <Select.Root type="single" bind:value={vm.groupId}>
                <Select.Trigger id="review-group" class="w-full"
                  >{vm.state.operator.groups.find(
                    (group) => group.id === vm.groupId,
                  )?.title ?? "All groups"}</Select.Trigger
                >
                <Select.Content
                  ><Select.Group
                    ><Select.Item
                      value=""
                      label="All groups"
                    />{#each vm.state.operator.groups as group}<Select.Item
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
            <Select.Root type="single" bind:value={vm.artifactId}>
              <Select.Trigger id="artifact-selection" class="w-full"
                >{vm.artifact?.title ?? "Select an artifact"}</Select.Trigger
              >
              <Select.Content
                ><Select.Group
                  >{#each vm.artifacts as item}<Select.Item
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
          {#if vm.artifact}
            {#if vm.editing}
              <Field.Group
                ><Field.Field
                  ><Field.Label for="document-revision"
                    >Document revision</Field.Label
                  ><Textarea
                    id="document-revision"
                    class="document-editor"
                    bind:value={vm.editText}
                  /><Field.Description
                    >Changing document or conversation cancels this unsaved
                    edit.</Field.Description
                  ></Field.Field
                ></Field.Group
              >
              <div class="actions">
                <StatefulButton disabled={vm.busy} pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'revise_document'} onclick={() => vm.saveRevision()}
                  >Save revision</StatefulButton
                ><Button variant="outline" onclick={() => (vm.editing = false)}
                  >Cancel</Button
                >
              </div>
            {:else}
              <ArtifactViewer artifact={vm.artifact} />
              {#if vm.artifact.content.kind === "text" && vm.artifact.editable && vm.candidate}<Button
                  variant="outline"
                  class="edit-document"
                  onclick={() => (vm.editing = true)}>Edit document</Button
                >{/if}
            {/if}
          {:else}<Empty.Root
              ><Empty.Description
                >Send a draft or attach a file to start reviewing.</Empty.Description
              ></Empty.Root
            >{/if}
        </section>
        {#if vm.compare && vm.state}
          <section class="comparison">
            <h3>Compare revisions</h3>
            {#each vm.comparableCandidates as candidate}<h4>
                {candidate.label}
              </h4>
              {#each vm.state.operator.artifacts.filter( (a) => candidate.artifactIds.includes(a.id), ) as artifact}<ArtifactViewer
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
          <p>{vm.state?.operator.summary}</p>
          <Badge variant="secondary"
            >{vm.state?.operator.readiness.replaceAll("_", " ")}</Badge
          >
          {#if vm.artifact?.content.kind === "asset"}<dl>
              <dt>Type</dt>
              <dd>{vm.artifact.content.asset.mediaType}</dd>
              <dt>Size</dt>
              <dd>{vm.artifact.content.asset.size.toLocaleString()} bytes</dd>
            </dl>{/if}
          <p class="text-muted-foreground">{vm.state?.notice}</p>
        </section>
      </Tabs.Content>
    </Tabs.Root>
    <Separator />
    <section class="candidate-section">
      <h3>Candidates</h3>
      {#each vm.candidates as candidate}
        <Button
          variant={vm.candidate?.id === candidate.id ? "secondary" : "ghost"}
          class="candidate-row h-auto w-full flex-col items-start"
          aria-pressed={vm.candidate?.id === candidate.id}
          onclick={() => (vm.candidateId = candidate.id)}
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
              : candidate.status.replace("_", " ")}{vm.state?.operator
              .selectedCandidateId === candidate.id
              ? " · bookmarked"
              : ""}</Badge
          >
        </Button>
      {/each}
      <div class="actions">
        <Button
          variant="outline"
          disabled={!vm.comparableCandidates.length}
          aria-pressed={vm.compare}
          onclick={() => (vm.compare = !vm.compare)}>Compare</Button
        ><StatefulButton
          variant="outline"
          disabled={!vm.candidate || vm.busy}
          pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'select_candidate'}
          onclick={() =>
            vm.candidate &&
            vm.operator({
              kind: "select_candidate",
              candidateId: vm.candidate.id,
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
            >{vm.candidate?.reviewAction ? "Recovery action" : "Review"}</Button
          >{/snippet}</Collapsible.Trigger
      >
      <Collapsible.Content class="flex flex-col gap-3">
        {#if vm.candidate?.reviewAction}<p>
            {vm.candidate.reviewAction.description}
          </p>
          {#if vm.candidate.status === "accepted"}<p>
              Recovery action already applied.
            </p>{/if}{/if}
        <Field.Group
          ><Field.Field
            ><Field.Label for="review-notes">Review notes</Field.Label><Textarea
              id="review-notes"
              bind:value={vm.reviewSummary}
              placeholder="What should be kept or changed?"
            /></Field.Field
          ></Field.Group
        >
        <div class="actions">
          <StatefulButton
            variant="outline"
            pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'review_candidate' && vm.pendingCommand.command.decision === 'rejected'}
            disabled={!vm.candidate ||
              vm.busy ||
              Boolean(
                vm.candidate.reviewAction && vm.candidate.status === "accepted",
              )}
            onclick={() =>
              vm.candidate &&
              vm.operator({
                kind: "review_candidate",
                candidateId: vm.candidate.id,
                decision: "rejected",
                summary: vm.reviewSummary,
              })}>Reject</StatefulButton
          >
          <StatefulButton
            pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'review_candidate' && vm.pendingCommand.command.decision === 'accepted'}
            disabled={!vm.candidate ||
              vm.busy ||
              Boolean(
                vm.candidate.reviewAction && vm.candidate.status === "accepted",
              )}
            onclick={() =>
              vm.candidate &&
              vm.operator({
                kind: "review_candidate",
                candidateId: vm.candidate.id,
                decision: "accepted",
                summary: vm.reviewSummary,
              })}>{vm.candidate?.reviewAction?.label ?? "Accept"}</StatefulButton
          >
        </div>
        {#each vm.state?.operator.reviews.filter((r) => r.candidateId === vm.candidate?.id) ?? [] as review}<p
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
        {#each vm.state?.pendingTools ?? [] as start}<Alert.Root
            ><Alert.Description
              >Unresolved invocation: {start.tool}. No committed outcome; do not
              assume success or retry.</Alert.Description
            ></Alert.Root
          >
          <pre>{JSON.stringify(start, null, 2)}</pre>{/each}
        {#each vm.state?.activity ?? [] as result}<pre>{JSON.stringify(
              result,
              null,
              2,
            )}</pre>{:else}{#if !vm.state?.pendingTools.length}<Empty.Root
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
          {vm.conversation?.provider === "synthetic"
            ? "Synthetic agent mode makes no model calls."
            : "Native provider charges are separate and not reported here."}
        </p>
        <p class="text-muted-foreground">
          {vm.state?.operator.spending?.summary ??
            "This workbench supplies no tool spending report. This does not establish that tools are free."}
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
</aside>
