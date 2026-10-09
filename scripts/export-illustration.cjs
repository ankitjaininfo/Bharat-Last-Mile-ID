/* Export a seekable HTML illustration to H.264 MP4 without browser controls.
 * node scripts/export-illustration.cjs input.html output.mp4 /path/to/ffmpeg
 * Requires Playwright (or PLAYWRIGHT_MODULE_PATH) and its Chromium browser.
 */
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const [input, output, ffmpeg = 'ffmpeg'] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/export-illustration.cjs input.html output.mp4 [ffmpeg]');
  const width = 1920, height = 1080, fps = 30;
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let encoder;
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(input)).href);
    await page.addStyleTag({ content: '.controls { display: none !important; }' });
    await page.evaluate(async () => {
      window.illustration.pause();
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    });
    const duration = await page.evaluate(() => window.illustration.duration);
    const frames = Math.ceil(duration * fps) + 1;
    encoder = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png',
      '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium',
      '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.resolve(output)],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const completed = new Promise((resolve, reject) => {
      encoder.on('error', reject);
      encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`Encoder exited with ${code}`)));
    });
    for (let frame = 0; frame < frames; frame++) {
      await page.evaluate(t => window.illustration.seek(t), Math.min(frame / fps, duration));
      const png = await page.screenshot({ type: 'png', animations: 'allow' });
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
      if (frame % (fps * 5) === 0) process.stdout.write(`Rendered ${Math.min(frame / fps, duration).toFixed(1)} / ${duration.toFixed(1)} seconds\n`);
    }
    encoder.stdin.end();
    await completed;
    process.stdout.write(`Saved ${path.resolve(output)} (${width}×${height}, ${fps} fps, ${frames} frames)\n`);
  } finally {
    if (encoder && encoder.exitCode === null) encoder.kill();
    await browser.close();
  }
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
