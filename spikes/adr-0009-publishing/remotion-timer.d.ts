// Remotion 4's published types reference a global `Timer` (see
// remotion/dist/cjs/delay-render.d.ts). No such global exists in TypeScript's
// DOM or Node libraries; Bun's ambient types happened to declare it, so the
// omission was invisible until the toolchain moved to Node. Node's timers
// return `NodeJS.Timeout`, which is what Remotion stores.
//
// This is a compatibility declaration for a dependency's type error, not a
// Drawloom type. Remove it when Remotion publishes corrected types.
declare global {
  type Timer = NodeJS.Timeout;
}
export {};
