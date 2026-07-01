import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const sourceDir = path.join(root, 'node_modules', '@fluentui', 'svg-icons', 'icons');
const resources = path.join(root, 'resources');
const files = await fs.readdir(sourceDir);
const preferred = files.find((name) => /window.*search.*24.*regular/i.test(name))
  ?? files.find((name) => /window.*24.*regular/i.test(name));

if (!preferred) throw new Error('Fluent UIのウィンドウアイコンが見つかりません。');
await fs.mkdir(resources, { recursive: true });
const source = path.join(sourceDir, preferred);
const sizes = [16, 20, 24, 32, 40, 48, 64, 256];
const pngs = [];

for (const size of sizes) {
  const output = path.join(resources, `task-walker-${size}.png`);
  await sharp(source).resize(size, size).png().toFile(output);
  pngs.push(output);
}

await fs.copyFile(path.join(resources, 'task-walker-32.png'), path.join(resources, 'task-walker.png'));
await fs.writeFile(path.join(resources, 'task-walker.ico'), await pngToIco(pngs));
console.log(`Generated icons from ${preferred}`);
