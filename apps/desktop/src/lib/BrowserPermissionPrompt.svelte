<script lang="ts">
  import { Dialog, Button, StatefulButton, Alert } from '@drawloom/ui';
  import type { BrowserPermissionRequest, BrowserPermissionChoice } from '@drawloom/desktop-host';
  let {request,pending,error,decide}:{request?:BrowserPermissionRequest;pending:string;error:string;decide(id:string,choice:BrowserPermissionChoice):Promise<unknown>}=$props();
</script>
<Dialog.Root open={!!request} onOpenChange={open=>{if(!open&&request)void decide(request.id,'dismiss');}}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Website permission</Dialog.Title><Dialog.Description>
      {request?.origin} wants to use your {request?.permissions.join(' and ')}.
      {#if request&&request.topOrigin!==request.origin}This request comes from content embedded in {request.topOrigin}.{/if}
    </Dialog.Description></Dialog.Header>
    <p class="text-sm text-muted-foreground">This does not grant access to Drawloom tools or conversations. macOS may also ask for permission.</p>
    <p class="text-sm text-muted-foreground">Allow once applies to this loaded page. It may request access again without another prompt until you reload or close it.</p>
    {#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
    <Dialog.Footer>
      <StatefulButton variant="outline" pending={pending==='block'} disabled={!!pending} onclick={()=>request&&decide(request.id,'block')}>Block</StatefulButton>
      <StatefulButton variant="outline" pending={pending==='allow_once'} disabled={!!pending} onclick={()=>request&&decide(request.id,'allow_once')}>Allow once</StatefulButton>
      <StatefulButton pending={pending==='allow'} disabled={!!pending} onclick={()=>request&&decide(request.id,'allow')}>Always allow for this site</StatefulButton>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
