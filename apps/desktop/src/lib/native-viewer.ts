/** Svelte action: release a detached player instead of retaining its media load. */
export function releaseMedia(node: Pick<HTMLMediaElement, 'pause' | 'removeAttribute' | 'load'>) {
  return { destroy() { node.pause(); node.removeAttribute('src'); node.load(); } };
}

/** Images and sandboxed documents no longer need their source after unmount. */
export function releaseSource(node: Pick<Element, 'removeAttribute'>) {
  return { destroy() { node.removeAttribute('src'); } };
}
