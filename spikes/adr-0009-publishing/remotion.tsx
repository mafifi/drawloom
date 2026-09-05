import {Composition, registerRoot} from 'remotion';
import {WorkbenchAnimation} from '../../publishing/workbench-example/animation';

function Root() {
  return <Composition id="Workbench" component={WorkbenchAnimation} durationInFrames={540} fps={30} width={1280} height={720} />;
}
registerRoot(Root);
