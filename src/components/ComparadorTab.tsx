import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useApp, SubidaProgresoInfo } from '../context/AppContext';
import { PlanoComparacionDoc } from '../types';
import { apiFetch, tryReadJsonResponse } from '../utils/apiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord } from '../utils/exportWord';
import {
  FileDiff,
  Upload,
  Trash2,
  Play,
  Copy,
  Check,
  FileDown,
  BookOpen,
  AlertTriangle,
  FileCheck2,
  MessageSquare,
  Loader2,
  Eye,
  Layers,
  SplitSquareHorizontal,
  Columns2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type ModoVisualPdf = 'lado_a_lado' | 'superposicion' | 'deslizador';

async function renderPdfPageToCanvas(
  pdfDoc: any,
  pageNum: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const safePage = Math.max(1, Math.min(pageNum, pdfDoc.numPages || 1));
  const page = await pdfDoc.getPage(safePage);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
  return canvas;
}

const VisorComparadorVisualPdf: React.FC<{
  planoA: PlanoComparacionDoc;
  planoB: PlanoComparacionDoc | null;
}> = ({ planoA, planoB }) => {
  const [abierto, setAbierto] = useState(true);
  const [modo, setModo] = useState<ModoVisualPdf>(planoB ? 'superposicion' : 'lado_a_lado');
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [opacidadB, setOpacidadB] = useState<number>(0.65);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [resaltarDiff, setResaltarDiff] = useState<boolean>(true);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [cargando, setCargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [ratioDiffPct, setRatioDiffPct] = useState<number | null>(null);

  const docARef = useRef<any>(null);
  const docBRef = useRef<any>(null);
  const canvasSideARef = useRef<HTMLCanvasElement>(null);
  const canvasSideBRef = useRef<HTMLCanvasElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const canvasSplitARef = useRef<HTMLCanvasElement>(null);
  const canvasSplitBRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setErrorPdf(null);
    setPagina(1);

    const cargarDoc = async (rol: 'A' | 'B', cacheKey: string) => {
      const res = await apiFetch(`/api/comparador/pdf/${rol}?v=${encodeURIComponent(cacheKey)}`);
      if (!res.ok) {
        throw new Error(`No se pudo cargar el PDF visual del Plano ${rol}.`);
      }
      const buf = await res.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
      return await task.promise;
    };

    (async () => {
      try {
        const docA = await cargarDoc('A', `${planoA.id}_${planoA.fechaSubida}`);
        const docB = planoB ? await cargarDoc('B', `${planoB.id}_${planoB.fechaSubida}`) : null;
        if (cancelado) {
          await docA?.destroy?.();
          await docB?.destroy?.();
          return;
        }
        await docARef.current?.destroy?.();
        await docBRef.current?.destroy?.();
        docARef.current = docA;
        docBRef.current = docB;
        setTotalPaginas(Math.max(docA?.numPages || 1, docB?.numPages || 1));
      } catch (err: any) {
        if (!cancelado) {
          setErrorPdf(err?.message || 'Error cargando visor PDF.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [planoA.id, planoA.fechaSubida, planoB?.id, planoB?.fechaSubida]);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;

    const dibujar = async () => {
      const docA = docARef.current;
      const docB = docBRef.current;
      if (!docA) return;
      setCargando(true);
      try {
        const offA = await renderPdfPageToCanvas(docA, pagina, zoom);
        const offB = docB ? await renderPdfPageToCanvas(docB, pagina, zoom) : null;
        if (cancelado) return;

        if (modo === 'lado_a_lado') {
          if (canvasSideARef.current) {
            canvasSideARef.current.width = offA.width;
            canvasSideARef.current.height = offA.height;
            canvasSideARef.current.getContext('2d')?.drawImage(offA, 0, 0);
          }
          if (offB && canvasSideBRef.current) {
            canvasSideBRef.current.width = offB.width;
            canvasSideBRef.current.height = offB.height;
            canvasSideBRef.current.getContext('2d')?.drawImage(offB, 0, 0);
          }
          setRatioDiffPct(null);
        } else if (modo === 'superposicion' && canvasOverlayRef.current) {
          const w = Math.max(offA.width, offB?.width || 0);
          const h = Math.max(offA.height, offB?.height || 0);
          const dest = canvasOverlayRef.current;
          dest.width = w;
          dest.height = h;
          const ctx = dest.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);

            if (!offB) {
              ctx.drawImage(offA, 0, 0);
              setRatioDiffPct(null);
            } else {
              const ctxA = offA.getContext('2d');
              const ctxB = offB.getContext('2d');
              const dataA = ctxA?.getImageData(0, 0, offA.width, offA.height);
              const dataB = ctxB?.getImageData(0, 0, offB.width, offB.height);
              const outImg = ctx.createImageData(w, h);
              const out = outImg.data;
              let pixelesDistintos = 0;
              const totalPix = w * h;

              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const dstIdx = (y * w + x) * 4;
                  const bx = x - offsetX;
                  const by = y - offsetY;

                  let lumA = 255;
                  if (dataA && x < offA.width && y < offA.height) {
                    const idxA = (y * offA.width + x) * 4;
                    lumA = (dataA.data[idxA] + dataA.data[idxA + 1] + dataA.data[idxA + 2]) / 3;
                  }
                  let lumB = 255;
                  if (dataB && bx >= 0 && bx < offB.width && by >= 0 && by < offB.height) {
                    const idxB = (by * offB.width + bx) * 4;
                    lumB = (dataB.data[idxB] + dataB.data[idxB + 1] + dataB.data[idxB + 2]) / 3;
                  }

                  const inkA = lumA < 225;
                  const inkB = lumB < 225;
                  const diffVal = Math.abs(lumA - lumB);

                  if (resaltarDiff && diffVal > 38) {
                    pixelesDistintos++;
                    if (inkA && !inkB) {
                      // Solo en A -> Cian intenso
                      out[dstIdx] = 14;
                      out[dstIdx + 1] = 165;
                      out[dstIdx + 2] = 233;
                      out[dstIdx + 3] = 255;
                    } else if (!inkA && inkB) {
                      // Nuevo en B -> Rojo / Magenta fuerte
                      out[dstIdx] = Math.round(239 * opacidadB + 255 * (1 - opacidadB));
                      out[dstIdx + 1] = Math.round(68 * opacidadB + 255 * (1 - opacidadB));
                      out[dstIdx + 2] = Math.round(132 * opacidadB + 255 * (1 - opacidadB));
                      out[dstIdx + 3] = 255;
                    } else {
                      out[dstIdx] = 239;
                      out[dstIdx + 1] = 68;
                      out[dstIdx + 2] = 68;
                      out[dstIdx + 3] = 255;
                    }
                  } else {
                    const blended = Math.min(lumA, lumB * (1 - opacidadB) + 255 * (1 - (1 - opacidadB) * (1 - lumB / 255)));
                    const v = Math.round(Math.max(0, Math.min(255, (lumA + lumB) / 2)));
                    out[dstIdx] = v;
                    out[dstIdx + 1] = v;
                    out[dstIdx + 2] = Math.round(blended);
                    out[dstIdx + 3] = 255;
                  }
                }
              }
              ctx.putImageData(outImg, 0, 0);
              setRatioDiffPct(totalPix > 0 ? Number(((pixelesDistintos / totalPix) * 100).toFixed(2)) : 0);
            }
          }
        } else if (modo === 'deslizador') {
          if (canvasSplitARef.current) {
            canvasSplitARef.current.width = offA.width;
            canvasSplitARef.current.height = offA.height;
            canvasSplitARef.current.getContext('2d')?.drawImage(offA, 0, 0);
          }
          if (offB && canvasSplitBRef.current) {
            canvasSplitBRef.current.width = offA.width;
            canvasSplitBRef.current.height = offA.height;
            const ctxB = canvasSplitBRef.current.getContext('2d');
            if (ctxB) {
              ctxB.fillStyle = '#ffffff';
              ctxB.fillRect(0, 0, offA.width, offA.height);
              ctxB.drawImage(offB, offsetX, offsetY);
            }
          }
          setRatioDiffPct(null);
        }
      } catch (err: any) {
        if (!cancelado) setErrorPdf(err?.message || 'Error renderizando página PDF.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    void dibujar();
    return () => {
      cancelado = true;
    };
  }, [abierto, modo, pagina, zoom, opacidadB, offsetX, offsetY, resaltarDiff, planoA.id, planoB?.id]);

  return (
    <div className="bento-card p-3 sm:p-4 space-y-3 border-sky-500/30 bg-slate-950/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white">
              Visor Visual Interactivo de Planos PDF
            </h4>
            <p className="text-[10px] text-slate-400">
              Inspecciona lado a lado, superpone trazos (<span className="text-sky-300">Cian = A</span> vs <span className="text-rose-300">Magenta = B</span>) o usa deslizador A/B
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 font-semibold cursor-pointer"
        >
          {abierto ? 'Contraer visor' : 'Abrir visor visual'}
        </button>
      </div>

      {abierto && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setModo('lado_a_lado')}
                className={`px-2.5 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                  modo === 'lado_a_lado'
                    ? 'bg-sky-600/25 border-sky-400/60 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Lado a Lado</span>
              </button>
              <button
                type="button"
                onClick={() => setModo('superposicion')}
                disabled={!planoB}
                className={`px-2.5 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                  modo === 'superposicion'
                    ? 'bg-sky-600/25 border-sky-400/60 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Superposición + Diff</span>
              </button>
              <button
                type="button"
                onClick={() => setModo('deslizador')}
                disabled={!planoB}
                className={`px-2.5 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                  modo === 'deslizador'
                    ? 'bg-sky-600/25 border-sky-400/60 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span>Deslizador A/B</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-200 px-1">
                  Pág {pagina}/{totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina >= totalPaginas}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <select
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-slate-200"
                aria-label="Zoom de visor PDF"
              >
                <option value={0.6}>60%</option>
                <option value={0.8}>80%</option>
                <option value={1}>100%</option>
                <option value={1.25}>125%</option>
                <option value={1.5}>150%</option>
                <option value={2}>200%</option>
              </select>
            </div>
          </div>

          {planoB && (modo === 'superposicion' || modo === 'deslizador') && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2 text-[10px]">
              {modo === 'superposicion' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Opacidad B:</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={opacidadB}
                      onChange={e => setOpacidadB(Number(e.target.value))}
                      className="w-20 accent-sky-500"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resaltarDiff}
                      onChange={e => setResaltarDiff(e.target.checked)}
                      className="accent-rose-500"
                    />
                    <span>Resaltar diferencias</span>
                  </label>
                  {ratioDiffPct !== null && (
                    <span className="font-mono text-amber-300">
                      Δ píxeles: {ratioDiffPct}%
                    </span>
                  )}
                </div>
              ) : (
                <label className="flex items-center gap-2 text-slate-200 flex-1 min-w-[200px]">
                  <span className="font-mono text-sky-300">A (0%)</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={splitPct}
                    onChange={e => setSplitPct(Number(e.target.value))}
                    className="flex-1 accent-sky-500"
                  />
                  <span className="font-mono text-rose-300">B ({splitPct}%)</span>
                </label>
              )}

              <div className="flex items-center gap-1 font-mono text-slate-300">
                <span>Alinear XY ({offsetX},{offsetY}):</span>
                <button
                  type="button"
                  onClick={() => setOffsetX(x => x - 4)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setOffsetX(x => x + 4)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setOffsetY(y => y - 4)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => setOffsetY(y => y + 4)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  ↓
                </button>
                {(offsetX !== 0 || offsetY !== 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setOffsetX(0);
                      setOffsetY(0);
                    }}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                    title="Reiniciar alineación"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {errorPdf && (
            <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-700/40 rounded-lg px-3 py-2">
              {errorPdf}
            </div>
          )}

          <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-2 overflow-auto max-h-[65vh]">
            {cargando && (
              <div className="flex items-center gap-2 text-xs text-sky-300 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderizando plano PDF...</span>
              </div>
            )}

            {modo === 'lado_a_lado' && (
              <div className={`grid gap-3 ${planoB ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-sky-300 font-bold truncate">
                    PLANO A · {planoA.nombre}
                  </div>
                  <canvas ref={canvasSideARef} className="max-w-full h-auto rounded border border-slate-700 bg-white mx-auto" />
                </div>
                {planoB && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-rose-300 font-bold truncate">
                      PLANO B · {planoB.nombre}
                    </div>
                    <canvas ref={canvasSideBRef} className="max-w-full h-auto rounded border border-slate-700 bg-white mx-auto" />
                  </div>
                )}
              </div>
            )}

            {modo === 'superposicion' && (
              <div className="flex flex-col items-center">
                <canvas ref={canvasOverlayRef} className="max-w-full h-auto rounded border border-slate-700 bg-white" />
              </div>
            )}

            {modo === 'deslizador' && planoB && (
              <div className="relative inline-block max-w-full mx-auto overflow-hidden rounded border border-slate-700 bg-white">
                <canvas ref={canvasSplitARef} className="max-w-full h-auto block" />
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                >
                  <canvas ref={canvasSplitBRef} className="max-w-full h-auto block" />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)] pointer-events-none"
                  style={{ left: `${splitPct}%` }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const PRESETS_ENFOQUE = [
  {
    id: 'general',
    label: 'Auditoría Integral vs. Pliego',
    prompt:
      'Auditoría completa: compara cotas, materiales, normas (CIRSOC, IRAM, IEC, IEEE), hormigón, acero, conductores y criterios constructivos entre planos y frente a las exigencias del pliego.',
  },
  {
    id: 'fundaciones',
    label: 'Fundaciones y Hormigón',
    prompt:
      'Compara calidad de hormigón (H-21, H-25, H-30), acero ADN 420, recubrimientos, profundidades de excavación, armaduras y ensayos contra el Pliego de Especificaciones Técnicas.',
  },
  {
    id: 'pat',
    label: 'Puesta a Tierra',
    prompt:
      'Compara malla de puesta a tierra, sección de conductor de cobre, jabalinas, resistencia máxima admisible (Ohm) y tensiones de paso/contacto respecto al Pliego.',
  },
  {
    id: 'galibos',
    label: 'Distancias y Gálibos 132 kV',
    prompt:
      'Compara alturas libres, distancias eléctricas fase-fase y fase-tierra, gálibos en cruces (rutas/ferrocarriles/líneas) y vanos máximos respecto al Pliego y normativa AEA/IEC.',
  },
  {
    id: 'materiales',
    label: 'Conductores, Herrajes y Cómputo',
    prompt:
      'Compara calibres y tipos de conductor (ACSR/AAAC), cable de guardia OPGW, cadenas de aisladores, morsetería y listados de materiales/cómputo entre ambos planos y el Pliego.',
  },
];

interface SlotPlanoProps {
  rol: 'A' | 'B';
  titulo: string;
  subtitulo: string;
  plano: PlanoComparacionDoc | null;
  progreso: SubidaProgresoInfo | null;
  error: string | null;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
}

const SlotPlanoPdf: React.FC<SlotPlanoProps> = ({
  rol,
  titulo,
  subtitulo,
  plano,
  progreso,
  error,
  onSelectFile,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="bento-card p-3 sm:p-4 flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-sky-400">
              PLANO {rol}
            </span>
            <h4 className="text-xs font-bold text-white">{titulo}</h4>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitulo}</p>
        </div>

        {plano && !progreso && (
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
            title={`Quitar Plano ${rol}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {progreso ? (
        <div className="rounded-xl bg-slate-950 border border-sky-500/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-sky-300 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progreso.fase === 'subiendo' ? 'Subiendo PDF' : 'Indexando plano'}
            </span>
            <span className="font-mono font-bold text-white tabular-nums">
              {progreso.porcentaje}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${Math.max(4, progreso.porcentaje)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 truncate">{progreso.detalle}</p>
        </div>
      ) : plano ? (
        <div className="rounded-xl bg-slate-950 border border-emerald-500/25 p-3 space-y-2">
          <div className="flex items-start gap-2.5">
            <FileCheck2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate" title={plano.nombre}>
                {plano.nombre}
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                {plano.paginas} pág. · {plano.tamanioTexto} · {plano.caracteresTexto.toLocaleString('es-AR')} chars
                {plano.esEscaneado ? ' · Trazado/CAD visual' : ''}
              </p>
            </div>
          </div>

          {plano.metricasDetectadas && plano.metricasDetectadas.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
              <span className="text-slate-500">Parámetros detectados: </span>
              <span className="font-mono text-sky-300">
                {plano.metricasDetectadas.slice(0, 8).join(' · ')}
              </span>
            </div>
          )}

          <button
            onClick={() => inputRef.current?.click()}
            className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            Reemplazar PDF {rol}
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-dashed border-slate-700 hover:border-sky-500/60 bg-slate-950/60 hover:bg-slate-900/80 p-5 flex flex-col items-center justify-center text-center gap-2 transition-colors cursor-pointer group"
        >
          <Upload className="w-5 h-5 text-slate-400 group-hover:text-sky-400 transition-colors" />
          <div>
            <p className="text-xs font-semibold text-slate-200">
              Seleccionar Plano {rol} en PDF
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Admite PDF vectorial o CAD escaneado
            </p>
          </div>
        </button>
      )}

      {error && (
        <p className="text-[11px] text-rose-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

export const ComparadorTab: React.FC = () => {
  const {
    planoCompararA,
    planoCompararB,
    pliegosReales,
    subirPlanoComparador,
    eliminarPlanoComparador,
    setIsPliegosModalOpen,
    setActiveTab,
  } = useApp();

  const [progresoA, setProgresoA] = useState<SubidaProgresoInfo | null>(null);
  const [progresoB, setProgresoB] = useState<SubidaProgresoInfo | null>(null);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  const [presetActivo, setPresetActivo] = useState<string>('general');
  const [enfoqueCustom, setEnfoqueCustom] = useState<string>(PRESETS_ENFOQUE[0].prompt);
  const [analizando, setAnalizando] = useState<boolean>(false);
  const [resultadoMd, setResultadoMd] = useState<string>('');
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleUpload = async (rol: 'A' | 'B', file: File) => {
    const setProg = rol === 'A' ? setProgresoA : setProgresoB;
    const setErr = rol === 'A' ? setErrorA : setErrorB;
    setErr(null);
    setProg({
      fase: 'subiendo',
      porcentaje: 2,
      detalle: `Preparando "${file.name}"...`,
    });

    try {
      await subirPlanoComparador(rol, file, info => setProg(info));
    } catch (err: any) {
      setErr(err?.message || `No se pudo procesar el Plano ${rol}`);
    } finally {
      setProg(null);
    }
  };

  const ejecutarComparacion = async () => {
    if (!planoCompararA) {
      setErrorAnalisis('Carga primero el Plano A en PDF para poder analizar y comparar.');
      return;
    }

    setErrorAnalisis(null);
    setAnalizando(true);
    setResultadoMd('');

    try {
      const res = await apiFetch('/api/comparador/analizar/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enfoque: enfoqueCustom.trim() || PRESETS_ENFOQUE[0].prompt }),
      });

      if (!res.ok || !res.body) {
        const errJson = await tryReadJsonResponse(res);
        throw new Error((errJson as any)?.error || `Error del servidor (HTTP ${res.status})`);
      }
      const cType = (res.headers.get('content-type') || '').toLowerCase();
      if (cType.includes('text/html')) {
        throw new Error(
          'El servidor respondió una página HTML en lugar del análisis en vivo. Recarga la página e intenta nuevamente.'
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acumulado = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const eventos = buffer.split('\n\n');
        buffer = eventos.pop() || '';

        for (const evt of eventos) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr);
            if (payload.chunk) {
              acumulado += payload.chunk;
              setResultadoMd(acumulado);
            }
            if (payload.error) {
              setErrorAnalisis(payload.error);
            }
          } catch {
            // Ignorar fragmentos parciales
          }
        }
      }
    } catch (err: any) {
      setErrorAnalisis(err?.message || 'Error ejecutando la comparación técnica.');
    } finally {
      setAnalizando(false);
    }
  };

  const handleCopy = () => {
    if (!resultadoMd) return;
    navigator.clipboard.writeText(resultadoMd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportWord = () => {
    if (!resultadoMd) return;
    const baseName = planoCompararA?.nombre.replace(/\.pdf$/i, '') || 'plano';
    descargarMarkdownComoWord(
      `Auditoria_${baseName}`,
      `Auditoría Comparativa — ${planoCompararA?.nombre || 'Plano PDF'}`,
      resultadoMd
    );
  };

  return (
    <div className="space-y-4">
      {/* Cabecera de la herramienta */}
      <div className="bento-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
            <FileDiff className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white leading-snug">
              Comparador Real de Planos PDF y Auditoría vs. Pliego
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Compara dos planos en PDF (A vs. B) o audita un plano contra todos tus Pliegos Reales indexados para detectar discrepancias.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] shrink-0">
          <span className="text-slate-400 font-mono tabular-nums">
            <strong className="text-emerald-400">{pliegosReales.length}</strong> pliego(s) activo(s)
          </span>
          <button
            onClick={() => setIsPliegosModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Gestionar Pliegos</span>
          </button>
        </div>
      </div>

      {/* Slots Plano A y Plano B */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SlotPlanoPdf
          rol="A"
          titulo="Plano Base / Revisión Anterior (Obligatorio)"
          subtitulo="Plano principal a revisar contra el Pliego o comparar frente al Plano B."
          plano={planoCompararA}
          progreso={progresoA}
          error={errorA}
          onSelectFile={file => handleUpload('A', file)}
          onRemove={() => eliminarPlanoComparador('A')}
        />
        <SlotPlanoPdf
          rol="B"
          titulo="Plano Revisión Nueva / Alternativo (Opcional)"
          subtitulo="Si lo cargas, la IA comparará Plano A vs. Plano B y validará ambos contra el Pliego."
          plano={planoCompararB}
          progreso={progresoB}
          error={errorB}
          onSelectFile={file => handleUpload('B', file)}
          onRemove={() => eliminarPlanoComparador('B')}
        />
      </div>

      {/* Visor Visual Interactivo de Planos PDF */}
      {planoCompararA && (
        <VisorComparadorVisualPdf planoA={planoCompararA} planoB={planoCompararB} />
      )}

      {/* Enfoque y botón de ejecución */}
      <div className="bento-card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200">
            Enfoque de Auditoría y Cuadro Comparativo
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap sm:flex-wrap max-w-full no-scrollbar pb-0.5">
            {PRESETS_ENFOQUE.map(preset => (
              <button
                key={preset.id}
                onClick={() => {
                  setPresetActivo(preset.id);
                  setEnfoqueCustom(preset.prompt);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  presetActivo === preset.id
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={2}
          value={enfoqueCustom}
          onChange={e => setEnfoqueCustom(e.target.value)}
          placeholder="Indica qué parámetros, cotas, armaduras o artículos del pliego quieres contrastar..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
        />

        {pliegosReales.length === 0 && (
          <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              No hay pliegos cargados aún: se compararán ambos planos entre sí. Para detectar discrepancias contractuales,{' '}
              <button
                onClick={() => setIsPliegosModalOpen(true)}
                className="underline font-semibold hover:text-amber-200 cursor-pointer"
              >
                carga tus pliegos reales aquí
              </button>
              .
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={ejecutarComparacion}
            disabled={!planoCompararA || analizando || Boolean(progresoA) || Boolean(progresoB)}
            className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-sky-600/20"
          >
            {analizando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Auditando Planos y Pliegos...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 shrink-0" />
                <span>
                  {planoCompararB
                    ? 'Comparar Plano A vs. Plano B y Auditar contra Pliego'
                    : 'Auditar Plano A contra Pliego Real'}
                </span>
              </>
            )}
          </button>

          {resultadoMd && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
              <button
                onClick={handleExportWord}
                className="px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Descargar Word (.doc)</span>
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className="px-3 py-2 rounded-lg bg-sky-600/15 hover:bg-sky-600/25 text-sky-300 text-[11px] font-semibold border border-sky-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Seguir en Chat IA</span>
              </button>
            </div>
          )}
        </div>

        {errorAnalisis && (
          <p className="text-xs text-rose-300 flex items-center gap-1.5 pt-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorAnalisis}</span>
          </p>
        )}
      </div>

      {/* Resultado renderizado con tablas comparativas */}
      {(resultadoMd || analizando) && (
        <div className="bento-card p-3 sm:p-5 space-y-3 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <span className="text-xs font-bold text-sky-400">
              Resultado de Comparación y Discrepancias
            </span>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-full">
              {planoCompararA?.nombre}
              {planoCompararB ? ` vs. ${planoCompararB.nombre}` : ''}
            </span>
          </div>

          {resultadoMd ? (
            <MarkdownRenderer content={resultadoMd} />
          ) : (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Analizando planos PDF y contrastando exigencias de pliego...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
