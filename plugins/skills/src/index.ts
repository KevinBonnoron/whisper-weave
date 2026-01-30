import fs from 'node:fs/promises';
import path from 'node:path';
import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface SkillsPluginConfig {
  directory: string;
}

const SKILL_EXT = '.md';

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'skills',
    name: 'Skills',
    description: 'Access and list markdown skill files',
    version: '1.0.0',
  };

  public constructor(private readonly config: SkillsPluginConfig) {
    if (!config.directory?.trim()) {
      throw new Error('Skills: directory is required');
    }
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'list_skills',
        description: 'List all available skill IDs and their titles (first line or filename). Use this to know which skills exist before calling get_skill.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            await fs.access(this.config.directory);
          } catch {
            return { skills: [], error: 'Skills directory not found' };
          }

          const entries = await fs.readdir(this.config.directory, { withFileTypes: true });
          const skills: Array<{ id: string; title?: string }> = [];

          for (const e of entries) {
            if (!e.isFile() || !e.name.endsWith(SKILL_EXT)) {
              continue;
            }

            const id = e.name.slice(0, -SKILL_EXT.length);
            const filePath = path.join(this.config.directory, e.name);

            try {
              const raw = await fs.readFile(filePath, 'utf-8');
              const firstLine = raw.split(/\r?\n/)[0]?.trim();
              const title = firstLine?.startsWith('#') ? firstLine.replace(/^#+\s*/, '').trim() : firstLine || id;
              skills.push({ id, title });
            } catch {
              skills.push({ id });
            }
          }

          return { skills };
        },
      },
      {
        name: 'get_skill',
        description: 'Get the full Markdown content of a skill by ID. The ID is the filename without the .md extension.',
        parameters: [{ name: 'skill_id', type: 'string', description: 'Skill ID (filename without .md)', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          const skillId = String(input.skill_id ?? '').trim();

          if (!skillId) {
            return { error: 'skill_id is required' };
          }

          if (skillId.includes('/') || skillId.includes('..')) {
            return { error: 'Invalid skill_id' };
          }

          const filePath = path.join(this.config.directory, `${skillId}${SKILL_EXT}`);

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { skill_id: skillId, content };
          } catch (err) {
            const code = err && typeof (err as NodeJS.ErrnoException).code === 'string' ? (err as NodeJS.ErrnoException).code : '';
            if (code === 'ENOENT') {
              return { error: `Skill not found: ${skillId}` };
            }
            throw err;
          }
        },
      },
    ];
  }
}
