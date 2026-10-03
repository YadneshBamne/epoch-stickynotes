import { useEffect, useState } from "react";
import { CALIBRATION_POINTS, type GazeSource } from "./gaze";
import type { CalibrationOutcome } from "./useTracker";

const SETTLE_MS = 700; // let the eyes arrive at the dot
const TRAIN_MS = 1300; // then learn from them while they rest there
const SAMPLE_EVERY_MS = 60;
const MIN_TOTAL = 12; // fewer learned samples than this means the camera never really saw the eyes

const overlay = "fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The easy calibration for the heatmap: 6 dots, one after another, no clicking and no accuracy test. Just look at each
 * dot as it appears (about 12 seconds). It is meant for a good-looking heatmap, not for measuring, so it never blocks:
 * every dot advances on its own, and the result is saved in this browser so it is only done once.
 */
export default function EasyCalibration({ source, commit, onFinish, onCancel }: {
  source: GazeSource; commit: (o: CalibrationOutcome, persist?: boolean) => boolean; onFinish: () => void; onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "run" | "retry">("intro");
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [, refresh] = useState(0); // keeps the "face found" hint current
  useEffect(() => { const i = window.setInterval(() => refresh((n) => n + 1), 300); return () => window.clearInterval(i); }, []);
  useEffect(() => { source.showPreview(true); return () => source.showPreview(false); }, [source]); // the little camera box helps people centre themselves

  useEffect(() => {
    if (phase !== "run") return;
    let cancelled = false;
    (async () => {
      await source.clearTraining();
      source.setCorrection(null);
      let learned = 0;
      for (let i = 0; i < CALIBRATION_POINTS.length; i++) {
        if (cancelled) return;
        setIdx(i);
        setProgress(0);
        const cx = CALIBRATION_POINTS[i].x * window.innerWidth, cy = CALIBRATION_POINTS[i].y * window.innerHeight;
        await sleep(SETTLE_MS);
        const t0 = performance.now();
        while (!cancelled && performance.now() - t0 < TRAIN_MS) {
          if (source.train(cx, cy)) learned++; // false when the tracker could not see the eyes at that moment: just try again
          setProgress((performance.now() - t0) / TRAIN_MS);
          await sleep(SAMPLE_EVERY_MS);
        }
      }
      if (cancelled) return;
      if (learned < MIN_TOTAL) { await source.clearTraining(); setPhase("retry"); return; }
      // accuracy is deliberately not measured here, so the stored error is a placeholder
      commit({ ok: true, rawErrorPx: 0, errorPx: 0, affine: null }, true);
      onFinish();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "intro") {
    return (
      <div className={overlay} role="dialog" aria-modal="true" aria-label="Calibration">
        <div className="max-w-md space-y-4 px-6 text-center">
          <h2 className="text-2xl font-semibold">Quick setup, 12 seconds</h2>
          <p className="text-stone-300">Face the camera and follow the 6 dots with your <b>eyes</b>. No clicking, no test. It does not need to be perfect.</p>
          <p className="text-sm text-stone-400">Check the small camera box (bottom-left): your face should be in it, lit from the front. It is saved in this browser, so you only do this once.</p>
          <div className="flex justify-center gap-3 pt-2">
            <button type="button" autoFocus onClick={() => setPhase("run")} className="rounded-lg bg-amber-500 px-6 py-3 font-medium text-stone-950">Start</button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-stone-600 px-5 py-3">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "retry") {
    return (
      <div className={overlay} role="alert">
        <div className="max-w-md space-y-4 px-6 text-center">
          <h2 className="text-2xl font-semibold">Could not see your eyes</h2>
          <p className="text-stone-300">Put your face inside the camera box (bottom-left), make sure the light is in front of you rather than behind, and try again.</p>
          <div className="flex justify-center gap-3 pt-2">
            <button type="button" autoFocus onClick={() => { setIdx(0); setPhase("run"); }} className="rounded-lg bg-amber-500 px-6 py-3 font-medium text-stone-950">Try again</button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-stone-600 px-5 py-3">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const p = CALIBRATION_POINTS[idx];
  return (
    <div className={overlay} role="dialog" aria-modal="true" aria-label="Calibration">
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2 text-center">
        <p className="text-lg font-medium">Follow the dot ({idx + 1} / {CALIBRATION_POINTS.length})</p>
        <p className="text-sm text-stone-400" aria-live="polite">{source.faceFound() ? "Just look at it" : "Face not found: move into view"}</p>
      </div>
      <span
        key={idx}
        aria-hidden="true"
        className="absolute h-10 w-10 rounded-full border-2 border-white bg-red-500"
        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: `translate(-50%,-50%) scale(${1 - 0.5 * progress})`, boxShadow: `0 0 0 ${6 + 10 * progress}px rgba(251,191,36,.35)` }}
      />
    </div>
  );
}
