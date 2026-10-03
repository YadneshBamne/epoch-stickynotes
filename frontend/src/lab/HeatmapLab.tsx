import { useCallback, useEffect, useRef, useState } from "react";
import { enterFullscreen, leaveFullscreen, useExitGuard } from "./fullscreen";
import type { GazeSource, Point } from "./gaze";
import { HeatGrid, containRect, paintHeat } from "./heatmap";
import TrackerGate from "./TrackerGate";
import type { Plan, Tracker, TrackerMode } from "./useTracker";

interface Pic { url: string; name: string; w: number; h: number }
type Phase = "pick" | "gate" | "ready" | "view" | "done";

const DURATIONS = [5, 10, 20];
const MIN_POINTS = 8; // fewer gaze points than this and there is nothing worth drawing
const RESULT_MAX_W = 1280;
const overlay = "fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white";
const btn = "rounded-lg px-5 py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900";
const primary = `${btn} bg-amber-500 text-stone-950 hover:bg-amber-400`;
const secondary = `${btn} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function loadPic(file: Blob, name: string): Promise<Pic> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve({ url, name, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${name} is not an image the browser can open.`)); };
    im.src = url;
  });
}

/** Pick an image, look at it, and get a heatmap of where your eyes went. Nothing is analysed or compared: it all stays in the browser. */
export default function HeatmapLab({ tracker, mode }: { tracker: Tracker; mode: TrackerMode }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [pic, setPic] = useState<Pic | null>(null);
  const [seconds, setSeconds] = useState(10);
  const [force, setForce] = useState<Plan | undefined>();
  const [gateKey, setGateKey] = useState(0);
  const [points, setPoints] = useState<Point[]>([]); // gaze, in 0..1 of the image
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [samples, setSamples] = useState<{ file: string; label: string }[]>([]);
  const source = useRef<GazeSource | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (import.meta.env.DEV) fetch("/samples/index.json").then((r) => (r.ok ? r.json() : [])).then(setSamples).catch(() => {});
  }, []);
  useEffect(() => () => leaveFullscreen(), []);

  const choose = useCallback(async (file: Blob, name: string) => {
    setError(null);
    try {
      const next = await loadPic(file, name);
      setPic((old) => { if (old) URL.revokeObjectURL(old.url); return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that image.");
    }
  }, []);

  async function begin(f?: Plan) {
    setError(null); setForce(f); setGateKey((k) => k + 1);
    await enterFullscreen();
    setPhase("gate");
  }
  const back = useCallback(() => { leaveFullscreen(); setPhase("pick"); }, []);
  const finish = useCallback((pts: Point[]) => {
    leaveFullscreen();
    if (pts.length < MIN_POINTS) { setError("Not enough eye movement was picked up. Check that your face is in the camera box and try again."); setPhase("pick"); return; }
    setPoints(pts);
    setPhase("done");
  }, []);

  useExitGuard(phase === "gate" || phase === "ready", back);

  // ---------- screens ----------
  if (phase === "gate") {
    return <TrackerGate key={gateKey} tracker={tracker} mode={mode} force={force} onReady={(s) => { source.current = s; setPhase("ready"); }} onCancel={back} />;
  }

  if (phase === "ready" && pic) {
    return (
      <div className={overlay} role="dialog" aria-modal="true" aria-label="Ready">
        <div className="max-w-md space-y-4 px-6 text-center">
          <h2 className="text-2xl font-semibold">Ready</h2>
          <p className="text-stone-300">The image appears for <b>{seconds} seconds</b>. Just look at it naturally and watch the heat build where your eyes go.{mode !== "webcam" && " (Stand-in: move the pointer where you would look.)"}</p>
          <button type="button" autoFocus onClick={() => setPhase("view")} className="rounded-lg bg-amber-500 px-6 py-3 font-medium text-stone-950">Show the image</button>
        </div>
      </div>
    );
  }

  if (phase === "view" && pic && source.current) {
    return <Viewing pic={pic} seconds={seconds} source={source.current} onDone={finish} onAbort={back} />;
  }

  if (phase === "done" && pic) {
    return (
      <HeatResult pic={pic} points={points}
        onAgain={() => void begin()} onRecalibrate={() => void begin("calibrate")} onNew={() => { setPhase("pick"); }} />
    );
  }

  // pick
  return (
    <div className="space-y-4">
      {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
      <p className="max-w-2xl text-sm">
        Pick an image, look at it, and get a heatmap of where your eyes went.{" "}
        {mode === "mouse" ? "You chose the mouse stand-in, so no camera is used. " : "The first time takes a 12-second setup (follow 6 dots); it is saved in this browser. "}
        Your camera video never leaves this browser.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void choose(f, f.name); }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center ${dragOver ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-stone-300 dark:border-stone-700"}`}
      >
        {pic ? (
          <img src={pic.url} alt={pic.name} className="max-h-56 rounded border border-stone-300 dark:border-stone-700" />
        ) : (
          <p className="text-stone-500 dark:text-stone-400">Drop an image here</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => input.current?.click()} className={secondary}>{pic ? "Choose another image" : "Choose an image"}</button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f, f.name); e.target.value = ""; }} />
          {samples.map((s) => (
            <button key={s.file} type="button" onClick={async () => { const b = await (await fetch(`/samples/${s.file}`)).blob(); await choose(b, s.file); }} className={`${secondary} !px-3 !py-1.5 text-sm`}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">Look for
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="rounded border border-stone-300 bg-transparent px-2 py-1.5 dark:border-stone-700">
            {DURATIONS.map((d) => <option key={d} value={d}>{d} seconds</option>)}
          </select>
        </label>
        <button type="button" disabled={!pic} onClick={() => void begin()} className={`${primary} disabled:opacity-50`}>Start</button>
        {mode !== "mouse" && tracker.saved && <button type="button" onClick={() => void begin("calibrate")} disabled={!pic} className={`${secondary} disabled:opacity-50`}>Redo setup</button>}
      </div>
    </div>
  );
}

/** Fullscreen: the image, with the heat building on top of it as the eyes move. */
function Viewing({ pic, seconds, source, onDone, onAbort }: {
  pic: Pic; seconds: number; source: GazeSource; onDone: (pts: Point[]) => void; onAbort: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const pts = useRef<Point[]>([]);
  const ended = useRef(false);

  const end = useCallback(() => { if (!ended.current) { ended.current = true; onDone(pts.current); } }, [onDone]);
  useExitGuard(true, () => { if (pts.current.length >= MIN_POINTS) end(); else onAbort(); });

  useEffect(() => {
    const cv = canvas.current!;
    const vw = window.innerWidth, vh = window.innerHeight;
    cv.width = vw; cv.height = vh;
    const ctx = cv.getContext("2d")!;
    const r = containRect(vw, vh, pic.w, pic.h);
    const grid = new HeatGrid(vw, vh, 0.05 * r.w);
    let dirty = false;
    const unsub = source.subscribe((p) => {
      const u = (p.x - r.x) / r.w, v = (p.y - r.y) / r.h;
      if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return; // looking away from the image
      const q = { x: clamp01(u), y: clamp01(v) };
      pts.current.push(q);
      grid.add(r.x + q.x * r.w, r.y + q.y * r.h);
      dirty = true;
    });
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      if (bar.current) bar.current.style.width = `${f * 100}%`;
      if (dirty) {
        dirty = false;
        ctx.clearRect(0, 0, vw, vh);
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); // heat only on the image, not on the black bars
        paintHeat(ctx, grid, 0.9);
        ctx.restore();
      }
      if (f >= 1) { end(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, [pic, seconds, source, end]);

  return (
    <div className={overlay} aria-label="Viewing the image">
      <img src={pic.url} alt="" draggable={false} className="h-full w-full select-none object-contain" />
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div ref={bar} className="h-full w-0 bg-amber-400" /></div>
      <button type="button" onClick={end} className="absolute bottom-4 right-4 rounded-lg border border-white/30 bg-black/50 px-3 py-1.5 text-sm hover:bg-black/70">Finish now (Esc)</button>
    </div>
  );
}

/** The finished heatmap on the image, with a couple of knobs to make it look the way you like, and a PNG download. */
function HeatResult({ pic, points, onAgain, onRecalibrate, onNew }: {
  pic: Pic; points: Point[]; onAgain: () => void; onRecalibrate: () => void; onNew: () => void;
}) {
  const [spread, setSpread] = useState(0.05);
  const [strength, setStrength] = useState(0.85);
  const [showHeat, setShowHeat] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const W = Math.min(RESULT_MAX_W, pic.w), H = Math.round((W * pic.h) / pic.w);

  useEffect(() => {
    const cv = canvas.current!;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (!showHeat) return;
    const grid = new HeatGrid(W, H, spread * W);
    for (const p of points) grid.add(p.x * W, p.y * H);
    paintHeat(ctx, grid, strength);
  }, [points, spread, strength, showHeat, W, H]);

  function download() {
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img.current!, 0, 0, W, H);
    if (showHeat) ctx.drawImage(canvas.current!, 0, 0);
    out.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `heatmap-${pic.name.replace(/\.[^.]+$/, "")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-stone-300 bg-black dark:border-stone-700" style={{ maxWidth: `min(100%, calc(70vh * ${pic.w / pic.h}))` }}>
        <img ref={img} src={pic.url} alt={`${pic.name} with your gaze heatmap`} className="block w-full" />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      <p className="text-center text-sm text-stone-500 dark:text-stone-400">{points.length} gaze points captured · the hotter the colour, the longer you looked there</p>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> Show heat</label>
        <label className="flex items-center gap-2">Spread <input type="range" min={0.02} max={0.12} step={0.005} value={spread} onChange={(e) => setSpread(Number(e.target.value))} /></label>
        <label className="flex items-center gap-2">Strength <input type="range" min={0.3} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} /></label>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={download} className={primary}>Download PNG</button>
        <button type="button" onClick={onAgain} className={secondary}>Look again</button>
        <button type="button" onClick={onNew} className={secondary}>Another image</button>
        <button type="button" onClick={onRecalibrate} className={secondary}>Redo setup</button>
      </div>
    </div>
  );
}
