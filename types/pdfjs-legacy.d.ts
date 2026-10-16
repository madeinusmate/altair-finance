declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export const PasswordResponses: { NEED_PASSWORD: number; INCORRECT_PASSWORD: number };
  export const VerbosityLevel: { ERRORS: number; WARNINGS: number; INFOS: number };

  type PdfTextContent = { items: unknown[] };

  type PdfPageProxy = {
    getTextContent: () => Promise<PdfTextContent>;
  };

  type PdfDocumentProxy = {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfPageProxy>;
    destroy: () => Promise<void>;
  };

  type PdfLoadingTask = {
    promise: Promise<PdfDocumentProxy>;
  };

  export const getDocument: (src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useWasm?: boolean;
    disableFontFace?: boolean;
    verbosity?: number;
    standardFontDataUrl?: string;
  }) => PdfLoadingTask;
}
