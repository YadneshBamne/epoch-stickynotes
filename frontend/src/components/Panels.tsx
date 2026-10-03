import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import type { AnalysisResult, Recommendation, Scores } from "../types";

export function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => { const c = animate(mv, value, { duration: 0.9, ease: "easeOut" }); return () => c.stop(); }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

const SHARE_ORDER = ["face", "text", "subject", "background"] as const;
const SHARE_LABEL: Record<string, string> = { face: "Faces", text: "Text", subject: "Main subject", background: "Background" };
const SHARE_COLOR: Record<string, string> = { face: "bg-cyan-300", text: "bg-yellow-300", subject: "bg-violet-400", background: "bg-stone-400" };

export function Card({ title, hint, children, index = 0, className = "" }: { title: string; hint?: string; children: React.ReactNode; index?: number; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 * index, ease: "easeOut" }}
      className={`border-2 border-black bg-white p-5 nb-shadow ${className}`}
    >
      <h2 className="inline-block border-2 border-black bg-yellow-300 px-3 py-1 text-base font-black uppercase tracking-wide text-black">{title}</h2>
      {hint ? <p className="mb-5 mt-3 text-sm font-medium text-stone-700">{hint}</p> : <div className="mb-5" />}
      {children}
    </motion.section>
  );
}

