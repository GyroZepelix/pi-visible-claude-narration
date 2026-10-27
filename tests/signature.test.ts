import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isNarrationSignature, lengthDelimitedField } from "../src/signature.js";
import { narrationSignature, signature, signatureBytes, thinkingSignature, varint } from "./helpers.js";

describe("isNarrationSignature", () => {
  test("detects the narration kind", () => {
    assert.equal(isNarrationSignature(narrationSignature()), true);
  });

  test("treats the thinking kind as reasoning", () => {
    assert.equal(isNarrationSignature(thinkingSignature()), false);
  });

  test("treats other and near-miss kinds as reasoning", () => {
    for (const kind of ["", "narratio", "narrationX", "Narration", "summary", "redacted"]) {
      assert.equal(isNarrationSignature(signature(kind)), false, kind);
    }
  });

  test("treats a header without a kind field as reasoning", () => {
    assert.equal(isNarrationSignature(signature(undefined)), false);
  });

  test("rejects empty, short, non-string, and non-base64 input without throwing", () => {
    for (const input of ["", "CAQS", "short", "not base64 at all!!", "%%%%%%%%%%%%", " ".repeat(20), undefined, null, 42, {}]) {
      assert.equal(isNarrationSignature(input), false, String(input));
    }
  });

  test("rejects truncated signatures at every cut point", () => {
    const bytes = signatureBytes("narration", 16);
    for (let cut = 1; cut < bytes.length; cut++) {
      const truncated = Buffer.from(bytes.slice(0, cut)).toString("base64");
      // A cut inside the trailing ciphertext still leaves an incomplete outer field.
      assert.equal(isNarrationSignature(truncated), false, `cut at ${cut}`);
    }
  });

  test("rejects oversized varints without throwing", () => {
    const oversizedLength = Buffer.from([0x08, 0x04, 0x12, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00]).toString("base64");
    const unterminated = Buffer.from([0x08, 0x04, 0x12, ...new Array<number>(12).fill(0xff)]).toString("base64");
    const hugeTag = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0x0f, 0x00, 0x00]).toString("base64");
    for (const input of [oversizedLength, unterminated, hugeTag]) {
      assert.equal(isNarrationSignature(input), false);
    }
  });

  test("rejects a length that runs past the buffer", () => {
    const bytes = [0x08, 0x04, 0x12, ...varint(500), 0x0a, 0x02, 0x08, 0x13];
    assert.equal(isNarrationSignature(Buffer.from(bytes).toString("base64")), false);
  });

  test("decodes long signatures over 13k characters", () => {
    const long = narrationSignature(10_000);
    assert.ok(long.length > 13_000, `length ${long.length}`);
    assert.equal(isNarrationSignature(long), true);
    assert.equal(isNarrationSignature(thinkingSignature(10_000)), false);
  });

  test("accepts URL-safe base64", () => {
    const urlSafe = narrationSignature(40).replace(/\+/g, "-").replace(/\//g, "_");
    assert.equal(isNarrationSignature(urlSafe), true);
  });
});

describe("lengthDelimitedField", () => {
  test("skips varint, fixed32, and fixed64 fields", () => {
    const message = new Uint8Array([0x08, 0x96, 0x01, 0x11, 1, 2, 3, 4, 5, 6, 7, 8, 0x1d, 1, 2, 3, 4, 0x22, 0x02, 0x61, 0x62]);
    assert.deepEqual([...(lengthDelimitedField(message, 4) ?? [])], [0x61, 0x62]);
  });

  test("returns undefined for unsupported wire types and field zero", () => {
    assert.equal(lengthDelimitedField(new Uint8Array([0x0b, 0x00]), 1), undefined);
    assert.equal(lengthDelimitedField(new Uint8Array([0x02, 0x00]), 0), undefined);
  });
});
