import { URL } from "url";
import needle from "needle";
import merge from "lodash.merge";
import { ProbeError } from "./lib/common";
import probeStream from "./stream";
import parsers from "./lib/parsers_stream";
import { ProbeResult, ProbeOptions, StreamParsers } from "./types";

// Read package.json info
const pkg = { name: "probe-image-size", version: "8.0.0" };

const defaultAgent = `${pkg.name}/${pkg.version}(+https://github.com/nodeca/probe-image-size)`;

const defaults: ProbeOptions = {
  open_timeout: 10000,
  response_timeout: 60000,
  read_timeout: 60000,
  follow_max: 10,
  parse_response: false,
  headers: {
    "User-Agent": defaultAgent,
  },
};

// Extended needle stream type with request property
interface NeedleStream extends NodeJS.ReadableStream {
  request: { abort: () => void };
  on(event: "redirect", listener: (location: string) => void): this;
  on(
    event: "header",
    listener: (statusCode: number, headers: Record<string, string>) => void
  ): this;
  on(event: "err", listener: (err: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

/**
 * Probe an HTTP URL for image size information
 */
function probeHttp(
  src: string,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    let stream: NeedleStream;
    let len: string | undefined;
    let finalUrl = src;

    try {
      const needleOptions = merge({}, defaults, options);
      stream = needle.get(src, needleOptions) as unknown as NeedleStream;
    } catch (err) {
      reject(err);
      return;
    }

    stream.on("redirect", (location: string) => {
      try {
        finalUrl = new URL(location, finalUrl).href;
      } catch (err) {
        reject(err);
        stream.request.abort();
      }
    });

    stream.on(
      "header",
      (statusCode: number, headers: Record<string, string>) => {
        if (statusCode !== 200) {
          reject(
            new ProbeError("bad status code: " + statusCode, null, statusCode)
          );
          stream.request.abort();
          return;
        }

        len = headers["content-length"];
      }
    );

    stream.on("err", (err: Error) => {
      reject(err);
      stream.request.abort();
    });

    probeStream(stream as unknown as import("stream").Readable, true)
      .then((result) => {
        if (len && len.match(/^\d+$/)) result.length = +len;

        result.url = finalUrl;

        resolve(result);
        stream.request.abort();
      })
      .catch((err) => {
        reject(err);
        stream.request.abort();
      });
  });
}

// Export parsers as a property
const httpWithParsers = probeHttp as typeof probeHttp & {
  parsers: StreamParsers;
};
httpWithParsers.parsers = parsers;

export default httpWithParsers;
export { parsers };
