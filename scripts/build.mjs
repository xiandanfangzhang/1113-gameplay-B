import { cp, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
await copyFile(join(root, 'index.html'), join(dist, 'index.html'));
await copyFile(join(root, 'styles.css'), join(dist, 'styles.css'));
await copyFile(join(root, 'pattern-tool.html'), join(dist, 'pattern-tool.html'));
await copyFile(join(root, 'pattern-tool.css'), join(dist, 'pattern-tool.css'));
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true, force: true });
console.log(`已构建静态页面：${dist}`);
