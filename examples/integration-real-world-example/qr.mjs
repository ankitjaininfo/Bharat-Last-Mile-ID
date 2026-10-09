import { readFile, stat } from "node:fs/promises";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader, ResultMetadataType, DecodeHintType } from "@zxing/library";
import { requireRule, ProtocolError } from "./protocol.mjs";

export async function writeQr(file, token) {
  requireRule(Buffer.byteLength(token) <= 2048, "token_too_large");
  const segments = [{ data: Buffer.from(token, "ascii"), mode: "byte" }];
  // No version override: qrcode selects the smallest Model 2 version that fits.
  const symbol = QRCode.create(segments, { errorCorrectionLevel: "M" });
  await QRCode.toFile(file, segments, {
    type: "png", errorCorrectionLevel: "M", margin: 4, scale: 6,
    color: { dark: "#000000ff", light: "#ffffffff" }
  });
  return { version: symbol.version, modules: symbol.modules.size, pixelsPerModule: 6 };
}

export async function readQr(file) {
  requireRule((await stat(file)).size <= 8 * 1024 * 1024, "malformed_qr");
  const bytes = await readFile(file);
  requireRule(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(12, 16).toString() === "IHDR", "malformed_qr");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  requireRule(width > 0 && height > 0 && width <= 4096 && height <= 4096, "malformed_qr");
  let image;
  try { image = PNG.sync.read(bytes, { checkCRC: true }); } catch { throw new ProtocolError("malformed_qr"); }
  const rgba = new Uint8ClampedArray(image.data);
  const code = jsQR(rgba, width, height, { inversionAttempts: "dontInvert" });
  requireRule(code && code.version >= 1 && code.version <= 40 && code.chunks.length > 0 &&
    code.chunks.every(chunk => chunk.type === "byte"), "malformed_qr");
  requireRule(code.binaryData.every(byte => byte <= 127), "malformed_qr");
  // jsQR exposes mode/version/raw bytes; ZXing additionally exposes EC level.
  const pixels = new Int32Array(width * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
  let decoded;
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
  try {
    // A PNG export is normally a pure symbol. Fall back to detection for photos.
    try { decoded = new QRCodeReader().decode(bitmap, new Map([[DecodeHintType.PURE_BARCODE, true]])); }
    catch { decoded = new QRCodeReader().decode(bitmap); }
  } catch { throw new ProtocolError("malformed_qr"); }
  requireRule(decoded.getResultMetadata().get(ResultMetadataType.ERROR_CORRECTION_LEVEL) === "M", "malformed_qr");
  const token = Buffer.from(code.binaryData).toString("ascii");
  requireRule(decoded.getText() === token, "malformed_qr");
  return token;
}
