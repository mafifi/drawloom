import { Composition, registerRoot } from "remotion";
import { EpisodeSteps } from "../a-place-to-do-the-work/animation";

function JournalAnimations() {
  return (
    <>
      <Composition
        id="EpisodeSteps"
        component={EpisodeSteps}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
}
registerRoot(JournalAnimations);
