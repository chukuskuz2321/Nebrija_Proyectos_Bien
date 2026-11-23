import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const repoRoot = process.cwd();
const svgPath = path.join(repoRoot, 'public', 'logo.svg');
const targets = [
  path.join(repoRoot, 'desktop', 'app', 'src-tauri', 'icons'),
  path.join(repoRoot, 'desktop', 'installer', 'src-tauri', 'icons'),
];

async function run() {
  const svgBuffer = fs.readFileSync(svgPath);

  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  const png128 = await sharp(svgBuffer).resize(128, 128).png().toBuffer();
  const png256 = await sharp(svgBuffer).resize(256, 256).png().toBuffer();

  const icoBuffer = await pngToIco([png16, png32, png48, png128, png256]);

  for (const dir of targets) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '32x32.png'), png32);
    fs.writeFileSync(path.join(dir, '128x128.png'), png128);
    fs.writeFileSync(path.join(dir, '128x128@2x.png'), png256);
    fs.writeFileSync(path.join(dir, 'icon.png'), png256);
    fs.writeFileSync(path.join(dir, 'icon.ico'), icoBuffer);
  }

  console.log('Generated Windows app & installer icons from public/logo.svg');
}

run().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
