import { Transform } from "stream";

/**
 * Image size information result
 */
export interface ProbeResult {
  width: number;
  height: number;
  type: string;
  mime: string;
  wUnits: string;
  hUnits: string;
  orientation?: number;
  variants?: Array<{ width: number; height: number }>;
  length?: number;
  url?: string;
}

/**
 * HTTP request options
 */
export interface ProbeOptions {
  open_timeout?: number;
  response_timeout?: number;
  read_timeout?: number;
  follow_max?: number;
  retries?: number;
  parse_response?: boolean;
  rejectUnauthorized?: boolean;
  headers?: Record<string, string>;
}

/**
 * Parser stream factory type
 */
export type ParserStreamFactory = () => Transform;

/**
 * Sync parser function type
 */
export type SyncParser = (
  data: Uint8Array | Buffer
) => ProbeResult | null | undefined;

/**
 * Collection of stream parsers
 */
export interface StreamParsers {
  [key: string]: ParserStreamFactory;
}

/**
 * Collection of sync parsers
 */
export interface SyncParsers {
  [key: string]: SyncParser;
}

/**
 * Exif entry structure
 */
export interface ExifEntry {
  is_big_endian: boolean;
  ifd: number;
  tag: number;
  format: number;
  count: number;
  entry_offset: number;
  data_length: number;
  data_offset: number;
  value: number[] | string | null;
  is_subifd_link: boolean;
}

/**
 * MIAF file type information
 */
export interface MiafFileType {
  type: string;
  mime: string;
}

/**
 * MIAF image size information
 */
export interface MiafSizeInfo {
  width: number;
  height: number;
  orientation: number | null;
  variants: Array<{ width: number; height: number }>;
  exif_location: { length: number; offset: number } | null;
}

/**
 * MIAF box structure
 */
export interface MiafBox {
  boxtype: string;
  data: Uint8Array;
  end: number;
}
