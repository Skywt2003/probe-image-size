import { ProbeResult } from "../../types";

function isWhiteSpace(chr: number): boolean {
  return chr === 0x20 || chr === 0x09 || chr === 0x0d || chr === 0x0a;
}

// Filter NaN, Infinity, < 0
function isFinitePositive(val: number): boolean {
  return typeof val === "number" && isFinite(val) && val > 0;
}

function canBeSvg(buf: Uint8Array | Buffer | number[]): boolean {
  let i = 0;
  const max = buf.length;

  // byte order mark, https://github.com/nodeca/probe-image-size/issues/57
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) i = 3;

  while (i < max && isWhiteSpace(buf[i])) i++;

  if (i === max) return false;
  return buf[i] === 0x3c; /* < */
}

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

export default function (
  data: Uint8Array | Buffer | number[]
): ProbeResult | undefined {
  if (!canBeSvg(data)) return undefined;

  let str = "";

  for (let i = 0; i < data.length; i++) {
    // 1. We can't rely on buffer features
    // 2. Don't care about UTF16 because ascii is enough for our goals
    str += String.fromCharCode(data[i]);
  }

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
