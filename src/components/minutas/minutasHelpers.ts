import { CompromisoMinuta } from '../../types';

export type SubVistaMinutas = 'compromisos' | 'minutas' | 'notas_pedido';
export type FiltroEstado = 'TODOS' | 'INCUMPLIDO' | 'PENDIENTE' | 'CUMPLIDO';

export interface UltimoScanDriveInfo {
  carpetaRaizNombre: string;
  carpetasEscaneadas: number;
  archivosDetectados: number;
  minutasNuevas: number;
  compromisosNuevos: number;
  erroresArchivos: Array<{ nombre: string; error: string }>;
}

export interface AudioConfigStatus {
  groqConfigurado: boolean;
  groqVistaSegura: string | null;
  openRouterConfigurado: boolean;
  geminiConfigurado: boolean;
}

export const FRENTES_OPCIONES = [
  'LAT El Bracho - Villa Quinteros',
  'ET Leales',
  'ET Villa Quinteros',
  'ET El Bracho',
];

export function calcularDiasDesvio(fechaLimite: string, hoyIso: string): number {
  const fLim = new Date(`${fechaLimite}T00:00:00`).getTime();
  const fHoy = new Date(`${hoyIso}T00:00:00`).getTime();
  if (Number.isNaN(fLim) || Number.isNaN(fHoy)) return 0;
  return Math.round((fHoy - fLim) / (1000 * 60 * 60 * 24));
}

export function esIncumplidoOVencido(c: CompromisoMinuta, hoyIso: string): boolean {
  if (c.estado === 'CUMPLIDO') return false;
  if (c.estado === 'INCUMPLIDO') return true;
  return Boolean(c.fechaLimite && c.fechaLimite < hoyIso);
}

export function formatearCronometro(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function imprimirMarkdownComoPdf(titulo: string, contenidoMarkdown: string): void {
  const html = contenidoMarkdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${titulo}</title><style>body{font-family:Calibri,Arial,sans-serif;padding:28px;color:#0f172a;font-size:11pt;line-height:1.5;}h1{font-size:15pt;border-bottom:2px solid #0f172a;padding-bottom:6px;}h2{font-size:12pt;color:#0369a1;margin-top:14px;}</style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 250);
}
