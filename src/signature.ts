/**
 * Detects Anthropic "narration" thinking blocks from their signature.
 *
 * Detection approach and field layout ported from can1357/oh-my-pi commit 50ec66f
 * (`packages/ai/src/providers/anthropic-signature.ts`), used under the MIT License:
 *   Copyright (c) 2025 Mario Zechner
 *   Copyright (c) 2025-2026 Can Bölük
 *   Copyright (c) 2026 Stencil Labs, Inc.
 * See README "Attribution" and the MIT permission notice in LICENSE.
 *
 * A signature is a base64 protobuf: outer `{1: version, 2: envelope}`, envelope
 * `{1: header, 2..5: nonce/ciphertext/tag}`, header `{..., 8: kind, ...}`.
 * Header field 8 names the block kind: `thinking` for reasoning, `narration` for
 * user-facing prose the API returns as a thinking block when the model writes it
 * between tool calls. Only an exact `narration` kind matches; anything else,
 * including any malformed input, is reasoning.
 */

const OUTER_ENVELOPE_FIELD = 2;
const ENVELOPE_HEADER_FIELD = 1;
const HEADER_KIND_FIELD = 8;
const NARRATION_KIND = new TextEncoder().encode("narration");
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;
const UINT32_LIMIT = 2 ** 32;

/** Reads a varint at `offset`, rejecting values that exceed uint32 or run past the buffer. */
function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } | undefined {
  let value = 0;
  let multiplier = 1;
  for (let i = offset; i < bytes.length && i < offset + 10; i++) {
    const byte = bytes[i]!;
    value += (byte & 0x7f) * multiplier;
    if (value >= UINT32_LIMIT) return undefined;
    if ((byte & 0x80) === 0) return { value, next: i + 1 };
    multiplier *= 128;
  }
  return undefined;
}

/**
 * Returns the first length-delimited field numbered `field` in a protobuf message,
 * or undefined when it is absent or the message is malformed before it is found.
 */
export function lengthDelimitedField(message: Uint8Array, field: number): Uint8Array | undefined {
  let offset = 0;
  while (offset < message.length) {
    const tag = readVarint(message, offset);
    if (!tag) return undefined;
    offset = tag.next;
    const fieldNumber = Math.floor(tag.value / 8);
    const wireType = tag.value % 8;
    if (fieldNumber === 0) return undefined;
    switch (wireType) {
      case WIRE_VARINT: {
        const skipped = readVarint(message, offset);
        if (!skipped) return undefined;
        offset = skipped.next;
        break;
      }
      case WIRE_FIXED64:
        offset += 8;
        break;
      case WIRE_FIXED32:
        offset += 4;
        break;
      case WIRE_LENGTH_DELIMITED: {
        const length = readVarint(message, offset);
        if (!length) return undefined;
        const start = length.next;
        const end = start + length.value;
        if (end > message.length) return undefined;
        if (fieldNumber === field) return message.subarray(start, end);
        offset = end;
        break;
      }
      default:
        return undefined;
    }
    if (offset > message.length) return undefined;
  }
  return undefined;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Whether an Anthropic thinking signature marks its block as narration.
 * No upper length bound: the signature grows with its block, and a long
 * narration signature runs past 13k characters. Never throws.
 */
export function isNarrationSignature(signature: unknown): boolean {
  try {
    if (typeof signature !== "string" || signature.length < 8) return false;
    if (!BASE64_PATTERN.test(signature)) return false;
    const raw = new Uint8Array(Buffer.from(signature, "base64"));
    const envelope = lengthDelimitedField(raw, OUTER_ENVELOPE_FIELD);
    if (!envelope) return false;
    const header = lengthDelimitedField(envelope, ENVELOPE_HEADER_FIELD);
    if (!header) return false;
    const kind = lengthDelimitedField(header, HEADER_KIND_FIELD);
    return kind !== undefined && bytesEqual(kind, NARRATION_KIND);
  } catch {
    return false;
  }
}
