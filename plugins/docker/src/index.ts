import Docker from 'dockerode';
import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface DockerPluginConfig {
  connectionType: 'socket' | 'tcp';
  socketPath?: string;
  host?: string;
  port?: number;
}

const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';
const DEFAULT_TCP_PORT = 2375;
const MAX_TAIL_LINES = 2000;

function getDockerClient(config: DockerPluginConfig): Docker {
  if (config.connectionType === 'tcp') {
    const host = (config.host ?? '').trim();
    if (!host) {
      throw new Error('Docker: host is required when connectionType is tcp');
    }
    const port = config.port ?? DEFAULT_TCP_PORT;
    return new Docker({ host, port });
  }
  const socketPath = (config.socketPath ?? DEFAULT_SOCKET_PATH).trim() || DEFAULT_SOCKET_PATH;
  return new Docker({ socketPath });
}

function toErrorResult(message: string): { error: string } {
  return { error: message };
}

async function readDockerLogStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) return '';

  const parts: string[] = [];
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const streamType = raw[offset]!;
    const size = raw.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > raw.length) break;

    const payload = raw.subarray(offset, offset + size);
    if (streamType === 1 || streamType === 2) {
      parts.push(payload.toString('utf-8', 0, payload.length));
    }
    offset += size;
  }
  return parts.join('');
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'docker',
    name: 'Docker',
    description: 'Manage Docker containers',
    version: '1.0.0',
  };

  private readonly docker: Docker;

  public constructor(config: DockerPluginConfig) {
    this.docker = getDockerClient(config);
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    const docker = this.docker;

    return [
      {
        name: 'docker_list_containers',
        description: 'List Docker containers.',
        parameters: [
          { name: 'all', type: 'string', description: 'If "true" list all containers; if "false" only running. Default "true".', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const all = input.all === 'false' ? false : true;
            const containers = await docker.listContainers({ all });
            const list = containers.map((c) => ({
              id: c.Id,
              name: (c.Names ?? [])[0]?.replace(/^\//, '') ?? null,
              image: c.Image ?? null,
              state: c.State ?? null,
              status: c.Status ?? null,
            }));
            return { containers: list, count: list.length };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return toErrorResult(`Docker connection failed: ${message}`);
          }
        },
      },
      {
        name: 'docker_start_container',
        description: 'Start a stopped Docker container by id or name.',
        parameters: [{ name: 'container', type: 'string', description: 'Container ID or name to start', required: true }],
        requiresApproval: true,
        handler: async (input) => {
          const idOrName = typeof input.container === 'string' ? input.container.trim() : '';
          if (!idOrName) return toErrorResult('container is required');
          try {
            const container = docker.getContainer(idOrName);
            await container.start();
            return { success: true, container: idOrName, message: 'Container started' };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (String(message).toLowerCase().includes('already started')) {
              return toErrorResult('Container is already running');
            }
            return toErrorResult(`Failed to start container: ${message}`);
          }
        },
      },
      {
        name: 'docker_stop_container',
        description: 'Stop a running Docker container by id or name.',
        parameters: [{ name: 'container', type: 'string', description: 'Container ID or name to stop', required: true }],
        requiresApproval: true,
        handler: async (input) => {
          const idOrName = typeof input.container === 'string' ? input.container.trim() : '';
          if (!idOrName) return toErrorResult('container is required');
          try {
            const container = docker.getContainer(idOrName);
            await container.stop();
            return { success: true, container: idOrName, message: 'Container stopped' };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (String(message).toLowerCase().includes('already stopped')) {
              return toErrorResult('Container is already stopped');
            }
            return toErrorResult(`Failed to stop container: ${message}`);
          }
        },
      },
      {
        name: 'docker_restart_container',
        description: 'Restart a Docker container by id or name.',
        parameters: [{ name: 'container', type: 'string', description: 'Container ID or name to restart', required: true }],
        requiresApproval: true,
        handler: async (input) => {
          const idOrName = typeof input.container === 'string' ? input.container.trim() : '';
          if (!idOrName) return toErrorResult('container is required');
          try {
            const container = docker.getContainer(idOrName);
            await container.restart();
            return { success: true, container: idOrName, message: 'Container restarted' };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return toErrorResult(`Failed to restart container: ${message}`);
          }
        },
      },
      {
        name: 'docker_container_logs',
        description: 'Get logs of a Docker container.',
        parameters: [
          { name: 'container', type: 'string', description: 'Container ID or name', required: true },
          { name: 'tail', type: 'number', description: 'Number of lines to show from the end (max 2000).', required: false },
          { name: 'since', type: 'string', description: 'Show logs since timestamp or duration', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const idOrName = typeof input.container === 'string' ? input.container.trim() : '';
          if (!idOrName) return toErrorResult('container is required');

          let tail: number | undefined;
          if (input.tail != null) {
            const n = Number(input.tail);
            if (!Number.isFinite(n) || n < 1) return toErrorResult('tail must be a positive number');
            tail = Math.min(Math.floor(n), MAX_TAIL_LINES);
          }

          const since = typeof input.since === 'string' ? input.since.trim() || undefined : undefined;
          try {
            const container = docker.getContainer(idOrName);
            const stream = await container.logs({
              follow: false,
              stdout: true,
              stderr: true,
              tail: tail ?? 100,
              since,
            });
            const logs = await readDockerLogStream(stream as NodeJS.ReadableStream);
            return { container: idOrName, logs };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (String(message).toLowerCase().includes('no such container')) {
              return toErrorResult(`Container not found: ${idOrName}`);
            }
            return toErrorResult(`Failed to get logs: ${message}`);
          }
        },
      },
    ];
  }
}
