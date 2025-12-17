import { ParserStream } from "../common";

const HEADER = 0;
const TYPE_ICO = 1;
const INDEX_SIZE = 16;

// Format specification:
// https://en.wikipedia.org/wiki/ICO_(file_format)#Icon_resource_structure
export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(6, (data: Buffer) => {
    const header = data.readUInt16LE(0);
    const type = data.readUInt16LE(2);
    const numImages = data.readUInt16LE(4);

    if (header !== HEADER || type !== TYPE_ICO || !numImages) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    parser._bytes(numImages * INDEX_SIZE, (indexData: Buffer) => {
      parser._skipBytes(Infinity);

      const variants: Array<{ width: number; height: number }> = [];
      let maxSize = { width: 0, height: 0 };

      for (let i = 0; i < numImages; i++) {
        const width = indexData.readUInt8(INDEX_SIZE * i + 0) || 256;
        const height = indexData.readUInt8(INDEX_SIZE * i + 1) || 256;
        const size = { width, height };
        variants.push(size);

        if (width > maxSize.width || height > maxSize.height) {
          maxSize = size;
        }
      }

      parser.push({
        width: maxSize.width,
        height: maxSize.height,
        variants: variants,
        type: "ico",
        mime: "image/x-icon",
        wUnits: "px",
        hUnits: "px",
      });
      parser.push(null);
    });
  });

  return parser;
}
