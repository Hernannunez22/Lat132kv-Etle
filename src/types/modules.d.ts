declare module 'mammoth' {
  export function extractRawText(
    input: { buffer: Buffer } | { arrayBuffer: ArrayBuffer } | { path: string }
  ): Promise<{ value: string; messages: any[] }>;
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export class PDFDataRangeTransport {
    constructor(length: number, initialData: Uint8Array | null, progressiveDone?: boolean, contentDispositionFilename?: string);
    onDataRange(begin: number, chunk: Uint8Array): void;
    onDataProgress(loaded: number, total?: number): void;
    onDataProgressiveRead(chunk: Uint8Array): void;
    onDataProgressiveDone(): void;
    requestDataRange(begin: number, end: number): void;
    abort(): void;
  }

  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(src: {
    url?: string;
    data?: Uint8Array | ArrayBuffer;
    range?: PDFDataRangeTransport;
    length?: number;
    verbosity?: number;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
        getViewport(params: { scale: number; rotation?: number }): {
          width: number;
          height: number;
        };
        render(params: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }): { promise: Promise<void>; cancel?(): void };
        cleanup?(): boolean;
      }>;
      cleanup?(): Promise<void>;
      destroy?(): Promise<void>;
    }>;
    destroy?(): Promise<void>;
  };
}
