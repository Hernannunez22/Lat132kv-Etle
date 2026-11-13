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

  export function getDocument(src: {
    data?: Uint8Array;
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
        cleanup?(): boolean;
      }>;
      cleanup?(): Promise<void>;
    }>;
    destroy?(): Promise<void>;
  };
}
