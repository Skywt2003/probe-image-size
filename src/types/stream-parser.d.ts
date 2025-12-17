declare module "stream-parser" {
  interface StreamParserPrototype {
    _bytes(count: number, callback: (data: Buffer) => void): void;
    _skipBytes(count: number, callback?: () => void): void;
  }

  function streamParser(prototype: object): void;
  export = streamParser;
}
