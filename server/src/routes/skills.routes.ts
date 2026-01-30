import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { config } from '../lib/config';

const SKILL_EXT = '.md';

function sanitizeId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  return trimmed;
}

export const skillsRoutes = new Hono()
  .get('/', async (c) => {
    try {
      await fs.access(config.skills.dir);
    } catch {
      return c.json({ skills: [] });
    }
    const entries = await fs.readdir(config.skills.dir, { withFileTypes: true });
    const skills: Array<{ id: string; title?: string }> = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(SKILL_EXT)) continue;
      const id = e.name.slice(0, -SKILL_EXT.length);
      const filePath = path.join(config.skills.dir, e.name);
      try {
        const [firstLine = ''] = (await fs.readFile(filePath, 'utf-8')).split(/\r?\n/);
        if (firstLine.startsWith('#')) {
          const title = firstLine.replace(/^#+\s*/, '').trim();
          skills.push({ id, title });
        } else {
          skills.push({ id });
        }
      } catch {
        skills.push({ id });
      }
    }
    return c.json({ skills });
  })

  .get('/:id', async (c) => {
    const id = sanitizeId(c.req.param('id'));
    if (!id) return c.json({ error: 'Invalid skill id' }, 400);
    const filePath = path.join(config.skills.dir, `${id}${SKILL_EXT}`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return c.json({ id, content });
    } catch (err) {
      const code = err && typeof (err as NodeJS.ErrnoException).code === 'string' ? (err as NodeJS.ErrnoException).code : '';
      if (code === 'ENOENT') return c.json({ error: 'Skill not found' }, 404);
      throw err;
    }
  })

  .post('/', async (c) => {
    const body = await c.req.json<{ id?: string; content?: string }>();
    const id = body.id != null ? sanitizeId(String(body.id)) : null;
    const content = typeof body.content === 'string' ? body.content : '';
    if (!id) return c.json({ error: 'id is required and must be a valid skill id' }, 400);
    await fs.mkdir(config.skills.dir, { recursive: true });
    const filePath = path.join(config.skills.dir, `${id}${SKILL_EXT}`);
    await fs.writeFile(filePath, content, 'utf-8');
    return c.json({ id, content }, 201);
  })

  .put('/:id', async (c) => {
    const id = sanitizeId(c.req.param('id'));
    if (!id) return c.json({ error: 'Invalid skill id' }, 400);
    const body = await c.req.json<{ content?: string }>();
    const content = typeof body.content === 'string' ? body.content : '';
    await fs.mkdir(config.skills.dir, { recursive: true });
    const filePath = path.join(config.skills.dir, `${id}${SKILL_EXT}`);
    await fs.writeFile(filePath, content, 'utf-8');
    return c.json({ id, content });
  })

  .delete('/:id', async (c) => {
    const id = sanitizeId(c.req.param('id'));
    if (!id) return c.json({ error: 'Invalid skill id' }, 400);
    const filePath = path.join(config.skills.dir, `${id}${SKILL_EXT}`);
    try {
      await fs.unlink(filePath);
      return c.json({ deleted: id });
    } catch (err) {
      const code = err && typeof (err as NodeJS.ErrnoException).code === 'string' ? (err as NodeJS.ErrnoException).code : '';
      if (code === 'ENOENT') return c.json({ error: 'Skill not found' }, 404);
      throw err;
    }
  });
