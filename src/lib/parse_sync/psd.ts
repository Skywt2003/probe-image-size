import { str2arr, sliceEq, readUInt32BE } from "../common";
import { ProbeResult } from "../../types";

const SIG_8BPS = str2arr("8BPS\x00\x01");

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (data.length < 6 + 16) return undefined;

  // signature + version
  if (!sliceEq(data, 0, SIG_8BPS)) return undefined;

  return {
    width: readUInt32BE(data, 6 + 12),
    height: readUInt32BE(data, 6 + 8),
    type: "psd",
    mime: "image/vnd.adobe.photoshop",
    wUnits: "px",
    hUnits: "px",
  };
}
