import { ParserStream, str2arr, sliceEq } from "../common";
import * as exif from "../exif_utils";
import { ProbeResult } from "../../types";

const SIG_RIFF = str2arr("RIFF");
const SIG_WEBP = str2arr("WEBP");

interface WebpSandbox {
  fileLength: number;
  offset: number;
  exif_orientation: number;
  bufferedChunkHeader: string;
  result?: ProbeResult;
}

function safeSkip(
  parser: ParserStream,
  count: number,
  callback: () => void
): void {
  if (count === 0) {
    // parser._skipBytes throws error if count === 0
    callback();
    return;
  }

  parser._skipBytes(count, callback);
}

function parseVP8(
  parser: ParserStream,
  length: number,
  sandbox: WebpSandbox
): void {
  parser._bytes(10, (data: Buffer) => {
    // check code block signature
    if (data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) {
      sandbox.result = sandbox.result || {
        width: data.readUInt16LE(6) & 0x3fff,
        height: data.readUInt16LE(8) & 0x3fff,
        type: "webp",
        mime: "image/webp",
        wUnits: "px",
        hUnits: "px",
      };
    }

    safeSkip(parser, length - 10, () => {
      sandbox.offset += length;
      getWebpSize(parser, sandbox);
    });
  });
}

function parseVP8L(
  parser: ParserStream,
  length: number,
  sandbox: WebpSandbox
): void {
  parser._bytes(5, (data: Buffer) => {
    // check code block signature
    if (data[0] === 0x2f) {
      const bits = data.readUInt32LE(1);

      sandbox.result = sandbox.result || {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        type: "webp",
        mime: "image/webp",
        wUnits: "px",
        hUnits: "px",
      };
    }

    safeSkip(parser, length - 5, () => {
      sandbox.offset += length;
      getWebpSize(parser, sandbox);
    });
  });
}

function parseVP8X(
  parser: ParserStream,
  length: number,
  sandbox: WebpSandbox
): void {
  parser._bytes(10, (data: Buffer) => {
    sandbox.result = sandbox.result || {
      width: ((data[6] << 16) | (data[5] << 8) | data[4]) + 1,
      height: ((data[9] << 16) | (data[8] << 8) | data[7]) + 1,
      type: "webp",
      mime: "image/webp",
      wUnits: "px",
      hUnits: "px",
    };

    safeSkip(parser, length - 10, () => {
      sandbox.offset += length;
      getWebpSize(parser, sandbox);
    });
  });
}

function parseExif(
  parser: ParserStream,
  length: number,
  sandbox: WebpSandbox
): void {
  parser._bytes(length, (data: Buffer) => {
    // exif is the last chunk we care about, stop after it
    sandbox.offset = Infinity;
    sandbox.exif_orientation = exif.get_orientation(data);

    getWebpSize(parser, sandbox);
  });
}

function getWebpSize(parser: ParserStream, sandbox: WebpSandbox): void {
  if (sandbox.fileLength - 8 <= sandbox.offset) {
    parser._skipBytes(Infinity);

    if (sandbox.result) {
      const result = sandbox.result;

      if (sandbox.exif_orientation > 0) {
        result.orientation = sandbox.exif_orientation;
      }

      parser.push(result);
    }

    parser.push(null);
    return;
  }

  parser._bytes(4 - sandbox.bufferedChunkHeader.length, (data: Buffer) => {
    sandbox.offset += 4 - sandbox.bufferedChunkHeader.length;
    let header =
      sandbox.bufferedChunkHeader +
      String.fromCharCode.apply(null, Array.from(data));

    // after each chunk of odd size there should be 0 byte of padding, skip those
    header = header.replace(/^\0+/, "");

    if (header.length < 4) {
      sandbox.bufferedChunkHeader = header;
      getWebpSize(parser, sandbox);
      return;
    }

    sandbox.bufferedChunkHeader = "";

    parser._bytes(4, (data: Buffer) => {
      sandbox.offset += 4;
      const length = data.readUInt32LE(0);

      if (header === "VP8 " && length >= 10) {
        parseVP8(parser, length, sandbox);
      } else if (header === "VP8L" && length >= 5) {
        parseVP8L(parser, length, sandbox);
      } else if (header === "VP8X" && length >= 10) {
        parseVP8X(parser, length, sandbox);
      } else if (header === "EXIF" && length >= 4) {
        parseExif(parser, length, sandbox);
      } else {
        safeSkip(parser, length, () => {
          sandbox.offset += length;
          getWebpSize(parser, sandbox);
        });
      }
    });
  });
}

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(12, (data: Buffer) => {
    // check /^RIFF....WEBPVP8([ LX])$/ signature
    if (sliceEq(data, 0, SIG_RIFF) && sliceEq(data, 8, SIG_WEBP)) {
      getWebpSize(parser, {
        fileLength: data.readUInt32LE(4) + 8,
        offset: 12,
        exif_orientation: 0,
        bufferedChunkHeader: "", // for dealing with padding
      });
    } else {
      parser._skipBytes(Infinity);
      parser.push(null);
    }
  });

  return parser;
}
