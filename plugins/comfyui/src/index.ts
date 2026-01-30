import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export const COMFYUI_WORKFLOW_IDS = ['txt2img', 'img2img', 'img2txt', 'upscale'] as const;
export type ComfyUIWorkflowId = (typeof COMFYUI_WORKFLOW_IDS)[number];

export interface ComfyUIConfig {
  baseUrl: string;
  workflows?: Partial<Record<ComfyUIWorkflowId, string>>;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
const DEFAULT_NEGATIVE_PROMPT = 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text';

interface HistoryEntry {
  status?: string | { status_str?: string; completed?: boolean };
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> } | Array<{ filename: string; subfolder: string; type: string }>>;
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'comfyui',
    name: 'ComfyUI',
    description: 'Generate images via a local ComfyUI instance',
    version: '1.0.0',
  };

  public constructor(private readonly config: ComfyUIConfig) {
    if (!config.baseUrl) {
      throw new Error('ComfyUI: baseUrl is required');
    }
  }

  public async shutdown(): Promise<void> {}

  private getBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, '');
  }

  private getWorkflowTemplate(workflowId: ComfyUIWorkflowId): string {
    const fromMap = this.config.workflows?.[workflowId];
    if (fromMap) return fromMap;
    throw new Error(`ComfyUI: no workflow configured for "${workflowId}".`);
  }

  private async uploadImageFromUrl(imageUrl: string): Promise<string> {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to download image from ${imageUrl}: ${imageRes.status}`);
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const urlPath = new URL(imageUrl).pathname;
    const filename = urlPath.split('/').pop() || `upload_${Date.now()}.png`;

    const formData = new FormData();
    const blob = new Blob([imageBuffer]);
    formData.append('image', blob, filename);

    const uploadRes = await fetch(`${this.getBaseUrl()}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`ComfyUI /upload/image failed (${uploadRes.status}): ${text}`);
    }

    const uploadData = (await uploadRes.json()) as { name?: string };
    if (!uploadData.name) {
      throw new Error('ComfyUI /upload/image did not return a filename');
    }
    return uploadData.name;
  }

  private buildWorkflow(workflowId: ComfyUIWorkflowId, params: Record<string, string | number>): Record<string, unknown> {
    const templateStr = this.getWorkflowTemplate(workflowId);
    const escapeForJson = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let filled = templateStr;
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        const stringPlaceholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        filled = filled.replace(stringPlaceholder, escapeForJson(value));
      } else {
        const quotedPlaceholder = new RegExp(`"\\{\\{${key}\\}\\}"`, 'g');
        filled = filled.replace(quotedPlaceholder, String(value));
        const unquotedPlaceholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        filled = filled.replace(unquotedPlaceholder, String(value));
      }
    }
    return JSON.parse(filled);
  }

  private async submitPrompt(workflow: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.getBaseUrl()}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ComfyUI /prompt failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { prompt_id?: string };
    if (!data.prompt_id) {
      throw new Error('ComfyUI /prompt did not return a prompt_id');
    }
    return data.prompt_id;
  }

  private async pollForOutputs(promptId: string): Promise<string[]> {
    const baseUrl = this.getBaseUrl();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const res = await fetch(`${baseUrl}/history/${promptId}`);
      if (!res.ok) {
        throw new Error(`ComfyUI /history failed (${res.status})`);
      }
      const history = (await res.json()) as Record<string, unknown>;
      const entry = history[promptId] as HistoryEntry | undefined;

      const statusObj = entry?.status;
      const isComplete = statusObj === 'complete' || statusObj === 'success' || (typeof statusObj === 'object' && (statusObj?.status_str === 'success' || statusObj?.completed === true));
      const isFailed = statusObj === 'failed' || statusObj === 'error' || (typeof statusObj === 'object' && statusObj?.status_str === 'error');

      if (entry && (isComplete || entry.outputs)) {
        const imageUrls: string[] = [];
        for (const nodeOutputs of Object.values(entry.outputs ?? {})) {
          const images = Array.isArray(nodeOutputs) ? nodeOutputs : nodeOutputs?.images;
          if (!Array.isArray(images)) continue;
          for (const item of images) {
            if (item.filename) {
              const subfolder = item.subfolder ? `${item.subfolder}/` : '';
              imageUrls.push(`${baseUrl}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || '')}&type=${encodeURIComponent(item.type || 'output')}`);
            }
          }
        }
        if (imageUrls.length > 0) return imageUrls;
      }

      if (isFailed) {
        throw new Error('ComfyUI execution failed');
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error('ComfyUI: timed out waiting for image generation');
  }

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'comfyui_generate_image',
        description: 'Generate or process images using ComfyUI workflows.',
        parameters: [
          { name: 'workflowId', type: 'string', description: "Workflow type: 'txt2img', 'img2img', 'img2txt', 'upscale'", required: false },
          { name: 'positivePrompt', type: 'string', description: 'REQUIRED. Main prompt describing the desired output in ENGLISH.', required: true },
          { name: 'negativePrompt', type: 'string', description: 'Elements to avoid in generation.', required: false },
          { name: 'width', type: 'number', description: 'Output width in pixels (multiple of 8, default: 512).', required: false },
          { name: 'height', type: 'number', description: 'Output height in pixels (multiple of 8, default: 512).', required: false },
          { name: 'imageUrl', type: 'string', description: 'Source image URL. Required for img2img, img2txt, and upscale.', required: false },
          { name: 'denoise', type: 'number', description: 'Transformation strength for img2img (0.0-1.0). Default: 0.75', required: false },
          { name: 'steps', type: 'number', description: 'Sampling steps (5-150). Default: 20', required: false },
          { name: 'cfgScale', type: 'number', description: 'Prompt adherence strength (1.0-20.0). Default: 7.0', required: false },
          { name: 'seed', type: 'number', description: 'Random seed for reproducibility. Default: random', required: false },
        ],
        requiresApproval: false,
        handler: async (input: Record<string, unknown>) => {
          const workflowIdRaw = String(input.workflowId ?? 'txt2img').toLowerCase();
          const workflowId: ComfyUIWorkflowId = COMFYUI_WORKFLOW_IDS.includes(workflowIdRaw as ComfyUIWorkflowId) ? (workflowIdRaw as ComfyUIWorkflowId) : 'txt2img';
          const positivePrompt = String(input.positivePrompt ?? '');
          const negativePromptRaw = String(input.negativePrompt ?? '').trim();
          const negativePrompt = negativePromptRaw || DEFAULT_NEGATIVE_PROMPT;
          const width = Math.round((Number(input.width) || 512) / 8) * 8;
          const height = Math.round((Number(input.height) || 512) / 8) * 8;
          const imageUrl = String(input.imageUrl ?? '').trim();

          const denoise = input.denoise !== undefined ? Math.max(0, Math.min(1, Number(input.denoise))) : 0.75;
          const steps = input.steps !== undefined ? Math.max(1, Math.min(150, Math.round(Number(input.steps)))) : 20;
          const cfgScale = input.cfgScale !== undefined ? Math.max(1, Math.min(20, Number(input.cfgScale))) : 7.0;
          const seed = input.seed !== undefined ? Math.round(Number(input.seed)) : Math.floor(Math.random() * 2147483647);

          if (!positivePrompt.trim()) {
            return { error: 'positivePrompt is required' };
          }

          if ((workflowId === 'img2img' || workflowId === 'img2txt' || workflowId === 'upscale') && !imageUrl) {
            return { error: `workflowId "${workflowId}" requires imageUrl` };
          }

          const params: Record<string, string | number> = {
            positivePrompt,
            negativePrompt,
            width,
            height,
            denoise,
            steps,
            cfgScale,
            seed,
          };

          if (imageUrl) {
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
              const uploadedFilename = await this.uploadImageFromUrl(imageUrl);
              params.imageUrl = uploadedFilename;
            } else {
              params.imageUrl = imageUrl;
            }
          }

          const workflow = this.buildWorkflow(workflowId, params);
          const promptId = await this.submitPrompt(workflow);
          const imageUrls = await this.pollForOutputs(promptId);

          return { promptId, imageUrls, seed };
        },
      },
    ];
  }
}
