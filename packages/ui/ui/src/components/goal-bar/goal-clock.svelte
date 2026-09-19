<script lang="ts">
  // Native accounting is the anchor, never modified by the display clock.
  let { seconds, running, fallback }: { seconds: number; running: boolean; fallback: string | undefined } = $props();
</script>

{#key seconds}
  <span data-goal-clock class="goal-clock tabular-nums" aria-hidden="true" style:--goal-start={seconds} style:animation-play-state={running ? 'running' : 'paused'}>
    <span class="goal-clock-digits"></span><span class="goal-clock-fallback">{fallback}</span>
  </span>
{/key}
