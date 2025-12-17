import { str2arr, sliceEq, readUInt16LE } from "../common";
import { ProbeResult } from "../../types";

const SIG_BM = str2arr("BM");

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (data.length < 26) return undefined;

  if (!sliceEq(data, 0, SIG_BM)) return undefined;

  return {
    width: readUInt16LE(data, 18),
    height: readUInt16LE(data, 22),
    type: "bmp",
    mime: "image/bmp",
    wUnits: "px",
    hUnits: "px",
  };
}
