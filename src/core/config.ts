import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const ConfigSchema = z.object({
  version: z.number().default(1),
  model: z.string().default('gpt-5-mini'),
  dataDir: z.string().default('~/ai-sessions'),
  timeoutMinutes: z.number().default(30),
  warnBeforeTimeoutSeconds: z.number().default(120),
  responseSpeed: z.enum(['fast', 'balanced', 'readable']).default('fast'),
  // Search is now handled by OpenAI web_search tool only
  maxAttachBytes: z.number().default(204800),
  importContextTokens: z.number().default(4000),
  modelAliases: z.record(z.string()).default({
    'mini': 'gpt-5-mini',
    'nano': 'gpt-5-nano',
    'gpt5': 'gpt-5',
    'gpt4': 'gpt-4o',
    'gpt4turbo': 'gpt-4-turbo',
    'fast': 'gpt-3.5-turbo'
  }),
  costsPer1kTokens: z.record(z.object({
    input: z.number(),
    output: z.number()
  })).default({
    'gpt-5-nano': { input: 0.00005, output: 0.00015 },
    'gpt-5-mini': { input: 0.0001, output: 0.0003 },
    'gpt-5': { input: 0.0005, output: 0.0015 },
    'gpt-4o': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.00005, output: 0.00015 }
  }),
  keyStorage: z.object({
    method: z.enum(['keytar', 'local']).default('keytar'),
    local: z.object({
      encryptedKeyPath: z.string().default('~/.aicli/key.enc'),
      saltPath: z.string().default('~/.aicli/key.salt'),
      ivPath: z.string().default('~/.aicli/key.iv')
    }).optional()
  }).default({
    method: 'keytar',
    local: {
      encryptedKeyPath: '~/.aicli/key.enc',
      saltPath: '~/.aicli/key.salt',
      ivPath: '~/.aicli/key.iv'
    }
  })
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = path.join(os.homedir(), '.aicli', 'config.yaml');

export async function loadConfig(): Promise<Config> {
  try {
    if (await fs.pathExists(CONFIG_PATH)) {
      const yaml = await import('yaml');
      const content = await fs.readFile(CONFIG_PATH, 'utf8');
      const parsed = yaml.parse(content);
      return ConfigSchema.parse(parsed);
    }
  } catch (error) {
    console.warn(`[warn] Failed to load config: ${error}`);
  }
  
  // Return default config
  const defaultConfig = ConfigSchema.parse({});
  await saveConfig(defaultConfig);
  return defaultConfig;
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(CONFIG_PATH));
    const yaml = await import('yaml');
    const content = yaml.stringify(config);
    await fs.writeFile(CONFIG_PATH, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

export function resolveModelAlias(modelName: string, config: Config): string {
  return config.modelAliases[modelName] || modelName;
}
