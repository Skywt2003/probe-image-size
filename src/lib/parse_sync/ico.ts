import { readUInt16LE } from "../common";
import { ProbeResult } from "../../types";

const HEADER = 0;
const TYPE_ICO = 1;
const INDEX_SIZE = 16;

// Format specification:
// https://en.wikipedia.org/wiki/ICO_(file_format)#Icon_resource_structure
export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  const header = readUInt16LE(data, 0);
  const type = readUInt16LE(data, 2);
  const numImages = readUInt16LE(data, 4);

  if (header !== HEADER || type !== TYPE_ICO || !numImages) {
    return undefined;
  }

  const variants: Array<{ width: number; height: number }> = [];
  let maxSize = { width: 0, height: 0 };

  for (let i = 0; i < numImages; i++) {
    const width = data[6 + INDEX_SIZE * i] || 256;
    const height = data[6 + INDEX_SIZE * i + 1] || 256;
    const size = { width, height };
    variants.push(size);

    if (width > maxSize.width || height > maxSize.height) {
      maxSize = size;
    }
  }

  return {
    width: maxSize.width,
    height: maxSize.height,
    variants: variants,
    type: "ico",
    mime: "image/x-icon",
    wUnits: "px",
    hUnits: "px",
  };
}
