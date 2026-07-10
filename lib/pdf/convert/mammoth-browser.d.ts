// mammoth ships types for its Node entry but not for the browser subpath we
// import to avoid pulling in Node built-ins. Declare the slice we use.
declare module "mammoth/mammoth.browser.js" {
  interface ConvertResult {
    value: string;
    messages: unknown[];
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ConvertResult>;
}
