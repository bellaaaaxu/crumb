/* A QR code for a link, as a PNG data URL: scanned from the admin's screen, or sent as a
 * picture, which a phone opens with a long press. It is made here, on the organization's
 * own server, so the link never goes to an outside service. */
import sharp from 'sharp';
import { encode } from 'uqr';

const QUIET = 4; // white modules around the code, as the standard asks
const SCALE = 8; // pixels per module

export async function qrPng(text, log = () => {}) {
  try {
    const { data } = encode(text, { ecc: 'M', border: 0 });
    const side = (data.length + QUIET * 2) * SCALE;
    const pixels = Buffer.alloc(side * side, 255);
    data.forEach((row, y) => row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < SCALE; dy += 1) {
        const start = ((y + QUIET) * SCALE + dy) * side + (x + QUIET) * SCALE;
        pixels.fill(0, start, start + SCALE);
      }
    }));
    const png = await sharp(pixels, { raw: { width: side, height: side, channels: 1 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (error) {
    // The link alone still works. Logged by type only: the message could quote the link.
    log(`[crumb] QR code not made: ${error?.name ?? 'Error'}`);
    return null;
  }
}
