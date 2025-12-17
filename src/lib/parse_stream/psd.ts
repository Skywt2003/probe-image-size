import { ParserStream, str2arr, sliceEq } from "../common";

const SIG_8BPS = str2arr("8BPS\x00\x01");

export default function (): ParserStream {
  const parser = new ParserStream();

  parser._bytes(6, (data: Buffer) => {
    // signature + version
    if (!sliceEq(data, 0, SIG_8BPS)) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    parser._bytes(16, (data: Buffer) => {
      parser._skipBytes(Infinity);

      parser.push({
        width: data.readUInt32BE(12),
        height: data.readUInt32BE(8),
        type: "psd",
        mime: "image/vnd.adobe.photoshop",
        wUnits: "px",
        hUnits: "px",
      });

      parser.push(null);
    });
  });

  return parser;
}
