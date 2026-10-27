/**
 * Synthetic Anthropic thinking signatures for tests. Real session signatures are
 * never committed (plan D8); these follow the observed v4 shape:
 * outer `{1: 4, 2: envelope}`, envelope `{1: header, 2: ciphertext}`,
 * header `{1: 19, 3: 2, 7: 1, 8: kind}`.
 */

export function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

function lengthDelimited(field: number, payload: number[]): number[] {
  return [...varint(field * 8 + 2), ...varint(payload.length), ...payload];
}

export function headerBytes(kind: string | undefined): number[] {
  const fixed = [0x08, 19, 0x18, 0x02, 0x38, 0x01];
  return kind === undefined ? fixed : [...fixed, ...lengthDelimited(8, [...Buffer.from(kind)])];
}

export function signatureBytes(kind: string | undefined, ciphertextBytes = 32): number[] {
  const envelope = [
    ...lengthDelimited(1, headerBytes(kind)),
    ...lengthDelimited(2, new Array<number>(ciphertextBytes).fill(0xab)),
  ];
  return [0x08, 0x04, ...lengthDelimited(2, envelope)];
}

export function signature(kind: string | undefined, ciphertextBytes = 32): string {
  return Buffer.from(signatureBytes(kind, ciphertextBytes)).toString("base64");
}

export const narrationSignature = (ciphertextBytes = 32): string => signature("narration", ciphertextBytes);
export const thinkingSignature = (ciphertextBytes = 32): string => signature("thinking", ciphertextBytes);

/** Visible character with the SGR state active when it is printed. */
export interface StyledChar {
  ch: string;
  fg: string;
  italic: boolean;
  bold: boolean;
}

/** Replays SGR sequences over rendered lines and returns every visible character with its state. */
export function styledChars(lines: readonly string[]): StyledChar[][] {
  let fg = "default";
  let italic = false;
  let bold = false;
  const out: StyledChar[][] = [];
  for (const line of lines) {
    const chars: StyledChar[] = [];
    for (let i = 0; i < line.length; ) {
      if (line[i] === "\x1b") {
        const sgr = /^\x1b\[([0-9;]*)m/.exec(line.slice(i));
        if (sgr) {
          const params = sgr[1] === "" ? [0] : sgr[1]!.split(";").map(Number);
          for (let p = 0; p < params.length; p++) {
            const code = params[p]!;
            if (code === 0) [fg, italic, bold] = ["default", false, false];
            else if (code === 1) bold = true;
            else if (code === 22) bold = false;
            else if (code === 3) italic = true;
            else if (code === 23) italic = false;
            else if (code === 39) fg = "default";
            else if (code === 38 && params[p + 1] === 2) {
              fg = params.slice(p + 2, p + 5).join(";");
              p += 4;
            } else if (code === 38 && params[p + 1] === 5) {
              fg = `5;${params[p + 2]}`;
              p += 2;
            }
          }
          i += sgr[0].length;
          continue;
        }
        const other = /^\x1b(\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-9;?]*[A-Za-z]|_[^\x07]*\x07)/.exec(line.slice(i));
        i += other ? other[0].length : 1;
        continue;
      }
      chars.push({ ch: line[i]!, fg, italic, bold });
      i++;
    }
    out.push(chars);
  }
  return out;
}

export const COLORS = {
  text: "222;224;225",
  thinkingText: "150;160;164",
  accent: "167;152;215",
  code: "100;200;100",
  bullet: "90;90;90",
} as const;

const fgOpen = (rgb: string) => `\x1b[38;2;${rgb}m`;

/** chalk-like italic: re-opens italic after any inner close so nesting survives. */
export const chalkItalic = (s: string) => `\x1b[3m${s.replaceAll("\x1b[23m", "\x1b[23m\x1b[3m")}\x1b[23m`;
export const chalkBold = (s: string) => `\x1b[1m${s.replaceAll("\x1b[22m", "\x1b[22m\x1b[1m")}\x1b[22m`;

/** Minimal stand-in for pi's dark theme with chalk semantics for italic and bold. */
export function stubTheme(options: { italic?: boolean } = {}) {
  const italicOn = options.italic ?? true;
  const colors: Record<string, string> = { ...COLORS };
  return {
    fg: (key: string, text: string) => `${fgOpen(colors[key] ?? "1;1;1")}${text}\x1b[39m`,
    getFgAnsi: (key: string) => fgOpen(colors[key] ?? "1;1;1"),
    italic: (text: string) => (italicOn ? chalkItalic(text) : text),
    setColor(key: string, rgb: string) {
      colors[key] = rgb;
    },
  };
}

/** pi-tui MarkdownTheme stand-in. */
export const markdownTheme = {
  heading: (t: string) => t,
  link: (t: string) => t,
  linkUrl: (t: string) => t,
  code: (t: string) => `${fgOpen(COLORS.code)}${t}\x1b[39m`,
  codeBlock: (t: string) => t,
  codeBlockBorder: (t: string) => t,
  quote: (t: string) => t,
  quoteBorder: (t: string) => t,
  hr: (t: string) => t,
  listBullet: (t: string) => `${fgOpen(COLORS.bullet)}${t}\x1b[39m`,
  bold: chalkBold,
  italic: chalkItalic,
  strikethrough: (t: string) => t,
  underline: (t: string) => t,
};

/** Thinking default style, as pi's AssistantMessageComponent passes it. */
export const thinkingStyle = { color: (t: string) => `${fgOpen(COLORS.thinkingText)}${t}\x1b[39m`, italic: true };
