// Utils used to parse miaf-based files (avif/heic/heif)
//
//  - image collections are not supported (only last size is reported)
//  - images with metadata encoded after image data are not supported
//  - images without any `ispe` box are not supported

import { str2arr, sliceEq, readUInt32BE } from "../common";
import * as miaf from "../miaf_utils";
import * as exif from "../exif_utils";
import { ProbeResult } from "../../types";

const SIG_FTYP = str2arr("ftyp");

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  // ISO media file (avif format) starts with ftyp box:
  // 0000 0020 6674 7970 6176 6966
  //  (length)  f t  y p  a v  i f

  if (!sliceEq(data, 4, SIG_FTYP)) return undefined;

  const firstBox = miaf.unbox(data, 0);
  if (!firstBox) return undefined;

  const fileType = miaf.getMimeType(firstBox.data);
  if (!fileType) return undefined;

  let meta: Uint8Array | undefined;
  let offset = firstBox.end;

  for (;;) {
    const box = miaf.unbox(data, offset);
    if (!box) break;
    offset = box.end;

    // mdat block SHOULD be last (but not strictly required),
    // so it's unlikely that metadata is after it
    if (box.boxtype === "mdat") return undefined;
    if (box.boxtype === "meta") {
      meta = box.data;
      break;
    }
  }

  if (!meta) return undefined;

  const imgSize = miaf.readSizeFromMeta(meta);

  if (!imgSize) return undefined;

  const result: ProbeResult = {
    width: imgSize.width,
    height: imgSize.height,
    type: fileType.type,
    mime: fileType.mime,
    wUnits: "px",
    hUnits: "px",
  };

  if (imgSize.variants.length > 1) {
    result.variants = imgSize.variants;
  }

  if (imgSize.orientation) {
    result.orientation = imgSize.orientation;
  }

  if (
    imgSize.exif_location &&
    imgSize.exif_location.offset + imgSize.exif_location.length <= data.length
  ) {
    const sig_offset = readUInt32BE(data, imgSize.exif_location.offset);
    const exif_data =
      data instanceof Buffer
        ? data.subarray(
            imgSize.exif_location.offset + sig_offset + 4,
            imgSize.exif_location.offset + imgSize.exif_location.length
          )
        : data instanceof Uint8Array
        ? data.subarray(
            imgSize.exif_location.offset + sig_offset + 4,
            imgSize.exif_location.offset + imgSize.exif_location.length
          )
        : new Uint8Array(
            data.slice(
              imgSize.exif_location.offset + sig_offset + 4,
              imgSize.exif_location.offset + imgSize.exif_location.length
            )
          );

    const orientation = exif.get_orientation(exif_data);

    if (orientation > 0) result.orientation = orientation;
  }

  return result;
}
