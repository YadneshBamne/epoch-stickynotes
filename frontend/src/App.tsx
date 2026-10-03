import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { analyze } from "./api";
import HeatmapViewer from "./components/HeatmapViewer";
import { AttentionShare, Card, Details, Footer, Recommendations, ScoreGrid } from "./components/Panels";
import CompareView from "./components/CompareView";
import EyeLab from "./lab/EyeLab";
import Uploader from "./components/Uploader";
import type { AnalysisResult } from "./types";

export default function App() {
  const [mode, setMode] = useState<"analyze" | "compare" | "lab">("analyze");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const [opacity, setOpacity] = useState(0.7);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showPath, setShowPath] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [highlight, setHighlight] = useState<[number, number, number, number] | null>(null);

  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  async function run(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await analyze(file, file.name);
      setLocalUrl(URL.createObjectURL(file));
      setResult(res);
      setHighlight(null);
      setReplayKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Prefer the backend's preview: it is the exact frame the model analysed, so overlays line up
  // even when the upload was not 16:9.
  const imageUrl = result?.preview_jpg ? `data:image/jpeg;base64,${result.preview_jpg}` : localUrl;

  const tabs = [["analyze", "Analyze"], ["compare", "Compare two"], ["lab", "Eye lab"]] as const;

  return (
    <div className="mx-auto max-w-[1760px] px-5 py-8 sm:px-8 lg:px-12">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-black bg-pink-400 nb-shadow-sm">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-black">Thumbnail Attention Studio</h1>
            <p className="text-sm text-stone-700">See where viewers look first, and what to change. Everything runs on your computer.</p>
          </div>
        </div>
        <nav aria-label="Mode" className="relative flex gap-3 text-sm">
          {tabs.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setError(null); }}
              className={`relative border-2 border-black px-4 py-2 font-black uppercase transition-transform focus-visible:outline-2 focus-visible:outline-black ${mode === m ? "-translate-y-0.5 bg-yellow-300 text-black nb-shadow-sm" : "bg-white text-black hover:bg-yellow-100"}`}>
              <span className="relative">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={mode === "analyze" ? (result ? "result" : "empty") : mode} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}>
          {mode === "compare" ? <CompareView /> : mode === "lab" ? <EyeLab /> : <>
            {error && (
              <div role="alert" className="mb-5 border-2 border-black bg-rose-400 px-4 py-3 text-sm font-bold text-black nb-shadow-sm">{error}</div>
            )}

            {!result ? (
              <Uploader busy={busy} onFile={run} onError={setError} />
            ) : (
              <div className="grid items-start gap-6 xl:grid-cols-12">
                <div className="space-y-5 xl:col-span-6 xl:sticky xl:top-6">
                  {imageUrl && (
                    <HeatmapViewer imageUrl={imageUrl} result={result} opacity={opacity} showHeatmap={showHeatmap} showPath={showPath} showBoxes={showBoxes} replayKey={replayKey} highlight={highlight} />
                  )}

                  {result.regions.some((r) => r.type === "text" && r.mobile_readable === false) && (
                    <p className="border-2 border-black bg-rose-300 px-4 py-3 text-sm font-bold text-black nb-shadow-sm">
                      Text in red boxes will be too small to read when the thumbnail is shown at sidebar size (168 pixels wide).
                    </p>
                  )}

                  <div className="space-y-4 border-2 border-black bg-white p-5 nb-shadow">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-bold text-black">
                      <Toggle label="Show heatmap" on={showHeatmap} set={setShowHeatmap} />
                      <Toggle label="Show viewing order" on={showPath} set={setShowPath} />
                      <Toggle label="Show detected areas" on={showBoxes} set={setShowBoxes} />
                      <button type="button" disabled={!showPath} onClick={() => setReplayKey((k) => k + 1)} className="nb-btn bg-white px-3 py-1.5 text-sm">
                        Replay viewing order
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-stone-800">
                      <label className="flex items-center gap-3">
                        Heatmap strength
                        <input type="range" min={0} max={100} value={Math.round(opacity * 100)} disabled={!showHeatmap} onChange={(e) => setOpacity(Number(e.target.value) / 100)} aria-label="Heatmap strength" className="w-44 accent-black" />
                        <span className="w-10 tabular-nums text-stone-700">{Math.round(opacity * 100)}%</span>
                      </label>
                      <div className="ml-auto flex items-center gap-3 text-stone-700" aria-label="Heatmap colour scale">
                        Less attention
                        <span className="h-4 w-36 border-2 border-black" style={{ background: "linear-gradient(90deg,#000004,#420a68,#932667,#dd513a,#fca50a,#fcffa4)" }} />
                        More attention
                      </div>
                    </div>
                  </div>

                  <Uploader busy={busy} onFile={run} onError={setError} compact />
                </div>

                <div className="grid gap-6 xl:col-span-6 md:grid-cols-2">
                  <div className="space-y-6">
                    <Card index={1} title="Scorecard" hint="Higher is better. Select a row to see how it was worked out."><ScoreGrid scores={result.scores} detail={result.metrics.scores_detail} /></Card>
                    <Card index={2} title="Where attention goes" hint="Share of viewer attention landing on each kind of content."><AttentionShare shares={result.metrics.attention_share} /></Card>
                  </div>
                  <div className="space-y-6">
                    <Card index={3} title="What to fix" hint="Hover over a fix to highlight the part of the thumbnail it refers to."><Recommendations items={result.recommendations} onHover={setHighlight} /></Card>
                    <Card index={4} title="Details"><Details metrics={result.metrics} /></Card>
                    <Footer result={result} />
                  </div>
                </div>
              </div>
            )}
          </>}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-black">
      <span className={`flex h-7 w-12 items-center border-2 border-black p-0.5 transition-colors ${on ? "bg-green-400" : "bg-white"}`}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`h-5 w-5 border-2 border-black bg-black ${on ? "ml-auto" : ""}`} />
      </span>
      {label}
    </button>
  );
}
