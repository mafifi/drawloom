import { DesktopSnapshotSchema, type DesktopSnapshot, type DesktopCommand } from './protocol.js';
import { AssetSchema, JsonValueSchema } from '@drawloom/host';
import type { OperatorCommand } from '@drawloom/workbench';
export function createDesktopViewModel() {
  let state = $state<DesktopSnapshot>();
  let draft = $state(''), error = $state(''), busy = $state(false);
  let pendingCommand = $state<DesktopCommand>();
  // Feedback belongs to the initiating control; rejected overlapping work must
  // not replace it. Imports are independent so the next draft remains editable.
  let creationSource = $state<'new' | 'workbench' | 'provider'>();
  let importing = $state(false);
  let detailsOpen = $state(true), contextOpen = $state(false);
  let pane = $state<'preview' | 'details' | 'plugins' | 'settings'>('preview');
  let attachmentKeys = $state<string[]>([]), contextIds = $state<string[]>([]);
  let attachmentNames = $state<Record<string, string>>({});
  let candidateId = $state(''), artifactId = $state(''), groupId = $state(''), compare = $state(false), editing = $state(false), editText = $state('');
  let editTarget: Readonly<{ conversationId: string; workbenchId: string; candidateId: string; artifactId: string }> | undefined;
  let reviewSummary = $state('');
  let reviewTarget = $state<string>();
  let draftVersion = 0, attachmentVersion = 0, contextVersion = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const conversation = $derived(state?.conversations.find(c => c.id === state?.selectedId));
  const group = $derived(state?.operator.groups?.find(g => g.id === groupId));
  const candidates = $derived(state?.operator.candidates.filter(c => !group || group.candidateIds.includes(c.id)) ?? []);
  const artifacts = $derived(state?.operator.artifacts.filter(a => !group || group.artifactIds.includes(a.id) || candidates.some(c => c.artifactIds.includes(a.id))) ?? []);
  const candidate = $derived(artifactId ? candidates.find(c => c.id === candidateId && c.artifactIds.includes(artifactId)) : candidates.find(c => c.id === candidateId) ?? candidates.find(c => c.id === state?.operator.selectedCandidateId) ?? candidates.at(-1));
  const artifact = $derived(artifacts.find(a => a.id === artifactId) ?? artifacts.find(a => candidate?.artifactIds.includes(a.id)) ?? artifacts[0]);
  const comparableCandidates = $derived(candidate?.comparisonKey ? candidates.filter(c => c.id !== candidate.id && c.comparisonKey === candidate.comparisonKey && !c.reviewAction) : []);
  async function response(res: Response) { const data: unknown = await res.json(); if (!res.ok) throw Error(typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Local host unavailable'); return data; }
  function cancelEdit() { editing = false; editText = ''; editTarget = undefined; reviewSummary = ''; }
  function project(raw: unknown) {
    const next = DesktopSnapshotSchema.parse(raw);
    if (editTarget && (editTarget.conversationId !== next.selectedId || next.conversations.find(c => c.id === next.selectedId)?.workbenchId !== editTarget.workbenchId)) cancelEdit();
    state = next;
  }
  async function refresh() { try { project(await response(await fetch('/api/state'))); } catch (e) { error = e instanceof Error ? e.message : 'Local host unavailable'; } }
  async function command(value: DesktopCommand) {
    if (busy) return false;
    busy = true; pendingCommand = value; error = '';
    try { project(await response(await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }))); return true; }
    catch (e) { error = e instanceof Error ? e.message : 'Operation failed'; return false; }
    finally { busy = false; pendingCommand = undefined; }
  }
  async function operator(commandValue: OperatorCommand) { if (!conversation) return false; return command({ kind: 'operator', workbenchId: conversation.workbenchId, command: commandValue }); }
  return {
    get state() { return state; }, get conversation() { return conversation; }, get candidate() { return candidate; }, get artifact() { return artifact; },
    get candidates() { return candidates; }, get artifacts() { return artifacts; }, get comparableCandidates() { return comparableCandidates; },
    get groupId() { return groupId; }, set groupId(v: string) { cancelEdit(); groupId = v; candidateId = ''; artifactId = ''; compare = false; },
    get canSend() { return conversation?.provider !== 'synthetic' || conversation.workbenchId === 'text'; },
    get draft() { return draft; }, set draft(v: string) { draftVersion++; draft = v; localStorage.setItem('drawloom-composer', v); },
    get error() { return error; }, get busy() { return busy; },
    get pendingCommand() { return pendingCommand; },
    get creationSource() { return creationSource; }, get importing() { return importing; },
    get detailsOpen() { return detailsOpen; }, set detailsOpen(v: boolean) { detailsOpen = v; },
    get pane() { return pane; }, set pane(v: typeof pane) { pane = v; detailsOpen = true; },
    get contextOpen() { return contextOpen; }, set contextOpen(v: boolean) { contextOpen = v; },
    get attachmentKeys() { return attachmentKeys; }, get contextIds() { return contextIds; },
    attachmentName(key: string) { return attachmentNames[key] ?? 'Attachment'; },
    get candidateId() { return candidateId; }, set candidateId(v: string) { cancelEdit(); candidateId = v; artifactId = ''; },
    get artifactId() { return artifact?.id ?? ''; }, set artifactId(v: string) { cancelEdit(); artifactId = v; const owners = candidates.filter(c => c.artifactIds.includes(v)); candidateId = owners.find(c => c.selectedForOutput)?.id ?? owners.at(-1)?.id ?? ''; },
    contextLabel(id: string) { const a = state?.operator.artifacts.find(a => a.id === id); const c = state?.operator.candidates.find(c => c.artifactIds.includes(id)); return [a?.title ?? 'Document', c?.label, c?.status.replace('_', ' '), c?.id === state?.operator.selectedCandidateId ? 'selected' : undefined].filter(Boolean).join(' · '); },
    get compare() { return compare; }, set compare(v: boolean) { compare = v; },
    get editing() { return editing; },
    set editing(v: boolean) {
      if (!v) { cancelEdit(); return; }
      if (!conversation || !candidate || artifact?.content.kind !== 'text' || !artifact.editable) return;
      editTarget = Object.freeze({ conversationId: conversation.id, workbenchId: conversation.workbenchId, candidateId: candidate.id, artifactId: artifact.id });
      candidateId = candidate.id; artifactId = artifact.id;
      editText = artifact.content.text; editing = true;
    },
    get editText() { return editText; }, set editText(v: string) { editText = v; },
    get reviewSummary() { return reviewTarget === candidate?.id ? reviewSummary : ''; }, set reviewSummary(v: string) { reviewTarget = candidate?.id; reviewSummary = v; },
    async start() { draft = localStorage.getItem('drawloom-composer') ?? ''; await refresh(); timer = setInterval(() => { if (!busy) void refresh(); }, 600); },
    stopPolling() { clearInterval(timer); },
    command, operator,
    async submitInput(requestId: string, raw: string) {
      try { const value = JsonValueSchema.parse(JSON.parse(raw)); if (state) await command({ kind: 'input', conversationId: state.selectedId, resolution: { requestId, action: 'submit', value } }); }
      catch { error = 'Enter valid JSON matching the requested response format.'; }
    },
    async send() {
      if (!state || !draft.trim() || (conversation?.provider === 'synthetic' && conversation.workbenchId !== 'text')) return;
      const submitted = { draftVersion, attachmentVersion, contextVersion, conversationId: state.selectedId };
      if (await command({ kind: 'send', conversationId: submitted.conversationId, text: draft, attachmentKeys: [...attachmentKeys], contextArtifactIds: [...contextIds] })) {
        if (draftVersion === submitted.draftVersion) { draft = ''; localStorage.removeItem('drawloom-composer'); }
        if (attachmentVersion === submitted.attachmentVersion) attachmentKeys = [];
        if (contextVersion === submitted.contextVersion) contextIds = [];
        if (state.selectedId === submitted.conversationId && !editing) { candidateId = ''; detailsOpen = true; }
      }
    },
    async create(workbenchId = conversation?.workbenchId ?? 'text', provider = conversation?.provider ?? 'synthetic', source: 'new' | 'workbench' | 'provider' = 'new') {
      if (busy) return false;
      creationSource = source;
      try {
        const succeeded = await command({ kind: 'create_conversation', workbenchId, provider });
        if (succeeded) { cancelEdit(); candidateId = ''; artifactId = ''; groupId = ''; }
        return succeeded;
      } finally { creationSource = undefined; }
    },
    async select(id: string) {
      const succeeded = await command({ kind: 'select_conversation', conversationId: id });
      if (succeeded) { cancelEdit(); candidateId = ''; artifactId = ''; groupId = ''; }
      return succeeded;
    },
    toggleContext(id: string) { contextVersion++; contextIds = contextIds.includes(id) ? contextIds.filter(k => k !== id) : [...contextIds, id]; },
    removeAttachment(key: string) { attachmentVersion++; attachmentKeys = attachmentKeys.filter(k => k !== key); },
    async importFiles(files: FileList | null) {
      if (importing) return;
      const selected = Array.from(files ?? []);
      if (!selected.length) return;
      importing = true;
      try {
        for (const file of selected) {
          if (file.size > 16 * 1024 * 1024) { error = 'Files must be smaller than 16 MB.'; continue; }
          try {
            const data = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of data) binary += String.fromCharCode(byte);
            const asset = AssetSchema.parse(await response(await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, mediaType: file.type || (file.name.endsWith('.md') ? 'text/markdown' : 'text/plain'), base64: btoa(binary) }) })));
            attachmentVersion++;
            attachmentKeys = [...new Set([...attachmentKeys, asset.key])]; await refresh(); detailsOpen = true; if (!editing) candidateId = '';
            attachmentNames[asset.key] = file.name;
          } catch (e) { error = e instanceof Error ? e.message : 'Import failed'; }
        }
      } finally { importing = false; }
    },
    async saveRevision() {
      const target = editTarget, text = editText;
      if (!target || !editing || state?.selectedId !== target.conversationId) return;
      if (await command({ kind: 'operator', workbenchId: target.workbenchId, command: { kind: 'revise_document', candidateId: target.candidateId, artifactId: target.artifactId, text } })) {
        if (editTarget === target && editText === text) { cancelEdit(); candidateId = ''; artifactId = ''; }
      }
    },
  };
}
export type DesktopViewModel = ReturnType<typeof createDesktopViewModel>;
