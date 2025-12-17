import { ParserStream, str2arr, sliceEq } from "../common";

const SIG_BM = str2arr("BM");

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(26, (data: Buffer) => {
    parser._skipBytes(Infinity);

    if (!sliceEq(data, 0, SIG_BM)) {
      parser.push(null);
      return;
    }

    parser.push({
      width: data.readUInt16LE(18),
      height: data.readUInt16LE(22),
      type: "bmp",
      mime: "image/bmp",
      wUnits: "px",
      hUnits: "px",
    });

    parser.push(null);
  });

  return parser;
}
