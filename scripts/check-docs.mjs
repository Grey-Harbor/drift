import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const markdownRoots = ['README.md', 'ARCHITECTURE.md', 'AGENTS.md', 'docs'];
const failures = [];

async function markdownFiles(entry) {
  const absolute = path.join(root, entry);
  const details = await stat(absolute);
  if (details.isFile()) return [absolute];

  const children = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    children.map((child) => markdownFiles(path.join(entry, child.name))),
  );
  return nested.flat().filter((file) => file.endsWith('.md'));
}

function anchorsFor(markdown) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = match[2]
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function validateJsonFences(file, markdown) {
  const fence = /^```(json|jsonl)\s*\n([\s\S]*?)^```\s*$/gm;
  for (const match of markdown.matchAll(fence)) {
    const line = markdown.slice(0, match.index).split('\n').length;
    try {
      if (match[1] === 'json') {
        JSON.parse(match[2]);
      } else {
        const values = match[2]
          .split(/\n(?=\{)/)
          .map((value) => value.trim())
          .filter(Boolean);
        for (const value of values) JSON.parse(value);
      }
    } catch (error) {
      failures.push(`${path.relative(root, file)}:${line}: invalid ${match[1]}: ${error.message}`);
    }
  }
}

async function validateLinks(file, markdown, cache) {
  const links = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(links)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:[a-z]+:|mailto:)/i.test(target)) continue;

    const [rawPath, rawAnchor] = target.split('#', 2);
    const targetFile = rawPath
      ? path.resolve(path.dirname(file), decodeURIComponent(rawPath))
      : file;
    const line = markdown.slice(0, match.index).split('\n').length;

    try {
      const details = await stat(targetFile);
      if (!details.isFile() && rawAnchor) {
        failures.push(
          `${path.relative(root, file)}:${line}: anchor target is not a file: ${target}`,
        );
        continue;
      }
    } catch {
      failures.push(`${path.relative(root, file)}:${line}: missing link target: ${target}`);
      continue;
    }

    if (rawAnchor && targetFile.endsWith('.md')) {
      let anchors = cache.get(targetFile);
      if (!anchors) {
        anchors = anchorsFor(await readFile(targetFile, 'utf8'));
        cache.set(targetFile, anchors);
      }
      if (!anchors.has(decodeURIComponent(rawAnchor).toLowerCase())) {
        failures.push(`${path.relative(root, file)}:${line}: missing heading anchor: ${target}`);
      }
    }
  }
}

const files = (await Promise.all(markdownRoots.map(markdownFiles))).flat();
const anchorCache = new Map();
for (const file of files) {
  const markdown = await readFile(file, 'utf8');
  validateJsonFences(file, markdown);
  await validateLinks(file, markdown, anchorCache);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked JSON fences and internal links in ${files.length} Markdown files.`);
}
