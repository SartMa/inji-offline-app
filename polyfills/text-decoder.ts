const globalScope = globalThis as typeof globalThis & {
  TextDecoder?: typeof TextDecoder;
  __utf16DecoderPatched?: boolean;
};

const NativeTextDecoder = globalScope.TextDecoder;

function supportsUtf16le(decoderCtor: typeof TextDecoder | undefined): boolean {
  if (typeof decoderCtor !== 'function') {
    return false;
  }
  try {
    // Attempt to construct with utf-16le; will throw if unsupported.
    const decoder = new decoderCtor('utf-16le');
    return typeof decoder.decode === 'function';
  } catch {
    return false;
  }
}

if (!globalScope.__utf16DecoderPatched && typeof NativeTextDecoder === 'function' && !supportsUtf16le(NativeTextDecoder)) {
  const normalize = (label: string) => label.toLowerCase().replace(/[_\s-]/g, '');

  const toUint8Array = (input: BufferSource): Uint8Array => {
    if (input instanceof Uint8Array) {
      return input;
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new TypeError('Unsupported input type for TextDecoder');
  };

  class Utf16CapableTextDecoder implements TextDecoder {
    private readonly fallbackDecoder: TextDecoder | null;
    private readonly label: string;

    readonly fatal: boolean;
    readonly ignoreBOM: boolean;

    constructor(label: string = 'utf-8', options?: TextDecoderOptions) {
      const normalized = normalize(label);
      if (normalized === 'utf16' || normalized === 'utf16le') {
        this.label = 'utf-16le';
        this.fallbackDecoder = null;
        this.fatal = options?.fatal ?? false;
        this.ignoreBOM = options?.ignoreBOM ?? false;
      } else {
        const decoder = new NativeTextDecoder(label, options);
        this.label = decoder.encoding;
        this.fallbackDecoder = decoder;
        this.fatal = decoder.fatal;
        this.ignoreBOM = decoder.ignoreBOM;
      }
    }

    decode(input?: BufferSource, options?: TextDecodeOptions): string {
      if (this.fallbackDecoder) {
        return this.fallbackDecoder.decode(input, options);
      }

      if (input == null) {
        return '';
      }

      const bytes = toUint8Array(input);
      const startOffset = this.ignoreBOM && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
      const length = bytes.length - (bytes.length % 2);

      let result = '';
      for (let i = startOffset; i < length; i += 2) {
        const codeUnit = bytes[i] | ((bytes[i + 1] ?? 0) << 8);
        result += String.fromCharCode(codeUnit);
      }
      return result;
    }

    get encoding(): string {
      return this.fallbackDecoder ? this.fallbackDecoder.encoding : this.label;
    }
  }

  globalScope.TextDecoder = Utf16CapableTextDecoder as unknown as typeof TextDecoder;
  globalScope.__utf16DecoderPatched = true;
}