export function AttentionShare({ shares }: { shares: Record<string, unknown> | undefined }) {
  if (!shares) return <p className="text-sm text-black0">Not available.</p>;
  return (
    <ul className="space-y-4">
      {SHARE_ORDER.map((k) => {
        const v = Number(shares[k] ?? 0);
        return (
          <li key={k}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-black">{SHARE_LABEL[k]}</span>
              <span className="tabular-nums font-semibold text-black">{v.toFixed(1)}%</span>
            </div>
            <div className="h-4 overflow-hidden border-2 border-black bg-white">
              <motion.div className={`h-full border-r-2 border-black ${SHARE_COLOR[k]}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, v)}%` }} transition={{ duration: 0.9, ease: "easeOut" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const SCORE_LABELS: [keyof Scores, string][] = [
  ["overall", "Overall score"], ["focus", "Clear main focus"], ["text_readability", "Text is easy to read"], ["face_impact", "Face draws the eye"], ["clutter", "Uncluttered design"],
];

interface Component { id: string; label: string; value: number | null; score: number | null; weight: number }
interface ScoreDetail { note?: string; applicable?: boolean; components?: Component[]; penalties?: { id: string; label: string; points: number }[] }

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-4 flex-1 overflow-hidden border-2 border-black bg-white">
      <motion.div className={`h-full border-r-2 border-black ${tone}`} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.9, ease: "easeOut" }} />
    </div>
  );
}

const tone = (v: number) => (v >= 70 ? "bg-green-400" : v >= 45 ? "bg-yellow-300" : "bg-rose-400");

export function ScoreGrid({ scores, detail }: { scores: Scores | null; detail?: Record<string, unknown> }) {
  if (!scores) return <p className="text-sm text-stone-700">Scores are not available.</p>;
  const det = (k: string) => (detail?.[k] ?? {}) as ScoreDetail;
  return (
    <ul className="space-y-4">
      {SCORE_LABELS.map(([k, label]) => {
        const v = scores[k];
        const d = det(k);
        const big = k === "overall";
        return (
          <li key={k}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-black">
                <span className={`${big ? "w-40 text-base font-semibold" : "w-40 text-sm text-stone-800"}`}>{label}</span>
                {v === null ? <span className="text-sm text-stone-700">Not applicable. {d.note}</span> : (
                  <>
                    <Bar pct={v} tone={tone(v)} />
                    <span className={`${big ? "text-3xl font-black" : "text-sm font-black"} w-10 text-right tabular-nums`}><CountUp value={v} /></span>
                  </>
                )}
              </summary>
              {v !== null && (d.components?.length || d.penalties?.length) ? (
                <ul className="mt-3 space-y-2 border-l-4 border-black pl-3 text-xs text-stone-700">
                  {d.components!.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="w-44 shrink-0" title={c.label}>{c.label}</span>
                      {c.score === null ? <span className="italic">No data</span> : <><Bar pct={c.score * 100} tone={tone(c.score * 100)} /><span className="w-8 text-right tabular-nums">{Math.round(c.score * 100)}</span></>}
                    </li>
                  ))}
                  {d.penalties?.map((p) => (
                    <li key={p.id} className="text-rose-600 dark:text-rose-400">− {Math.round(p.points)} points: {p.label}</li>
                  ))}
                </ul>
              ) : null}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

const SEVERITY: Record<Recommendation["severity"], string> = {
  high: "bg-rose-400",
  medium: "bg-yellow-300",
  low: "bg-stone-200",
};
const SEVERITY_LABEL: Record<Recommendation["severity"], string> = { high: "Important", medium: "Worth fixing", low: "Minor" };

export function Recommendations({ items, onHover }: { items: Recommendation[]; onHover?: (box: [number, number, number, number] | null) => void }) {
  if (!items.length) return <p className="text-sm text-stone-700">Nothing to fix. This thumbnail looks good.</p>;
  return (
    <ol className="space-y-4">
      {items.map((r, i) => (
        <li
          key={r.id}
          tabIndex={r.box ? 0 : undefined}
          onMouseEnter={() => onHover?.(r.box ?? null)}
          onMouseLeave={() => onHover?.(null)}
          onFocus={() => onHover?.(r.box ?? null)}
          onBlur={() => onHover?.(null)}
          title={r.box ? "Hover to highlight the part of the thumbnail this is about" : undefined}
          className={`-m-2 flex gap-3 rounded-none p-2 text-sm leading-relaxed font-medium text-black transition-colors hover:bg-yellow-200 outline-offset-0 focus-visible:outline-2 focus-visible:outline-black ${r.box ? "cursor-help" : ""}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-black bg-yellow-300 text-sm font-black tabular-nums text-black">{i + 1}</span>
          <div>
            <span className={`mb-1 block w-fit border-2 border-black px-2 py-0.5 text-xs font-bold uppercase text-black ${SEVERITY[r.severity]}`}>{SEVERITY_LABEL[r.severity]}</span>
            {r.message}
          </div>
        </li>
      ))}
    </ol>
  );
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function Details({ metrics }: { metrics: AnalysisResult["metrics"] }) {
  const face = metrics.face ?? {}, text = metrics.text ?? {}, subject = metrics.subject ?? {}, color = metrics.color ?? {}, comp = metrics.composition ?? {};
  const palette = Array.isArray(color.palette_hex) ? (color.palette_hex as string[]) : [];
  const share = Array.isArray(color.palette_share) ? (color.palette_share as number[]) : [];
  const rows: [string, string | null][] = [
    ["Faces found", n(face.count) !== null ? String(n(face.count)) : null],
    ["Lines of text", n(text.count) !== null ? `${n(text.count)} (${n(text.unreadable_mobile_count) ?? 0} too small on phones)` : null],
    ["Weakest text contrast", n(text.min_contrast) !== null ? `${n(text.min_contrast)}:1` : null],
    ["Subject size", n(subject.area_pct) !== null ? `${n(subject.area_pct)}% of frame` : null],
    ["Competing points of interest", n(comp.focal_points) !== null ? String(n(comp.focal_points)) : null],
    ["Empty space", n(comp.negative_space_pct) !== null ? `${Math.round(n(comp.negative_space_pct) as number)}% of frame` : null],
    ["Attention hidden under the video time stamp", n(comp.ui_overlap_pct) !== null ? `${n(comp.ui_overlap_pct)}% of attention` : null],
    ["Colour richness", n(color.colorfulness_score) !== null ? `${n(color.colorfulness_score)} / 100` : null],
  ];
  return (
    <div className="space-y-3">
      {palette.length > 0 && (
        <div className="flex h-8 overflow-hidden border-2 border-black" role="img" aria-label={`Colour palette: ${palette.join(", ")}`}>
          {palette.map((hex, i) => (
            <div key={hex + i} title={`${hex} · ${Math.round((share[i] ?? 0) * 100)}%`} style={{ background: hex, flexGrow: Math.max(share[i] ?? 0.05, 0.05) * 100 }} />
          ))}
        </div>
      )}
      <dl className="space-y-2.5 text-sm">
        {rows.filter(([, v]) => v !== null).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-black pb-2 last:border-0">
            <dt className="text-stone-700">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-black">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Footer({ result }: { result: AnalysisResult }) {
  const t = result.timing_ms;
  return (
    <div className="space-y-2 text-sm text-black0">
      <p>{result.cached ? "Loaded from your earlier analysis" : "Analysed"} in {Math.round(t.total ?? 0)} ms.</p>
      {result.unavailable.length > 0 && (
        <p className="rounded-none border-2 border-black bg-yellow-200 px-3 py-2 font-medium text-black">
          Some checks could not run: {result.unavailable.join(", ")}. The rest of the report is still valid.
        </p>
      )}
    </div>
  );
}
