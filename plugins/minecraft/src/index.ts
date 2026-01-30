import mineflayer, { type Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface MinecraftConfig {
  host: string;
  port?: number;
  username: string;
  auth?: 'offline' | 'microsoft';
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'minecraft',
    name: 'Minecraft',
    description: 'Control a Minecraft bot: move, look, chat, dig, place blocks, inventory',
    version: '1.0.0',
  };

  private readonly host: string;
  private readonly port: number;
  private readonly username: string;
  private readonly auth: 'offline' | 'microsoft';
  private bot: Bot | null = null;
  private connecting: Promise<Bot> | null = null;

  public constructor(config: MinecraftConfig) {
    if (!config.host?.trim()) {
      throw new Error('Minecraft plugin: host is required');
    }

    if (!config.username?.trim()) {
      throw new Error('Minecraft plugin: username is required');
    }

    this.host = config.host.trim();
    this.port = Number(config.port) || 25565;
    this.username = config.username.trim();
    this.auth = config.auth === 'microsoft' ? 'microsoft' : 'offline';
  }

  public async shutdown(): Promise<void> {
    this.disconnectBot();
  }

  private async getBot(): Promise<Bot> {
    if (this.bot) {
      return this.bot;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = new Promise<Bot>((resolve, reject) => {
      const bot = mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.username,
        auth: this.auth,
        hideErrors: false,
      });

      const onSpawn = (): void => {
        bot.removeListener('error', onError);
        this.bot = bot;
        this.connecting = null;
        resolve(bot);
      };

      const onError = (err: Error): void => {
        bot.removeListener('spawn', onSpawn);
        this.connecting = null;
        reject(err);
      };

      const onEnd = (): void => {
        if (this.bot === bot) {
          this.bot = null;
        }
      };

      bot.once('spawn', onSpawn);
      bot.once('error', onError);
      bot.on('end', onEnd);
    });

    return this.connecting;
  }

  private disconnectBot(): void {
    if (this.bot) {
      this.bot.end();
      this.bot = null;
    }
    this.connecting = null;
  }

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'mc_connect',
        description: 'Connect the bot to the Minecraft server. Call this first before other actions, or to reconnect after a disconnect. Returns server address and success status.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            const bot = await this.getBot();
            const { x, y, z } = bot.entity.position;
            return {
              success: true,
              connected: true,
              server: `${this.host}:${this.port}`,
              username: this.username,
              position: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100 },
            };
          } catch (err) {
            return { success: false, connected: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_disconnect',
        description: 'Disconnect the bot from the Minecraft server. Can reconnect later with mc_connect.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            this.disconnectBot();
            return { success: true, message: 'Disconnected from server.' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_get_position',
        description: 'Get the bot current position (x, y, z) and orientation (yaw, pitch in degrees).',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            const bot = await this.getBot();
            const { x, y, z } = bot.entity.position;
            const yaw = radToDeg(bot.entity.yaw);
            const pitch = radToDeg(bot.entity.pitch);
            return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10 };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_move',
        description: 'Set movement controls. Pass true/false for forward, back, left, right, jump. Movement continues until mc_stop is called.',
        parameters: [
          { name: 'forward', type: 'boolean', description: 'Move forward', required: false },
          { name: 'back', type: 'boolean', description: 'Move backward', required: false },
          { name: 'left', type: 'boolean', description: 'Strafe left', required: false },
          { name: 'right', type: 'boolean', description: 'Strafe right', required: false },
          { name: 'jump', type: 'boolean', description: 'Jump', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const keys = ['forward', 'back', 'left', 'right', 'jump'] as const;
            for (const key of keys) {
              const v = input[key];
              if (typeof v === 'boolean') {
                bot.setControlState(key, v);
              }
            }
            return { success: true, message: 'Movement updated. Call mc_stop to stop.' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_stop',
        description: 'Stop all movement (forward, back, left, right, jump).',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            const bot = await this.getBot();
            bot.clearControlStates();
            return { success: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_look',
        description: 'Set bot look direction. yaw: horizontal angle in degrees (0= south, 90= west, 180= north, 270= east). pitch: vertical angle in degrees (-90 up, 0 horizontal, 90 down).',
        parameters: [
          { name: 'yaw', type: 'number', description: 'Horizontal angle in degrees', required: true },
          { name: 'pitch', type: 'number', description: 'Vertical angle in degrees', required: true },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const yaw = degToRad(Number(input.yaw) || 0);
            const pitch = degToRad(Number(input.pitch) || 0);
            await bot.look(yaw, pitch);
            return { success: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_chat',
        description: 'Send a message in the game chat.',
        parameters: [{ name: 'message', type: 'string', description: 'Message to send', required: true }],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const message = String(input.message ?? '').trim();
            if (!message) return { error: 'message is required' };
            bot.chat(message);
            return { success: true };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_get_block',
        description: 'Get the block at the given coordinates, or at cursor if x,y,z are omitted. Returns block name and position.',
        parameters: [
          { name: 'x', type: 'number', description: 'Block X (integer)', required: false },
          { name: 'y', type: 'number', description: 'Block Y (integer)', required: false },
          { name: 'z', type: 'number', description: 'Block Z (integer)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const x = input.x != null ? Math.floor(Number(input.x)) : undefined;
            const y = input.y != null ? Math.floor(Number(input.y)) : undefined;
            const z = input.z != null ? Math.floor(Number(input.z)) : undefined;

            if (x != null && y != null && z != null) {
              const block = bot.blockAt(new Vec3(x, y, z));
              if (!block) return { position: { x, y, z }, block: null, message: 'No block (air or out of world)' };
              return { position: { x, y, z }, block: block.name, displayName: block.displayName };
            }

            const block = bot.blockAtCursor(5);
            if (!block) return { message: 'No block in cursor range (5 blocks)' };
            const pos = block.position;
            return { position: { x: pos.x, y: pos.y, z: pos.z }, block: block.name, displayName: block.displayName };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_dig',
        description: 'Dig (break) the block at the given coordinates, or the block the bot is looking at. Returns when the block is broken.',
        parameters: [
          { name: 'x', type: 'number', description: 'Block X (integer)', required: false },
          { name: 'y', type: 'number', description: 'Block Y (integer)', required: false },
          { name: 'z', type: 'number', description: 'Block Z (integer)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const x = input.x != null ? Math.floor(Number(input.x)) : undefined;
            const y = input.y != null ? Math.floor(Number(input.y)) : undefined;
            const z = input.z != null ? Math.floor(Number(input.z)) : undefined;

            let block;
            if (x != null && y != null && z != null) {
              block = bot.blockAt(new Vec3(x, y, z));
            } else {
              block = bot.blockAtCursor(5);
            }
            if (!block) return { error: 'No block to dig at the given position or in cursor range' };
            await bot.dig(block);
            const pos = block.position;
            return { success: true, position: { x: pos.x, y: pos.y, z: pos.z }, block: block.name };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_place_block',
        description: 'Place the block currently held in hand against the block at the given position, on the given face. Face: up, down, north, south, east, west.',
        parameters: [
          { name: 'x', type: 'number', description: 'Reference block X (the block to place against)', required: true },
          { name: 'y', type: 'number', description: 'Reference block Y', required: true },
          { name: 'z', type: 'number', description: 'Reference block Z', required: true },
          {
            name: 'face',
            type: 'string',
            description: 'Face of the reference block to place against: up, down, north, south, east, west',
            required: true,
            enum: ['up', 'down', 'north', 'south', 'east', 'west'],
          },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const x = Math.floor(Number(input.x));
            const y = Math.floor(Number(input.y));
            const z = Math.floor(Number(input.z));
            const faceStr = String(input.face ?? 'up').toLowerCase();
            const faceVectors: Record<string, { x: number; y: number; z: number }> = {
              up: { x: 0, y: 1, z: 0 },
              down: { x: 0, y: -1, z: 0 },
              north: { x: 0, y: 0, z: -1 },
              south: { x: 0, y: 0, z: 1 },
              east: { x: 1, y: 0, z: 0 },
              west: { x: -1, y: 0, z: 0 },
            };
            const face = faceVectors[faceStr];
            if (!face) return { error: 'face must be one of: up, down, north, south, east, west' };
            const referenceBlock = bot.blockAt(new Vec3(x, y, z));
            if (!referenceBlock) return { error: 'No block at the given position' };
            const faceVec = new Vec3(face.x, face.y, face.z);
            await bot.placeBlock(referenceBlock, faceVec);
            return { success: true, position: { x, y, z }, face: faceStr };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_get_inventory',
        description: 'List items in the bot inventory. Returns slot, name, count, and displayName for each item.',
        parameters: [],
        requiresApproval: false,
        handler: async () => {
          try {
            const bot = await this.getBot();
            const items = bot.inventory.items().map((item) => ({
              slot: item.slot,
              name: item.name,
              count: item.count,
              displayName: item.displayName,
            }));
            return { items, count: items.length };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_equip',
        description: 'Equip an item by name (e.g. diamond_sword) or by slot number. Destination: hand, head, torso, legs, feet, off-hand.',
        parameters: [
          { name: 'item', type: 'string', description: 'Item name (e.g. diamond_pickaxe) or slot number', required: true },
          {
            name: 'destination',
            type: 'string',
            description: 'Equipment slot: hand, head, torso, legs, feet, off-hand',
            required: false,
            enum: ['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'],
          },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const itemStr = String(input.item ?? '').trim();
            const dest = String(input.destination ?? 'hand').toLowerCase();
            const slotNum = Number(itemStr);
            const item = Number.isNaN(slotNum)
              ? bot.inventory.items().find((i) => i.name === itemStr || i.displayName?.toLowerCase().includes(itemStr.toLowerCase()))
              : bot.inventory.slots[slotNum];
            if (!item) return { error: `Item not found: ${itemStr}. Use mc_get_inventory to list items.` };
            const slotMap: Record<string, number> = {
              hand: 0,
              head: 5,
              torso: 6,
              legs: 7,
              feet: 8,
              'off-hand': 45,
            };
            const destination = dest in slotMap ? dest : 'hand';
            await bot.equip(item, destination as 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand');
            return { success: true, item: item.name, slot: item.slot, destination };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_attack',
        description: 'Attack the nearest entity. Optionally filter by entity name (e.g. zombie, sheep) or type. Returns entity name and position.',
        parameters: [
          { name: 'filter', type: 'string', description: 'Optional: entity name or type to target (e.g. zombie, sheep)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const filter = typeof input.filter === 'string' ? input.filter.trim().toLowerCase() : null;
            const entities = Object.values(bot.entities).filter((e) => e.type === 'mob' || e.type === 'player');
            let target = null;
            if (filter) {
              target = entities.find((e) => e.name?.toLowerCase().includes(filter) || e.displayName?.toLowerCase().includes(filter));
              if (!target) {
                const byName = entities.find((e) => e.name === filter);
                if (byName) target = byName;
              }
            } else {
              target = bot.nearestEntity((e) => (e.type === 'mob' || e.type === 'player') && e.position.distanceTo(bot.entity.position) < 4) ?? null;
            }
            if (!target) return { error: filter ? `No entity matching "${filter}" nearby` : 'No entity nearby to attack' };
            await bot.attack(target);
            const pos = target.position;
            return { success: true, entity: target.name ?? target.displayName, position: { x: pos.x, y: pos.y, z: pos.z } };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
      {
        name: 'mc_get_entities_nearby',
        description: 'List entities near the bot within the given radius. Returns name, type, and position for each.',
        parameters: [
          { name: 'radius', type: 'number', description: 'Search radius in blocks (default 16)', required: false },
          { name: 'maxCount', type: 'number', description: 'Max number of entities to return (default 20)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          try {
            const bot = await this.getBot();
            const radius = Math.min(Math.max(Number(input.radius) || 16, 1), 64);
            const maxCount = Math.min(Math.max(Number(input.maxCount) || 20, 1), 50);
            const pos = bot.entity.position;
            const entities = Object.values(bot.entities)
              .filter((e) => e.position.distanceTo(pos) <= radius)
              .slice(0, maxCount)
              .map((e) => {
                const p = e.position;
                return { name: e.name ?? e.displayName, type: e.type, position: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100 } };
              });
            return { entities, count: entities.length, radius };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
    ];
  }
}
