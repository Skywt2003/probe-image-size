import parsers from "./lib/parsers_sync";
import { ProbeResult, SyncParsers } from "./types";

function probeBuffer(
  buffer: Uint8Array | Buffer | number[]
): ProbeResult | null {
  const parser_names = Object.keys(parsers) as (keyof typeof parsers)[];

  for (let i = 0; i < parser_names.length; i++) {
    const result = parsers[parser_names[i]](buffer);

    if (result) return result;
  }

  return null;
}

/**
 * Synchronously probe buffer for image size information
 */
function sync(src: Uint8Array | Buffer | number[]): ProbeResult | null {
  return probeBuffer(src);
}

// Export parsers as a property
const syncWithParsers = sync as typeof sync & { parsers: SyncParsers };
syncWithParsers.parsers = parsers;

export default syncWithParsers;
export { parsers };
