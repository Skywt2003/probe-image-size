// Utils used to parse miaf-based files (avif/heic/heif)
//
//  - image collections are not supported (only last size is reported)
//  - images with metadata encoded after image data are not supported
//  - images without any `ispe` box are not supported

import { ParserStream, str2arr, sliceEq, readUInt32BE } from "../common";
import * as miaf from "../miaf_utils";
import * as exif from "../exif_utils";
import { ProbeResult, MiafFileType } from "../../types";

const SIG_FTYP = str2arr("ftyp");

interface AvifSandbox {
  offset: number;
  fileType: MiafFileType | null;
  exif_location?: { length: number; offset: number } | null;
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

function readExifOrientation(
  parser: ParserStream,
  sandbox: AvifSandbox,
  callback: (orientation: number) => void
): void {
  if (
    !sandbox.exif_location ||
    sandbox.exif_location.offset <= sandbox.offset
  ) {
    callback(0);
    return;
  }

  parser._skipBytes(sandbox.exif_location.offset - sandbox.offset, () => {
    sandbox.offset = sandbox.exif_location!.offset;

    parser._bytes(4, (data: Buffer) => {
      sandbox.offset += 4;
      const sig_offset = readUInt32BE(data, 0);

      safeSkip(parser, sig_offset, () => {
        sandbox.offset += sig_offset;
        const byteCount = sandbox.exif_location!.length - sig_offset - 4;

        if (byteCount <= 0) {
          callback(0);
          return;
        }

        parser._bytes(byteCount, (exif_data: Buffer) => {
          sandbox.offset += byteCount;
          callback(exif.get_orientation(exif_data));
        });
      });
    });
  });
}

// sandbox is a storage for intermediate data retrieved from avif while parsing it
function readAvifSize(parser: ParserStream, sandbox: AvifSandbox): void {
  parser._bytes(8, (data: Buffer) => {
    sandbox.offset += 8;
    const size = readUInt32BE(data, 0) - 8;
    const type = String.fromCharCode.apply(
      null,
      Array.from(data.subarray(4, 8))
    );

    if (type === "mdat") {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    } else if (size < 0) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    } else if (type === "meta" && size > 0) {
      parser._bytes(size, (data: Buffer) => {
        sandbox.offset += size;
        const imgSize = miaf.readSizeFromMeta(data);

        if (!imgSize) {
          parser._skipBytes(Infinity);
          parser.push(null);
          return;
        }

        const result: ProbeResult = {
          width: imgSize.width,
          height: imgSize.height,
          type: sandbox.fileType!.type,
          mime: sandbox.fileType!.mime,
          wUnits: "px",
          hUnits: "px",
        };

        if (imgSize.variants.length > 1) {
          result.variants = imgSize.variants;
        }

        if (imgSize.orientation) {
          result.orientation = imgSize.orientation;
        }

        sandbox.exif_location = imgSize.exif_location;

        readExifOrientation(parser, sandbox, (orientation: number) => {
          if (orientation > 0) result.orientation = orientation;

          parser._skipBytes(Infinity);
          parser.push(result);
          parser.push(null);
        });
      });
    } else {
      safeSkip(parser, size, () => {
        sandbox.offset += size;
        readAvifSize(parser, sandbox);
      });
    }
  });
}

export default function (): ParserStream {
  const parser = new ParserStream();
  const sandbox: AvifSandbox = { offset: 0, fileType: null };

  parser._bytes(8, (data: Buffer) => {
    sandbox.offset += 8;
    if (!sliceEq(data, 4, SIG_FTYP)) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    const size = readUInt32BE(data, 0) - 8;

    if (size <= 0) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    parser._bytes(size, (data: Buffer) => {
      sandbox.offset += size;
      sandbox.fileType = miaf.getMimeType(data) || null;

      if (!sandbox.fileType) {
        parser._skipBytes(Infinity);
        parser.push(null);
        return;
      }

      readAvifSize(parser, sandbox);
    });
  });

  return parser;
}
