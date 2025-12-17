import { ParserStream, str2arr, sliceEq } from "../common";
import * as exif from "../exif_utils";
import { ProbeResult } from "../../types";

const SIG_EXIF = str2arr("Exif\0\0");

interface JpegSandbox {
  start: boolean;
  orientation?: number;
}

// part of parseJpegMarker called after skipping initial FF
function parseJpegMarker_afterFF(
  parser: ParserStream,
  callback: (code?: number, length?: number) => void
): void {
  parser._bytes(1, (data: Buffer) => {
    const code = data[0];

    if (code === 0xff) {
      // padding byte, skip it
      parseJpegMarker_afterFF(parser, callback);
      return;
    }

    // standalone markers, according to JPEG 1992,
    // http://www.w3.org/Graphics/JPEG/itu-t81.pdf, see Table B.1
    if ((0xd0 <= code && code <= 0xd9) || code === 0x01) {
      callback(code, 0);
      return;
    }

    // the rest of the unreserved markers
    if (0xc0 <= code && code <= 0xfe) {
      parser._bytes(2, (length: Buffer) => {
        callback(code, length.readUInt16BE(0) - 2);
      });
      return;
    }

    // unknown markers
    callback();
  });
}

function parseJpegMarker(
  parser: ParserStream,
  sandbox: JpegSandbox,
  callback: (code?: number, length?: number) => void
): void {
  const start = sandbox.start;
  sandbox.start = false;

  parser._bytes(1, (data: Buffer) => {
    if (data[0] !== 0xff) {
      // not a JPEG marker
      if (start) {
        // expect JPEG file to start with `FFD8 FFE0`, `FFD8 FFE2` or `FFD8 FFE1`,
        // don't allow garbage before second marker
        callback();
      } else {
        // skip until we see 0xFF, see https://github.com/nodeca/probe-image-size/issues/68
        parseJpegMarker(parser, sandbox, callback);
      }
      return;
    }

    parseJpegMarker_afterFF(parser, callback);
  });
}

// sandbox is a storage for intermediate data retrieved from jpeg while parsing it
function getJpegSize(parser: ParserStream, sandbox: JpegSandbox): void {
  parseJpegMarker(parser, sandbox, (code?: number, length?: number) => {
    if (!code || length === undefined || length < 0) {
      // invalid jpeg
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    if (code === 0xd9 /* EOI */ || code === 0xda /* SOS */) {
      // end of the datastream
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    // try to get orientation from Exif segment
    if (code === 0xe1 && length >= 10) {
      parser._bytes(length, (data: Buffer) => {
        if (sliceEq(data, 0, SIG_EXIF)) {
          sandbox.orientation = exif.get_orientation(
            data.subarray(6, 6 + length)
          );
        }

        getJpegSize(parser, sandbox);
      });
      return;
    }

    if (length <= 0) {
      // e.g. empty comment
      getJpegSize(parser, sandbox);
      return;
    }

    if (
      length >= 5 &&
      0xc0 <= code &&
      code <= 0xcf &&
      code !== 0xc4 &&
      code !== 0xc8 &&
      code !== 0xcc
    ) {
      parser._bytes(length, (data: Buffer) => {
        parser._skipBytes(Infinity);

        const result: ProbeResult = {
          width: data.readUInt16BE(3),
          height: data.readUInt16BE(1),
          type: "jpg",
          mime: "image/jpeg",
          wUnits: "px",
          hUnits: "px",
        };

        if (sandbox.orientation && sandbox.orientation > 0)
          result.orientation = sandbox.orientation;

        parser.push(result);
        parser.push(null);
      });
      return;
    }

    parser._skipBytes(length, () => {
      getJpegSize(parser, sandbox);
    });
  });
}

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(2, (data: Buffer) => {
    if (data[0] !== 0xff || data[1] !== 0xd8) {
      // first marker of the file MUST be 0xFFD8
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    getJpegSize(parser, { start: true });
  });

  return parser;
}
