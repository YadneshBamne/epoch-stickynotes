import { useState } from "react";
import HeatmapLab from "./HeatmapLab";
import TrackerBar from "./TrackerBar";
import { useTracker, type TrackerMode } from "./useTracker";

/** Eye lab: look at an image and get a heatmap of where your eyes went. Purely a visual toy: nothing is scored against the model. */
export default function EyeLab() {
  const tracker = useTracker();
  const [mode, setMode] = useState<TrackerMode>("webcam");
  return (
    <div className="space-y-5">
      <TrackerBar tracker={tracker} mode={mode} setMode={setMode} showMode />
      <HeatmapLab tracker={tracker} mode={mode} />
    </div>
  );
}
