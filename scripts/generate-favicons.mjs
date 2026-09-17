import sharp from 'sharp';
import toIco from 'to-ico';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const mark = await readFile(join(root, 'favicon.svg'));

const png32 = await sharp(mark).resize(32, 32).png().toBuffer();
await writeFile(join(root, 'favicon-32.png'), png32);

const appleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" fill="none">
  <rect width="180" height="180" fill="#fafbfc"/>
  <g transform="translate(29 29) scale(3.8125)">
    <rect x="1" y="1" width="8" height="8" rx="2.2" fill="#2B26FF"/>
    <rect x="12" y="1" width="8" height="8" rx="2.2" fill="#0a0a0b"/>
    <rect x="23" y="1" width="8" height="8" rx="2.2" fill="#0a0a0b"/>
    <rect x="12" y="12" width="8" height="8" rx="2.2" fill="#0a0a0b"/>
    <rect x="23" y="12" width="8" height="8" rx="2.2" fill="#0a0a0b"/>
    <rect x="12" y="23" width="8" height="8" rx="2.2" fill="#0a0a0b"/>
  </g>
</svg>`);
const apple = await sharp(appleSvg).resize(180, 180).png().toBuffer();
await writeFile(join(root, 'apple-touch-icon.png'), apple);

const png16 = await sharp(mark).resize(16, 16).png().toBuffer();
const png48 = await sharp(mark).resize(48, 48).png().toBuffer();
const ico = await toIco([png16, png32, png48]);
await writeFile(join(root, 'favicon.ico'), ico);

console.log('Wrote favicon-32.png, apple-touch-icon.png, favicon.ico');
