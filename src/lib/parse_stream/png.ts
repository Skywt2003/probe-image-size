import { ParserStream, str2arr, sliceEq } from "../common";

const SIG_PNG = str2arr("\x89PNG\r\n\x1a\n");
const SIG_IHDR = str2arr("IHDR");

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(24, (data: Buffer) => {
    parser._skipBytes(Infinity);

    // check PNG signature
    if (!sliceEq(data, 0, SIG_PNG)) {
      parser.push(null);
      return;
    }

    // check that first chunk is IHDR
    if (!sliceEq(data, 12, SIG_IHDR)) {
      parser.push(null);
      return;
    }

    parser.push({
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      type: "png",
      mime: "image/png",
      wUnits: "px",
      hUnits: "px",
    });

    parser.push(null);
  });

  return parser;
}
