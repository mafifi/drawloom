import {Composition, registerRoot} from 'remotion';
import {WorkbenchAnimation} from '../workbench-example/animation';
import {EpisodeSteps} from '../a-place-to-do-the-work/animation';

function JournalAnimations() {
  return <>
    <Composition id="Workbench" component={WorkbenchAnimation} defaultProps={{paper: '#faf7f0', accent: '#244d40'}} durationInFrames={540} fps={30} width={1280} height={720} />
    <Composition id="EpisodeSteps" component={EpisodeSteps} durationInFrames={900} fps={30} width={1920} height={1080} />
  </>;
}
registerRoot(JournalAnimations);
