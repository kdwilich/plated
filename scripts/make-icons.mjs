// Rasterizes static/icon.svg into the PNGs iOS and Android need.
//
// iOS never reads the manifest for a home-screen icon — it takes
// apple-touch-icon.png, ignores transparency, and applies its own rounded
// mask, which is why the source paints an opaque background and no corners
// of its own.
//
// Run: npm run icons

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
const source = readFileSync(join(STATIC, 'icon.svg'));

/**
 * Android's maskable icons can be cropped to a circle, so the artwork has to
 * sit inside the inner 80% — the plates reach 75% of the width and would
 * clip at the edges. Shrinking about the centre keeps the same drawing.
 */
function inset(svg, factor) {
	return Buffer.from(
		svg
			.toString()
			.replace(
				/(<rect width="512" height="512"[^>]*\/>)/,
				`$1<g transform="translate(256,256) scale(${factor}) translate(-256,-256)">`
			)
			.replace('</svg>', '</g></svg>')
	);
}

const OUTPUTS = [
	// iOS home screen. 180 covers every current device.
	{ file: 'apple-touch-icon.png', size: 180, svg: source },
	{ file: 'icon-192.png', size: 192, svg: source },
	{ file: 'icon-512.png', size: 512, svg: source },
	{ file: 'icon-maskable-512.png', size: 512, svg: inset(source, 0.85) }
];

for (const { file, size, svg } of OUTPUTS) {
	const png = await sharp(svg, { density: 512 })
		.resize(size, size)
		// Flatten to the app ground: iOS renders transparency as black anyway,
		// and Android would show it against an unpredictable wallpaper.
		.flatten({ background: '#0b0c0e' })
		.png()
		.toBuffer();
	writeFileSync(join(STATIC, file), png);
	console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
