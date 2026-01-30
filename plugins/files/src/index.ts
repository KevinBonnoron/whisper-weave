import fs from 'node:fs/promises';
import path from 'node:path';
import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface FilesPluginConfig {
  directory: string;
}

function resolvePath(baseDir: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^(\.\/)+/, '');
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return null;
  }
  const resolved = path.resolve(baseDir, normalized);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

function getPathFromInput(input: Record<string, unknown>): string {
  const raw = input.path ?? input.file_path ?? input.filename ?? '';
  return String(raw).trim();
}

function looksLikeSchema(s: string): boolean {
  return s.includes('"type"') && s.includes('"description"');
}

async function listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, baseDir)));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files;
}

async function listDirectoriesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const dirs: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      dirs.push(path.relative(baseDir, fullPath));
      dirs.push(...(await listDirectoriesRecursive(fullPath, baseDir)));
    }
  }
  return dirs;
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'files',
    name: 'Files',
    description: 'Read and write files in a dedicated directory',
    version: '1.0.0',
  };

  public constructor(private readonly config: FilesPluginConfig) {
    if (!config.directory?.trim()) {
      throw new Error('Files: directory is required');
    }
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'write_file',
        description: 'Create or overwrite a file in the output directory.',
        parameters: [
          { name: 'path', type: 'string', description: 'Relative path of the file', required: true },
          { name: 'content', type: 'string', description: 'Full content of the file', required: true },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          const content = typeof input.content === 'string' ? input.content : String(input.content ?? '');
          try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            return { path: path.relative(this.config.directory, filePath), written: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Write failed' };
          }
        },
      },
      {
        name: 'read_file',
        description: 'Read the content of a file from the output directory.',
        parameters: [{ name: 'path', type: 'string', description: 'Relative path of the file to read', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { path: path.relative(this.config.directory, filePath), content };
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return { error: 'File not found' };
            return { error: err instanceof Error ? err.message : 'Read failed' };
          }
        },
      },
      {
        name: 'append_file',
        description: 'Append content to the end of a file.',
        parameters: [
          { name: 'path', type: 'string', description: 'Relative path of the file', required: true },
          { name: 'content', type: 'string', description: 'Content to append', required: true },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          const content = typeof input.content === 'string' ? input.content : String(input.content ?? '');
          try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.appendFile(filePath, content, 'utf-8');
            return { path: path.relative(this.config.directory, filePath), appended: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Append failed' };
          }
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file from the output directory.',
        parameters: [{ name: 'path', type: 'string', description: 'Relative path of the file to delete', required: true }],
        requiresApproval: true,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          try {
            await fs.unlink(filePath);
            return { path: path.relative(this.config.directory, filePath), deleted: true };
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return { error: 'File not found' };
            return { error: err instanceof Error ? err.message : 'Delete failed' };
          }
        },
      },
      {
        name: 'list_files',
        description: 'List all files in the output directory (recursively).',
        parameters: [{ name: 'path', type: 'string', description: 'Optional subdirectory to list', required: false }],
        requiresApproval: false,
        handler: async (input) => {
          const pathArg = getPathFromInput(input);
          const searchDir = pathArg ? resolvePath(this.config.directory, pathArg) : this.config.directory;
          if (!searchDir) return { error: 'Invalid or disallowed path.' };
          try {
            const files = await listFilesRecursive(searchDir, this.config.directory);
            return { files, count: files.length };
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return { error: 'Directory not found' };
            return { error: err instanceof Error ? err.message : 'List failed' };
          }
        },
      },
      {
        name: 'search_content',
        description: 'Search for text content within all files.',
        parameters: [{ name: 'query', type: 'string', description: 'Text to search for', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          const query = typeof input.query === 'string' ? input.query.trim() : '';
          if (!query) return { error: 'Query parameter is required' };
          try {
            const files = await listFilesRecursive(this.config.directory, this.config.directory);
            const results: Array<{ file: string; matches: Array<{ line: number; content: string }> }> = [];
            for (const file of files) {
              try {
                const content = await fs.readFile(path.join(this.config.directory, file), 'utf-8');
                const lines = content.split('\n');
                const matches: Array<{ line: number; content: string }> = [];
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line?.toLowerCase().includes(query.toLowerCase())) {
                    matches.push({ line: i + 1, content: line });
                  }
                }
                if (matches.length > 0) results.push({ file, matches });
              } catch {
                // Skip files that can't be read
              }
            }
            return { query, results, totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0) };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Search failed' };
          }
        },
      },
      {
        name: 'create_directory',
        description: 'Create a new directory.',
        parameters: [{ name: 'path', type: 'string', description: 'Relative path of the directory to create', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          try {
            await fs.mkdir(filePath, { recursive: true });
            return { path: path.relative(this.config.directory, filePath), created: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Create directory failed' };
          }
        },
      },
      {
        name: 'delete_directory',
        description: 'Delete a directory and all its contents.',
        parameters: [{ name: 'path', type: 'string', description: 'Relative path of the directory to delete', required: true }],
        requiresApproval: true,
        handler: async (input) => {
          const { filePath, error } = this.validatePath(input);
          if (error || !filePath) return { error };
          try {
            await fs.rm(filePath, { recursive: true });
            return { path: path.relative(this.config.directory, filePath), deleted: true };
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return { error: 'Directory not found' };
            return { error: err instanceof Error ? err.message : 'Delete directory failed' };
          }
        },
      },
      {
        name: 'list_directories',
        description: 'List all directories (recursively).',
        parameters: [{ name: 'path', type: 'string', description: 'Optional subdirectory to list', required: false }],
        requiresApproval: false,
        handler: async (input) => {
          const pathArg = getPathFromInput(input);
          const searchDir = pathArg ? resolvePath(this.config.directory, pathArg) : this.config.directory;
          if (!searchDir) return { error: 'Invalid or disallowed path.' };
          try {
            const directories = await listDirectoriesRecursive(searchDir, this.config.directory);
            return { directories, count: directories.length };
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') return { error: 'Directory not found' };
            return { error: err instanceof Error ? err.message : 'List directories failed' };
          }
        },
      },
    ];
  }

  private validatePath(input: Record<string, unknown>): { filePath: string | null; pathArg: string; error?: string } {
    const pathArg = getPathFromInput(input);
    if (looksLikeSchema(pathArg)) {
      return { filePath: null, pathArg, error: 'Pass the file path as the "path" parameter, not a schema.' };
    }
    const filePath = resolvePath(this.config.directory, pathArg);
    if (!filePath) {
      return { filePath: null, pathArg, error: 'Invalid or disallowed path. Use a relative path.' };
    }
    return { filePath, pathArg };
  }
}
