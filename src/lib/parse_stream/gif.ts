import { ParserStream, str2arr, sliceEq } from "../common";

const SIG_GIF87a = str2arr("GIF87a");
const SIG_GIF89a = str2arr("GIF89a");

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(10, (data: Buffer) => {
    parser._skipBytes(Infinity);

    if (!sliceEq(data, 0, SIG_GIF87a) && !sliceEq(data, 0, SIG_GIF89a)) {
      parser.push(null);
      return;
    }

    parser.push({
      width: data.readUInt16LE(6),
      height: data.readUInt16LE(8),
      type: "gif",
      mime: "image/gif",
      wUnits: "px",
      hUnits: "px",
    });

    parser.push(null);
  });

  return parser;
}
