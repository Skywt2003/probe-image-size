import { Transform, TransformOptions } from "stream";
import streamParser from "stream-parser";

export class ParserStream extends Transform {
  // Methods added by stream-parser mixin
  declare _bytes: (count: number, callback: (data: Buffer) => void) => void;
  declare _skipBytes: (count: number, callback?: () => void) => void;

  constructor() {
    const options: TransformOptions = { readableObjectMode: true };
    super(options);
  }
}

// Apply stream-parser mixin
streamParser(ParserStream.prototype);

export function sliceEq(
  src: Uint8Array | Buffer | number[],
  start: number,
  dest: number[]
): boolean {
  for (let i = start, j = 0; j < dest.length; ) {
    if (src[i++] !== dest[j++]) return false;
  }
  return true;
}

export function str2arr(str: string, format?: string): number[] {
  const arr: number[] = [];
  let i = 0;

  if (format && format === "hex") {
    while (i < str.length) {
      arr.push(parseInt(str.slice(i, i + 2), 16));
      i += 2;
    }
  } else {
    for (; i < str.length; i++) {
      arr.push(str.charCodeAt(i) & 0xff);
    }
  }

  return arr;
}

export function readUInt16LE(
  data: Uint8Array | Buffer | number[],
  offset: number
): number {
  return data[offset] | (data[offset + 1] << 8);
}

export function readUInt16BE(
  data: Uint8Array | Buffer | number[],
  offset: number
): number {
  return data[offset + 1] | (data[offset] << 8);
}

export function readUInt32LE(
  data: Uint8Array | Buffer | number[],
  offset: number
): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] * 0x1000000)
  );
}

export function readUInt32BE(
  data: Uint8Array | Buffer | number[],
  offset: number
): number {
  return (
    data[offset + 3] |
    (data[offset + 2] << 8) |
    (data[offset + 1] << 16) |
    (data[offset] * 0x1000000)
  );
}

export class ProbeError extends Error {
  code?: string;
  statusCode?: number;

  constructor(message: string, code?: string | null, statusCode?: number) {
    super(message);
    this.name = "ProbeError";

    // Include stack trace in error object
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    if (code) this.code = code;
    if (statusCode) this.statusCode = statusCode;
  }
}
