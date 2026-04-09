const sharp = require('sharp');
const { readFileSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'public/icon-source.svg'));

(async () => {
  const png512 = await sharp(svg).resize(512, 512).png().toBuffer();
  await sharp(png512).toFile(join(root, 'public/icon-512.png'));
  await sharp(png512).resize(180, 180).toFile(join(root, 'public/apple-touch-icon.png'));
  console.log('OK: icon-512.png + apple-touch-icon.png');
})();
