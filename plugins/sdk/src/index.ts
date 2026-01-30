/**
 * Whisper Weave Plugin SDK
 *
 * This package provides the types and utilities needed to build external plugins
 * for Whisper Weave.
 *
 * @example
 * ```typescript
 * import type { PluginBase, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';
 *
 * export default class MyPlugin implements PluginBase, ToolsCapability {
 *   readonly metadata = {
 *     id: 'my-plugin',
 *     name: 'My Plugin',
 *     description: 'Does something useful',
 *     version: '1.0.0',
 *   };
 *
 *   async shutdown() {}
 *
 *   getTools(): ToolWithHandler[] {
 *     return [{
 *       name: 'my_tool',
 *       description: 'Does something',
 *       parameters: [],
 *       requiresApproval: false,
 *       handler: async (input, context) => {
 *         return { result: 'done' };
 *       },
 *     }];
 *   }
 * }
 * ```
 */

export type {
  Attachment,
  Message,
  SendMessageOptions,
  SlashCommandContext,
  ClearChannelHistoryResult,
  LLMImagePart,
  LLMMessage,
  ToolUse,
  LLMResponse,
  LLMGenerateOptions,
  Model,
  ToolParameter,
  Tool,
  ToolContext,
  ToolHandler,
  ToolWithHandler,
  Connector,
  LLM,
  PluginMetadata,
  PluginBase,
  ConnectorCapability,
  LLMCapability,
  ToolsCapability,
  PluginConstructor,
} from './types';
export type { PluginFeature, PluginConfigField, PluginManifest } from './manifest';
export { validateManifest } from './manifest';
