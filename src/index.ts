import { Readable } from "stream";
import probeStream from "./stream";
import probeHttp from "./http";
import syncModule from "./sync";
import { ProbeError } from "./lib/common";
import parsers from "./lib/parsers_stream";
import { ProbeResult, ProbeOptions, StreamParsers } from "./types";

// Re-export types
export { ProbeResult, ProbeOptions, StreamParsers, SyncParsers } from "./types";

/**
 * Get image size from a stream or URL
 *
 * @param src - Either a readable stream or a URL string
 * @param options - Options for HTTP requests (only used when src is a URL)
 * @returns Promise that resolves with image size information
 */
function probe(src: Readable, options?: ProbeOptions): Promise<ProbeResult>;
function probe(src: string, options?: ProbeOptions): Promise<ProbeResult>;
function probe(
  src: Readable | string,
  options?: ProbeOptions
): Promise<ProbeResult> {
  if (
    typeof src === "object" &&
    typeof (src as Readable).on === "function" &&
    typeof (src as Readable).emit === "function"
  ) {
    // looks like an EventEmitter, treating it as a stream
    return probeStream(src as Readable, options as unknown as boolean);
  }

  // HTTP (not stream)
  return probeHttp(src as string, options || {});
}

// Export sync and other properties
interface ProbeFunction {
  (src: Readable, options?: ProbeOptions): Promise<ProbeResult>;
  (src: string, options?: ProbeOptions): Promise<ProbeResult>;
  parsers: StreamParsers;
  sync: typeof syncModule;
  Error: typeof ProbeError;
}

const probeWithExtras = probe as ProbeFunction;
probeWithExtras.parsers = parsers;
probeWithExtras.sync = syncModule;
probeWithExtras.Error = ProbeError;

// CommonJS compatibility - export the function directly
module.exports = probeWithExtras;
module.exports.default = probeWithExtras;
module.exports.parsers = parsers;
module.exports.sync = syncModule;
module.exports.ProbeError = ProbeError;

export default probeWithExtras;
export { parsers, syncModule as sync, ProbeError };
