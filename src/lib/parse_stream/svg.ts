import { Transform, TransformCallback } from "stream";
import { ProbeResult } from "../../types";

const STATE_IDENTIFY = 0; // look for '<'
const STATE_PARSE = 1; // extract width and height from svg tag
const STATE_IGNORE = 2; // we got all the data we want, skip the rest

// max size for pre-svg-tag comments plus svg tag itself
const MAX_DATA_LENGTH = 65536;

// skip `<?` (comments), `<!` (directives, cdata, doctype),
// looking for `<svg>` or `<NAMESPACE:svg>`
const SVG_HEADER_RE = /<[-_.:a-zA-Z0-9][^>]*>/;

// test if the top level element is svg + optional namespace,
// used to skip svg embedded in html
const SVG_TAG_RE = /^<([-_.:a-zA-Z0-9]+:)?svg\s/;

const SVG_WIDTH_RE = /[^-]\bwidth="([^%]+?)"|[^-]\bwidth='([^%]+?)'/;
const SVG_HEIGHT_RE = /\bheight="([^%]+?)"|\bheight='([^%]+?)'/;
const SVG_VIEWBOX_RE = /\bview[bB]ox="(.+?)"|\bview[bB]ox='(.+?)'/;
const SVG_UNITS_RE = /in$|mm$|cm$|pt$|pc$|px$|em$|ex$/;

function isWhiteSpace(chr: number): boolean {
  return chr === 0x20 || chr === 0x09 || chr === 0x0d || chr === 0x0a;
}

// Filter NaN, Infinity, < 0
function isFinitePositive(val: number): boolean {
  return typeof val === "number" && isFinite(val) && val > 0;
}

interface SvgAttrs {
  width: string | undefined;
  height: string | undefined;
  viewbox: string | undefined;
}

function svgAttrs(str: string): SvgAttrs {
  const width = str.match(SVG_WIDTH_RE);
  const height = str.match(SVG_HEIGHT_RE);
  const viewbox = str.match(SVG_VIEWBOX_RE);

  return {
    width: width ? width[1] || width[2] : undefined,
    height: height ? height[1] || height[2] : undefined,
    viewbox: viewbox ? viewbox[1] || viewbox[2] : undefined,
  };
}

function units(str: string): string {
  if (!SVG_UNITS_RE.test(str)) return "px";

  const match = str.match(SVG_UNITS_RE);
  return match ? match[0] : "px";
}

function parseSvg(str: string): ProbeResult | undefined {
  // get top level element
  const svgTag = (str.match(SVG_HEADER_RE) || [""])[0];

  // test if top level element is <svg>
  if (!SVG_TAG_RE.test(svgTag)) return undefined;

  const attrs = svgAttrs(svgTag);
  const width = parseFloat(attrs.width || "");
  const height = parseFloat(attrs.height || "");

  // Extract from direct values

  if (attrs.width && attrs.height) {
    if (!isFinitePositive(width) || !isFinitePositive(height)) return undefined;

    return {
      width: width,
      height: height,
      type: "svg",
      mime: "image/svg+xml",
      wUnits: units(attrs.width),
      hUnits: units(attrs.height),
    };
  }

  // Extract from viewbox

  const parts = (attrs.viewbox || "").split(" ");
  const viewbox = {
    width: parts[2],
    height: parts[3],
  };
  const vbWidth = parseFloat(viewbox.width);
  const vbHeight = parseFloat(viewbox.height);

  if (!isFinitePositive(vbWidth) || !isFinitePositive(vbHeight))
    return undefined;
  if (units(viewbox.width) !== units(viewbox.height)) return undefined;

  const ratio = vbWidth / vbHeight;

  if (attrs.width) {
    if (!isFinitePositive(width)) return undefined;

    return {
      width: width,
      height: width / ratio,
      type: "svg",
      mime: "image/svg+xml",
      wUnits: units(attrs.width),
      hUnits: units(attrs.width),
    };
  }

  if (attrs.height) {
    if (!isFinitePositive(height)) return undefined;

    return {
      width: height * ratio,
      height: height,
      type: "svg",
      mime: "image/svg+xml",
      wUnits: units(attrs.height),
      hUnits: units(attrs.height),
    };
  }

  return {
    width: vbWidth,
    height: vbHeight,
    type: "svg",
    mime: "image/svg+xml",
    wUnits: units(viewbox.width),
    hUnits: units(viewbox.height),
  };
}

export default function (): Transform {
  let state = STATE_IDENTIFY;
  let data_len = 0;
  let str = "";
  let buf: Buffer | null = null; // used to manage first chunk in IDENTIFY

  const transform = function (
    this: Transform,
    chunk: Buffer,
    encoding: BufferEncoding,
    next: TransformCallback
  ): void {
    switch (state) {
      // identify step is needed to fail fast if the file isn't SVG
      case STATE_IDENTIFY:
        if (buf) {
          // make sure that first chunk is at least 4 bytes (to do BOM skip later),
          // last chunk was small
          chunk = Buffer.concat([buf, chunk]);
          buf = null;
        }

        if (data_len === 0 && chunk.length < 4) {
          // make sure that first chunk is at least 4 bytes (to do BOM skip later),
          // current chunk is small
          buf = chunk;
          break;
        }

        {
          let i = 0;
          const max = chunk.length;

          // byte order mark, https://github.com/nodeca/probe-image-size/issues/57
          if (
            data_len === 0 &&
            chunk[0] === 0xef &&
            chunk[1] === 0xbb &&
            chunk[2] === 0xbf
          )
            i = 3;

          while (i < max && isWhiteSpace(chunk[i])) i++;

          if (i >= max) {
            data_len += chunk.length;

            if (data_len > MAX_DATA_LENGTH) {
              state = STATE_IGNORE;
              this.push(null);
            }
          } else if (chunk[i] === 0x3c /* < */) {
            state = STATE_PARSE;
            transform.call(this, chunk, encoding, next);
            return;
          } else {
            state = STATE_IGNORE;
            this.push(null);
          }
        }

        break;

      case STATE_PARSE:
        str += chunk.toString();

        {
          const result = parseSvg(str);

          if (result) {
            state = STATE_IGNORE;
            this.push(result);
            this.push(null);
            break;
          }

          data_len += chunk.length;

          if (data_len > MAX_DATA_LENGTH) {
            state = STATE_IGNORE;
            this.push(null);
          }
        }

        break;
    }

    next();
  };

  const parser = new Transform({
    readableObjectMode: true,
    transform: transform,

    flush: function (this: Transform): void {
      state = STATE_IGNORE;
      this.push(null);
    },
  });

  return parser;
}
