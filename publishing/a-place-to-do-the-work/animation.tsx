import {AbsoluteFill, Interactive, interpolate, useCurrentFrame} from 'remotion';

// Editorial reading order, not an executable dependency graph. Exact milestones
// and source provenance live in notes.md and diagrams/source-map.md.
const stages = [
  {code: 'A', title: 'Recognition', detail: 'Portrait → living scene', at: 150},
  {code: 'B', title: 'Tension', detail: 'Alternative → motion → hold', at: 225},
  {code: 'C', title: 'Explanation', detail: 'Anatomy → reveal → hold', at: 300},
  {code: 'D', title: 'Choice', detail: 'Options → reveal → scene', at: 375},
  {code: 'E', title: 'Restraint', detail: 'Limits → reveal → scene', at: 450},
  {code: 'F', title: 'Recap', detail: 'Summary → reveal → close', at: 525},
];

export function EpisodeSteps() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor: '#FAF7F0', color: '#111111', fontFamily: 'Arial, sans-serif'}}>
    <Interactive.Div name="Title" style={{position: 'absolute', left: 120, top: 85, fontFamily: 'Georgia, serif', fontSize: 88}}>The steps behind one episode</Interactive.Div>
    <Interactive.Div name="Foundation" style={{position: 'absolute', left: 120, right: 120, top: 225, height: 155, borderTop: '2px solid #244D40', borderBottom: '1px solid #C9C6BE', display: 'flex', alignItems: 'center', gap: 40, opacity: interpolate(frame, [15, 45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
      <span style={{fontFamily: 'Georgia, serif', fontSize: 76, color: '#244D40'}}>G</span>
      <div><div style={{fontSize: 48}}>Foundation</div><div style={{fontSize: 36, color: '#535650', marginTop: 12}}>Research and claim limits → script and visual plan → narration</div></div>
    </Interactive.Div>
    <div style={{position: 'absolute', left: 120, right: 120, top: 420, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '38px 52px'}}>
      {stages.map((stage) => <div key={stage.code} style={{height: 152, borderTop: '2px solid #244D40', paddingTop: 20, opacity: interpolate(frame, [stage.at, stage.at + 25], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 22}}><span style={{fontFamily: 'Georgia, serif', fontSize: 66, color: '#244D40'}}>{stage.code}</span><span style={{fontSize: 43}}>{stage.title}</span></div>
        <div style={{fontSize: 31, marginTop: 12, color: '#535650'}}>{stage.detail}</div>
      </div>)}
    </div>
    <Interactive.Div name="Master and approval" style={{position: 'absolute', left: 120, right: 120, top: 825, borderTop: '2px solid #244D40', paddingTop: 22, display: 'flex', alignItems: 'baseline', gap: 38, opacity: interpolate(frame, [625, 655], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
      <span style={{fontFamily: 'Georgia, serif', fontSize: 66, color: '#244D40'}}>M</span><span style={{fontSize: 44}}>Assemble and review</span><span style={{fontSize: 36, color: '#535650'}}>→ Separate publication approval</span>
    </Interactive.Div>
    <Interactive.Div name="Scope" style={{position: 'absolute', left: 120, right: 120, bottom: 72, fontSize: 29, color: '#535650'}}>Treatment Episodes · 23 production milestones · Simplified reading order, not the full dependency graph</Interactive.Div>
    <Interactive.Div name="Progress" style={{position: 'absolute', bottom: 0, left: 0, height: 6, backgroundColor: '#244D40', width: interpolate(frame, [0, 899], [0, 1920])}} />
  </AbsoluteFill>;
}
