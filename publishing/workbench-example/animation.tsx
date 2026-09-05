import {AbsoluteFill, Interactive, interpolate, useCurrentFrame} from 'remotion';

/** Illustrative publishing content, not a Drawloom runtime diagram. */
export function WorkbenchAnimation({paper = '#ffffff', accent = '#1447e6'}: {paper?: string; accent?: string}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: paper, color: '#111111', fontFamily: 'Arial, sans-serif'}}>
      <Interactive.Div name="Explanation" style={{position: 'absolute', left: 80, top: 65, fontSize: 48, fontFamily: 'Georgia, serif'}}>
        From intent to inspectable work
      </Interactive.Div>
      <svg width="1280" height="720" viewBox="0 0 1280 720" style={{position: 'absolute'}} aria-hidden="true">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke={accent} strokeWidth="1.5" /></marker></defs>
        <path d="M 355 315 L 450 315" fill="none" stroke={accent} strokeWidth="4" markerEnd="url(#arrow)" style={{opacity: interpolate(frame, [150, 180], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
        <path d="M 795 315 L 875 315" fill="none" stroke={accent} strokeWidth="4" markerEnd="url(#arrow)" style={{opacity: interpolate(frame, [330, 360], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
        <path d="M 1030 385 L 1030 455 Q 1030 480 1005 480 L 245 480 Q 220 480 220 455 L 220 390" fill="none" stroke={accent} strokeWidth="4" markerEnd="url(#arrow)" pathLength="1" strokeDasharray="1" style={{strokeDashoffset: interpolate(frame, [390, 445], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
      </svg>
      <Interactive.Div name="Brief" style={{position: 'absolute', left: 80, top: 245, width: 275, height: 140, border: `2px solid ${accent}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontFamily: 'Georgia, serif', opacity: interpolate(frame, [0, 25], [0, 1], {extrapolateRight: 'clamp'})}}>Brief</Interactive.Div>
      <Interactive.Div name="Generate" style={{position: 'absolute', left: 465, top: 245, width: 330, height: 140, border: `2px solid ${accent}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontFamily: 'Georgia, serif', opacity: interpolate(frame, [170, 195], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>Generate</Interactive.Div>
      <Interactive.Div name="Review" style={{position: 'absolute', left: 890, top: 245, width: 310, height: 140, border: `2px solid ${accent}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontFamily: 'Georgia, serif', opacity: interpolate(frame, [350, 375], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>Review</Interactive.Div>
      <Interactive.Div name="Revision loop" style={{position: 'absolute', top: 420, left: 80, width: 1120, textAlign: 'center', color: accent, fontSize: 36, opacity: interpolate(frame, [410, 440], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>Revise and iterate</Interactive.Div>
      <Interactive.Div name="Takeaway" style={{position: 'absolute', left: 80, right: 80, top: 145, fontSize: 32}}>The harness runs. The workbench makes the work inspectable.</Interactive.Div>
      <Interactive.Div name="Progress" style={{position: 'absolute', bottom: 0, left: 0, height: 6, backgroundColor: accent, width: interpolate(frame, [0, 539], [0, 1280])}} />
    </AbsoluteFill>
  );
}
