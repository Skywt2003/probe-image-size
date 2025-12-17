import { readUInt16BE, str2arr, sliceEq } from "../common";
import * as exif from "../exif_utils";
import { ProbeResult } from "../../types";

const SIG_EXIF = str2arr("Exif\0\0");

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (data.length < 2) return undefined;

  // first marker of the file MUST be 0xFFD8,
  // following by either 0xFFE0, 0xFFE2 or 0xFFE3
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff)
    return undefined;

  let offset = 2;
  let orientation: number | undefined;

  for (;;) {
    // skip until we see 0xFF, see https://github.com/nodeca/probe-image-size/issues/68
    for (;;) {
      if (data.length - offset < 2) return undefined;
      if (data[offset++] === 0xff) break;
    }

    let code = data[offset++];
    let length: number;

    // skip padding bytes
    while (code === 0xff) code = data[offset++];

    // standalone markers, according to JPEG 1992,
    // http://www.w3.org/Graphics/JPEG/itu-t81.pdf, see Table B.1
    if ((0xd0 <= code && code <= 0xd9) || code === 0x01) {
      length = 0;
    } else if (0xc0 <= code && code <= 0xfe) {
      // the rest of the unreserved markers
      if (data.length - offset < 2) return undefined;

      length = readUInt16BE(data, offset) - 2;
      offset += 2;
    } else {
      // unknown markers
      return undefined;
    }

    if (code === 0xd9 /* EOI */ || code === 0xda /* SOS */) {
      // end of the datastream
      return undefined;
    }

    // try to get orientation from Exif segment
    if (code === 0xe1 && length >= 10 && sliceEq(data, offset, SIG_EXIF)) {
      const exifData =
        data instanceof Buffer
          ? data.subarray(offset + 6, offset + length)
          : data instanceof Uint8Array
          ? data.subarray(offset + 6, offset + length)
          : new Uint8Array(data.slice(offset + 6, offset + length));
      const orient = exif.get_orientation(exifData);
      if (orient > 0) orientation = orient;
    }

    if (
      length >= 5 &&
      0xc0 <= code &&
      code <= 0xcf &&
      code !== 0xc4 &&
      code !== 0xc8 &&
      code !== 0xcc
    ) {
      if (data.length - offset < length) return undefined;

      const result: ProbeResult = {
        width: readUInt16BE(data, offset + 3),
        height: readUInt16BE(data, offset + 1),
        type: "jpg",
        mime: "image/jpeg",
        wUnits: "px",
        hUnits: "px",
      };

      if (orientation) {
        result.orientation = orientation;
      }

      return result;
    }

    offset += length;
  }
}
