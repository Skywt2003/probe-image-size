import { str2arr, sliceEq, readUInt16LE } from "../common";
import { ProbeResult } from "../../types";

const SIG_GIF87a = str2arr("GIF87a");
const SIG_GIF89a = str2arr("GIF89a");

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (data.length < 10) return undefined;

  if (!sliceEq(data, 0, SIG_GIF87a) && !sliceEq(data, 0, SIG_GIF89a))
    return undefined;

  return {
    width: readUInt16LE(data, 6),
    height: readUInt16LE(data, 8),
    type: "gif",
    mime: "image/gif",
    wUnits: "px",
    hUnits: "px",
  };
}
