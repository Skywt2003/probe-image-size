import { ParserStream, str2arr, sliceEq } from "../common";

const SIG_1 = str2arr("II\x2A\0");
const SIG_2 = str2arr("MM\0\x2A");

function readUInt16(
  buffer: Buffer,
  offset: number,
  is_big_endian: boolean
): number {
  return is_big_endian
    ? buffer.readUInt16BE(offset)
    : buffer.readUInt16LE(offset);
}

function readUInt32(
  buffer: Buffer,
  offset: number,
  is_big_endian: boolean
): number {
  return is_big_endian
    ? buffer.readUInt32BE(offset)
    : buffer.readUInt32LE(offset);
}

function readIFDValue(
  data: Buffer,
  data_offset: number,
  is_big_endian: boolean
): number | null {
  const type = readUInt16(data, data_offset + 2, is_big_endian);
  const values = readUInt32(data, data_offset + 4, is_big_endian);

  if (values !== 1 || (type !== 3 && type !== 4)) {
    return null;
  }

  if (type === 3) {
    return readUInt16(data, data_offset + 8, is_big_endian);
  }

  return readUInt32(data, data_offset + 8, is_big_endian);
}

export default function (): ParserStream {
  const parser = new ParserStream();

  // read header
  parser._bytes(8, (data: Buffer) => {
    // check TIFF signature
    if (!sliceEq(data, 0, SIG_1) && !sliceEq(data, 0, SIG_2)) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    const is_big_endian = data[0] === 77 /* 'MM' */;
    const count = readUInt32(data, 4, is_big_endian) - 8;

    if (count < 0) {
      parser._skipBytes(Infinity);
      parser.push(null);
      return;
    }

    function safeSkip(
      parser: ParserStream,
      count: number,
      callback: () => void
    ): void {
      if (count === 0) {
        // parser._skipBytes throws error if count === 0
        callback();
        return;
      }

      parser._skipBytes(count, callback);
    }

    // skip until IFD
    safeSkip(parser, count, () => {
      // read number of IFD entries
      parser._bytes(2, (data: Buffer) => {
        const ifd_size = readUInt16(data, 0, is_big_endian) * 12;

        if (ifd_size <= 0) {
          parser._skipBytes(Infinity);
          parser.push(null);
          return;
        }

        // read all IFD entries
        parser._bytes(ifd_size, (data: Buffer) => {
          parser._skipBytes(Infinity);

          let width: number | null = null;
          let height: number | null = null;

          for (let i = 0; i < ifd_size; i += 12) {
            const tag = readUInt16(data, i, is_big_endian);

            if (tag === 256) {
              width = readIFDValue(data, i, is_big_endian);
            } else if (tag === 257) {
              height = readIFDValue(data, i, is_big_endian);
            }
          }

          if (width && height) {
            parser.push({
              width: width,
              height: height,
              type: "tiff",
              mime: "image/tiff",
              wUnits: "px",
              hUnits: "px",
            });
          }

          parser.push(null);
        });
      });
    });
  });

  return parser;
}
