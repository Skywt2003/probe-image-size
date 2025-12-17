import { str2arr, sliceEq, readUInt16LE, readUInt32LE } from "../common";
import * as exif from "../exif_utils";
import { ProbeResult } from "../../types";

const SIG_RIFF = str2arr("RIFF");
const SIG_WEBP = str2arr("WEBP");

function parseVP8(
  data: Uint8Array | Buffer | number[],
  offset: number
): ProbeResult | undefined {
  if (
    data[offset + 3] !== 0x9d ||
    data[offset + 4] !== 0x01 ||
    data[offset + 5] !== 0x2a
  ) {
    // bad code block signature
    return undefined;
  }

  return {
    width: readUInt16LE(data, offset + 6) & 0x3fff,
    height: readUInt16LE(data, offset + 8) & 0x3fff,
    type: "webp",
    mime: "image/webp",
    wUnits: "px",
    hUnits: "px",
  };
}

function parseVP8L(
  data: Uint8Array | Buffer | number[],
  offset: number
): ProbeResult | undefined {
  if (data[offset] !== 0x2f) return undefined;

  const bits = readUInt32LE(data, offset + 1);

  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >> 14) & 0x3fff) + 1,
    type: "webp",
    mime: "image/webp",
    wUnits: "px",
    hUnits: "px",
  };
}

function parseVP8X(
  data: Uint8Array | Buffer | number[],
  offset: number
): ProbeResult {
  return {
    width:
      ((data[offset + 6] << 16) | (data[offset + 5] << 8) | data[offset + 4]) +
      1,
    height:
      ((data[offset + 9] << offset) |
        (data[offset + 8] << 8) |
        data[offset + 7]) +
      1,
    type: "webp",
    mime: "image/webp",
    wUnits: "px",
    hUnits: "px",
  };
}

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (data.length < 16) return undefined;

  // check /^RIFF....WEBPVP8([ LX])$/ signature
  if (!sliceEq(data, 0, SIG_RIFF) && !sliceEq(data, 8, SIG_WEBP))
    return undefined;

  let offset = 12;
  let result: ProbeResult | undefined = undefined;
  let exif_orientation = 0;
  const fileLength = readUInt32LE(data, 4) + 8;

  if (fileLength > data.length) return undefined;

  while (offset + 8 < fileLength) {
    if (data[offset] === 0) {
      // after each chunk of odd size there should be 0 byte of padding, skip those
      offset++;
      continue;
    }

    const header = String.fromCharCode.apply(
      null,
      Array.from(data).slice(offset, offset + 4)
    );
    const length = readUInt32LE(data, offset + 4);

    if (header === "VP8 " && length >= 10) {
      result = result || parseVP8(data, offset + 8);
    } else if (header === "VP8L" && length >= 9) {
      result = result || parseVP8L(data, offset + 8);
    } else if (header === "VP8X" && length >= 10) {
      result = result || parseVP8X(data, offset + 8);
    } else if (header === "EXIF") {
      const exifData =
        data instanceof Buffer
          ? data.subarray(offset + 8, offset + 8 + length)
          : data instanceof Uint8Array
          ? data.subarray(offset + 8, offset + 8 + length)
          : new Uint8Array(data.slice(offset + 8, offset + 8 + length));
      exif_orientation = exif.get_orientation(exifData);

      // exif is the last chunk we care about, stop after it
      offset = Infinity;
    }

    offset += 8 + length;
  }

  if (!result) return undefined;

  if (exif_orientation > 0) {
    result.orientation = exif_orientation;
  }

  return result;
}
