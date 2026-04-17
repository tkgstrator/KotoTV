import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, posix, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

type WalkEntry = { rel: string; isDir: boolean }

async function walk(root: string, base = ''): Promise<WalkEntry[]> {
  const names = await readdir(join(root, base))
  const out: WalkEntry[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const rel = posix.join(base, name)
    const s = await stat(join(root, rel))
    if (s.isDirectory()) {
      out.push({ rel, isDir: true })
      out.push(...(await walk(root, rel)))
    } else {
      out.push({ rel, isDir: false })
    }
  }
  return out
}

function renderIndex(entries: WalkEntry[]): string {
  // Group HTML mocks by their parent directory for a scannable index.
  const groups = new Map<string, string[]>()
  for (const e of entries) {
    if (e.isDir) continue
    if (extname(e.rel) !== '.html') continue
    const dir = posix.dirname(e.rel) === '.' ? '(root)' : posix.dirname(e.rel)
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir)!.push(e.rel)
  }
  const readmes = entries.filter((e) => !e.isDir && posix.basename(e.rel) === 'README.md')

  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, files]) => {
      const readme = readmes.find((r) => posix.dirname(r.rel) === dir)
      const items = files
        .sort()
        .map((f) => `<li><a class="link" href="/mocks/${f}">${posix.basename(f)}</a></li>`)
        .join('')
      const readmeLink = readme ? `<a class="readme" href="/mocks/${readme.rel}">README</a>` : ''
      return `<section><h2>${dir}${readmeLink}</h2><ul>${items}</ul></section>`
    })
    .join('')

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Design mocks</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 2rem; max-width: 48rem; }
  h1 { font-size: 1.25rem; margin: 0 0 1.5rem; }
  section { margin-bottom: 1.5rem; }
  h2 { font-size: 1rem; margin: 0 0 .5rem; display: flex; gap: .75rem; align-items: baseline; }
  .readme { font-size: .75rem; opacity: .6; text-decoration: none; }
  .readme:hover { opacity: 1; text-decoration: underline; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .5rem; }
  .link { display: inline-block; padding: .375rem .75rem; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: .375rem; text-decoration: none; color: inherit; }
  .link:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
</style>
</head>
<body>
<h1>Design mocks</h1>
${sections || '<p>No mocks yet.</p>'}
</body>
</html>`
}

/**
 * Serves design mock HTML (and READMEs) from a source directory under /mocks/
 * during dev, with an auto-generated index at /mocks/ listing every variant.
 * Not included in the production build — this is a dev-only surface.
 */
export function mocksPlugin(sourceDir: string): Plugin {
  const root = resolve(sourceDir)
  return {
    name: 'telemax:mocks',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/mocks')) return next()
        const urlPath = req.url.split('?')[0].replace(/^\/mocks\/?/, '')

        if (urlPath === '' || urlPath === '/') {
          try {
            const entries = await walk(root)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderIndex(entries))
          } catch {
            res.statusCode = 404
            res.end('mocks directory not found')
          }
          return
        }

        const filePath = resolve(root, urlPath)
        const safeRel = relative(root, filePath)
        if (safeRel.startsWith('..') || safeRel === '') {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        try {
          const s = await stat(filePath)
          if (s.isDirectory()) {
            res.statusCode = 302
            res.setHeader('Location', `/mocks/${urlPath.replace(/\/?$/, '/')}`)
            res.end()
            return
          }
          res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream')
          res.end(await readFile(filePath))
        } catch {
          res.statusCode = 404
          res.end('not found')
        }
      })
    }
  }
}
