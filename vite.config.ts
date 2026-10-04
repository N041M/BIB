import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Lets the backdrop studio (/?render-backdrop, development only) save the
 * images it renders into public/backdrop/. They arrive in one request, as
 * JSON with each file in base64, because the first file written reloads the
 * page.
 */
function backdropStudio(): Plugin {
  const dir = fileURLToPath(new URL('./public/backdrop/', import.meta.url));
  return {
    name: 'backdrop-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__backdrop', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const files = req.method === 'POST' ? (JSON.parse(Buffer.concat(chunks).toString()) as { name: string; data: string }[]) : [];
        if (!files.length || files.some((f) => !/^[\w-]+\.(webp|png)$/.test(f.name))) {
          res.statusCode = 400;
          res.end();
          return;
        }
        await mkdir(dir, { recursive: true });
        for (const f of files) await writeFile(dir + f.name, Buffer.from(f.data, 'base64'));
        res.end('ok');
      });
    },
  };
}

// Relative base so the build works from any sub-path (GitHub Pages, static hosts, previews).
export default defineConfig({
  base: './',
  plugins: [backdropStudio()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
