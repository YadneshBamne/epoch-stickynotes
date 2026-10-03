import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  busy: boolean;
  onFile: (file: File) => void;
  onError: (msg: string) => void;
  compact?: boolean;
}

export default function Uploader({ busy, onFile, onError, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [samples, setSamples] = useState<{ file: string; label: string }[]>([]);

  function accept(file: File | undefined) {
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) return onError("Please use a JPG, PNG or WEBP image.");
    if (file.size > MAX_BYTES) return onError("That file is over 10 MB.");
    onFile(file);
  }

  // Ctrl+V anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => accept([...(e.clipboardData?.files ?? [])][0]);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // Dev convenience: frontend/public/samples/index.json (git-ignored) lists local sample thumbnails.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch("/samples/index.json").then((r) => (r.ok ? r.json() : [])).then(setSamples).catch(() => {});
  }, []);

  async function useSample(file: string) {
    const blob = await (await fetch(`/samples/${file}`)).blob();
    accept(new File([blob], file, { type: blob.type || "image/jpeg" }));
  }

  const steps = [
    ["Upload", "Drop in any thumbnail, or paste one with Ctrl+V."],
    ["See the heatmap", "We show where viewers look first and the order they follow."],
    ["Fix what matters", "Get a score and a short list of plain changes to try."],
  ];

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-8 max-w-3xl">
          <h2 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl">Will your thumbnail get noticed?</h2>
          <p className="mt-4 text-lg text-stone-700">Upload a thumbnail and see where people will look, in what order, and what to change so the right things stand out.</p>
        </div>
      )}
      <motion.div
        whileHover={{ scale: compact ? 1 : 1.005 }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files[0]); }}
        className={`flex flex-col items-center justify-center rounded-none border-4 border-dashed text-center transition-colors
          ${compact ? "px-4 py-6" : "px-6 py-20"}
          ${drag ? "border-black bg-yellow-300" : "border-black bg-white"}`}
      >
        <p className={`${compact ? "text-base" : "text-2xl"} font-black text-black`}>
          {busy ? "Analysing your thumbnail. This takes a few seconds." : compact ? "Analyse another thumbnail" : "Drop a thumbnail here"}
        </p>
        <p className="mt-1.5 text-sm text-stone-700">JPG, PNG or WEBP, up to 10 MB. You can also paste with Ctrl+V.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mt-5 nb-btn bg-yellow-300 px-6 py-3 text-base text-black"
        >
          {busy ? "Working..." : "Choose a file"}
        </button>
        <input ref={input} type="file" accept={OK_TYPES.join(",")} hidden onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
        {busy && <motion.div className="mt-6 h-3 w-64 overflow-hidden border-2 border-black bg-white"><motion.div className="h-full w-1/3 bg-black" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} /></motion.div>}
      </motion.div>

      {!compact && (
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <motion.li key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1 }} className="border-2 border-black bg-white p-5 nb-shadow">
              <span className="flex h-9 w-9 items-center justify-center border-2 border-black bg-pink-400 text-lg font-black text-black">{i + 1}</span>
              <h3 className="mt-3 font-semibold text-black">{t}</h3>
              <p className="mt-1 text-sm text-stone-700">{d}</p>
            </motion.li>
          ))}
        </ol>
      )}

      {samples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-700">Sample thumbnails:</span>
          {samples.map((s) => (
            <button key={s.file} disabled={busy} onClick={() => useSample(s.file)} className="nb-btn bg-white px-2 py-1">
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
