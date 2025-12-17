import { ExifEntry } from "../types";

function error(message: string, code: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function utf8_decode(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch (_) {
    return str;
  }
}

interface IFDEntry {
  id: number;
  offset: number;
}

export class ExifParser {
  private input: Uint8Array;
  private start: number;
  private big_endian: boolean;
  private aborted: boolean = false;
  private ifds_to_read: IFDEntry[] = [];

  constructor(jpeg_bin: Uint8Array, exif_start: number, exif_end: number) {
    this.input = jpeg_bin.subarray(exif_start, exif_end);
    this.start = exif_start;

    const sig = String.fromCharCode.apply(
      null,
      Array.from(this.input.subarray(0, 4))
    );

    if (sig !== "II\x2A\0" && sig !== "MM\0\x2A") {
      throw error("invalid TIFF signature", "EBADDATA");
    }

    this.big_endian = sig[0] === "M";
  }

  each(on_entry: (entry: ExifEntry) => boolean | void): void {
    this.aborted = false;

    const offset = this.read_uint32(4);

    this.ifds_to_read = [
      {
        id: 0,
        offset: offset,
      },
    ];

    while (this.ifds_to_read.length > 0 && !this.aborted) {
      const i = this.ifds_to_read.shift()!;
      if (!i.offset) continue;
      this.scan_ifd(i.id, i.offset, on_entry);
    }
  }

  private read_uint16(offset: number): number {
    const d = this.input;
    if (offset + 2 > d.length) throw error("unexpected EOF", "EBADDATA");

    return this.big_endian
      ? d[offset] * 0x100 + d[offset + 1]
      : d[offset] + d[offset + 1] * 0x100;
  }

  private read_uint32(offset: number): number {
    const d = this.input;
    if (offset + 4 > d.length) throw error("unexpected EOF", "EBADDATA");

    return this.big_endian
      ? d[offset] * 0x1000000 +
          d[offset + 1] * 0x10000 +
          d[offset + 2] * 0x100 +
          d[offset + 3]
      : d[offset] +
          d[offset + 1] * 0x100 +
          d[offset + 2] * 0x10000 +
          d[offset + 3] * 0x1000000;
  }

  private is_subifd_link(ifd: number, tag: number): boolean {
    return (
      (ifd === 0 && tag === 0x8769) || // SubIFD
      (ifd === 0 && tag === 0x8825) || // GPS Info
      (ifd === 0x8769 && tag === 0xa005)
    ); // Interop IFD
  }

  private exif_format_length(format: number): number {
    switch (format) {
      case 1: // byte
      case 2: // ascii
      case 6: // sbyte
      case 7: // undefined
        return 1;

      case 3: // short
      case 8: // sshort
        return 2;

      case 4: // long
      case 9: // slong
      case 11: // float
        return 4;

      case 5: // rational
      case 10: // srational
      case 12: // double
        return 8;

      default:
        return 0;
    }
  }

  private exif_format_read(format: number, offset: number): number | null {
    let v: number;

    switch (format) {
      case 1: // byte
      case 2: // ascii
        v = this.input[offset];
        return v;

      case 6: // sbyte
        v = this.input[offset];
        return v | ((v & 0x80) * 0x1fffffe);

      case 3: // short
        v = this.read_uint16(offset);
        return v;

      case 8: // sshort
        v = this.read_uint16(offset);
        return v | ((v & 0x8000) * 0x1fffe);

      case 4: // long
        v = this.read_uint32(offset);
        return v;

      case 9: // slong
        v = this.read_uint32(offset);
        return v | 0;

      case 5: // rational
      case 10: // srational
      case 11: // float
      case 12: // double
        return null; // not implemented

      case 7: // undefined
        return null; // blob

      default:
        return null;
    }
  }

  private scan_ifd(
    ifd_no: number,
    offset: number,
    on_entry: (entry: ExifEntry) => boolean | void
  ): void {
    const entry_count = this.read_uint16(offset);

    offset += 2;

    for (let i = 0; i < entry_count; i++) {
      const tag = this.read_uint16(offset);
      const format = this.read_uint16(offset + 2);
      const count = this.read_uint32(offset + 4);

      const comp_length = this.exif_format_length(format);
      const data_length = count * comp_length;
      const data_offset =
        data_length <= 4 ? offset + 8 : this.read_uint32(offset + 8);
      let is_subifd_link = false;

      if (data_offset + data_length > this.input.length) {
        throw error("unexpected EOF", "EBADDATA");
      }

      let value: number[] | string | null = [];
      let comp_offset = data_offset;

      for (let j = 0; j < count; j++, comp_offset += comp_length) {
        const item = this.exif_format_read(format, comp_offset);
        if (item === null) {
          value = null;
          break;
        }
        (value as number[]).push(item);
      }

      if (Array.isArray(value) && format === 2) {
        value = utf8_decode(String.fromCharCode.apply(null, value));
        if (value && value[value.length - 1] === "\0")
          value = value.slice(0, -1);
      }

      if (this.is_subifd_link(ifd_no, tag)) {
        if (
          Array.isArray(value) &&
          Number.isInteger(value[0]) &&
          value[0] > 0
        ) {
          this.ifds_to_read.push({
            id: tag,
            offset: value[0],
          });
          is_subifd_link = true;
        }
      }

      const entry: ExifEntry = {
        is_big_endian: this.big_endian,
        ifd: ifd_no,
        tag: tag,
        format: format,
        count: count,
        entry_offset: offset + this.start,
        data_length: data_length,
        data_offset: data_offset + this.start,
        value: value,
        is_subifd_link: is_subifd_link,
      };

      if (on_entry(entry) === false) {
        this.aborted = true;
        return;
      }

      offset += 12;
    }

    if (ifd_no === 0) {
      this.ifds_to_read.push({
        id: 1,
        offset: this.read_uint32(offset),
      });
    }
  }
}

/**
 * Returns orientation stored in Exif (1-8), 0 if none was found, -1 if error
 */
export function get_orientation(data: Uint8Array | Buffer): number {
  let orientation = 0;
  try {
    const dataArray = data instanceof Buffer ? new Uint8Array(data) : data;
    new ExifParser(dataArray, 0, dataArray.length).each((entry) => {
      if (
        entry.ifd === 0 &&
        entry.tag === 0x112 &&
        Array.isArray(entry.value)
      ) {
        orientation = entry.value[0];
        return false;
      }
      return;
    });
    return orientation;
  } catch (_err) {
    return -1;
  }
}
