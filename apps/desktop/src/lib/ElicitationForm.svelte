<script lang="ts">
  import { Alert, Checkbox, Field, Input, Select, StatefulButton } from '@drawloom/ui';
  import type { ToolElicitationRequest } from '@drawloom/tools';
  import type { ElicitationFormActions, ElicitationFormPresentation } from './elicitation-form.js';
  let { presentation, actions, request }: { presentation: ElicitationFormPresentation; actions: ElicitationFormActions; request: ToolElicitationRequest } = $props();
</script>

<Alert.Root class="interaction">
  <Alert.Title>Requested information</Alert.Title>
  <Alert.Description>
    <p>{request.params.message}</p>
    <p class="text-muted-foreground break-all">{request.source}</p>
    <form onsubmit={event => { event.preventDefault(); void actions.submit(new FormData(event.currentTarget)); }}>
      <Field.Group>
        {#each Object.entries(request.params.requestedSchema.properties) as [name, field]}
          {@const fieldId = request.requestId + '-' + name}
          {@const required = request.params.requestedSchema.required?.includes(name) ?? false}
          <Field.Field orientation={field.type === 'boolean' ? 'horizontal' : 'vertical'}>
            <Field.Label for={fieldId}>{field.title ?? name}{required ? ' *' : ''}</Field.Label>
            {#if field.description}<Field.Description>{field.description}</Field.Description>{/if}
            {#if field.type === 'boolean'}
              <Checkbox id={fieldId} {name} checked={field.default ?? false} disabled={presentation.busy} />
            {:else if field.type === 'array'}
              {@const choices = 'enum' in field.items ? field.items.enum.map(value => ({ const: value, title: value })) : field.items.anyOf}
              {#each choices as choice, index}
                <Field.Field orientation="horizontal"><Checkbox id={fieldId + '-' + index} {name} value={choice.const} checked={field.default?.includes(choice.const) ?? false} disabled={presentation.busy} /><Field.Label for={fieldId + '-' + index}>{choice.title}</Field.Label></Field.Field>
              {/each}
            {:else if field.type === 'string' && ('enum' in field || 'oneOf' in field)}
              {@const choices = 'oneOf' in field ? field.oneOf : field.enum.map((value, index) => ({ const: value, title: 'enumNames' in field ? field.enumNames?.[index] ?? value : value }))}
              <Select.Root type="single" {name} value={actions.choice(name, field.default)} onValueChange={value => actions.choose(name, value)} {required} disabled={presentation.busy}>
                <Select.Trigger id={fieldId}>{choices.find(choice => choice.const === actions.choice(name, field.default))?.title ?? `Choose ${field.title ?? name}`}</Select.Trigger>
                <Select.Content>{#each choices as choice}<Select.Item value={choice.const} label={choice.title}>{choice.title}</Select.Item>{/each}</Select.Content>
              </Select.Root>
            {:else}
              <Input id={fieldId} {name} type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} value={field.default ?? ''} {required} disabled={presentation.busy} step={field.type === 'integer' ? 1 : 'any'} />
            {/if}
          </Field.Field>
        {/each}
      </Field.Group>
      <div class="flex gap-2 mt-3">
        <StatefulButton type="submit" disabled={presentation.busy} pending={presentation.pendingAccept}>Submit</StatefulButton>
        <StatefulButton type="button" variant="outline" disabled={presentation.busy} pending={presentation.pendingDecline} onclick={() => actions.resolve('decline')}>Decline</StatefulButton>
        <StatefulButton type="button" variant="outline" disabled={presentation.busy} pending={presentation.pendingCancel} onclick={() => actions.resolve('cancel')}>Cancel</StatefulButton>
      </div>
    </form>
  </Alert.Description>
</Alert.Root>
