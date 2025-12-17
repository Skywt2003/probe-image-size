import { Readable, PassThrough, pipeline } from "stream";
import { ProbeError } from "./lib/common";
import parsers from "./lib/parsers_stream";
import { ProbeResult, StreamParsers } from "./types";

/**
 * Probe a readable stream for image size information
 */
function probeStream(src: Readable, keepOpen?: boolean): Promise<ProbeResult> {
  const proxy = new PassThrough();

  // increase max number of listeners to stop memory leak warning
  proxy.setMaxListeners(Object.keys(parsers).length + 10);

  const result = new Promise<ProbeResult>((resolve, reject) => {
    src.on("error", reject);
    proxy.on("error", reject);

    const alive_parsers: ReturnType<(typeof parsers)[keyof typeof parsers]>[] =
      [];
    let last_error: Error | undefined;

    function parserEnd(
      this: ReturnType<(typeof parsers)[keyof typeof parsers]>,
      err?: Error
    ): void {
      const idx = alive_parsers.indexOf(this);

      /* istanbul ignore if */
      if (idx < 0) return;

      /* istanbul ignore if */
      if (err) last_error = err;

      proxy.unpipe(this);
      this.removeAllListeners();
      alive_parsers.splice(idx, 1);

      if (alive_parsers.length) return;

      // if all parsers finished without success -> fail.
      reject(
        last_error || new ProbeError("unrecognized file format", "ECONTENT")
      );
    }

    Object.keys(parsers).forEach((type) => {
      const parserKey = type as keyof typeof parsers;
      const pStream = parsers[parserKey]();

      alive_parsers.push(pStream);

      pStream.once("data", resolve);
      pStream.once("end", parserEnd.bind(pStream));
      // User does not need to know that something wrong in parser
      // Process error the same was unrecognized format (end without data)
      pStream.on("error", parserEnd.bind(pStream));

      proxy.pipe(pStream);
    });
  });

  function cleanup(): void {
    // request stream doesn't have unpipe, https://github.com/request/request/issues/874
    if (keepOpen && typeof src.unpipe === "function") src.unpipe(proxy);
    proxy.destroy();
  }

  result.then(cleanup).catch(cleanup);

  if (keepOpen) src.pipe(proxy);
  else pipeline(src, proxy, () => {});

  return result;
}

// Export parsers as a property
const streamWithParsers = probeStream as typeof probeStream & {
  parsers: StreamParsers;
};
streamWithParsers.parsers = parsers;

export default streamWithParsers;
export { parsers };
