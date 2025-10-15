import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

type Plain = Record<string, unknown>;
export interface ConfigSnapshot { data: Plain; sources: Record<string, string>; hash: string; loadedAt: Date; }
export interface ConfigManagerOptions { rootDir: string; envPrefix?: string; cliOverrides?: Plain; watch?: boolean; }

const LAYERS: Array<[string, string]> = [['defaults', 'defaults.yml'], ['chains', 'chains.yml'], ['providers.sx', 'providers/sx.yml'], ['providers.azuro', 'providers/azuro.yml'], ['exec', 'exec.yml'], ['risk', 'risk.yml']];
const RULEPACK_EXT = /\.(ya?ml|json)$/i; const isRecord = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);
const merge = (target: Plain, source: Plain, sources: Record<string, string>, origin: string, prefix = ''): void => {
  for (const [key, value] of Object.entries(source)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) { const bucket = (target[key] as Plain) ?? {}; target[key] = bucket; merge(bucket, value, sources, origin, next); }
    else target[key] = value;
    sources[next] = origin;
  }
};

export class ConfigManager extends EventEmitter {
  private snapshot: ConfigSnapshot | null = null; private watcher: ReturnType<typeof watch> | null = null; private readonly options: Required<ConfigManagerOptions>;

  constructor(options: ConfigManagerOptions) {
    super();
    this.options = { watch: true, envPrefix: 'OTTER_CONFIG', cliOverrides: {}, ...options } as Required<ConfigManagerOptions>;
  }

  async start(): Promise<ConfigSnapshot> {
    const snap = await this.reload();
    if (this.options.watch && !this.watcher) {
      const dir = path.join(this.options.rootDir, 'config');
      this.watcher = watch(dir, { recursive: true }, async () => this.emit('reload', await this.reload()));
    }
    return snap;
  }

  stop(): void { this.watcher?.close(); this.watcher = null; }

  getSnapshot(): ConfigSnapshot { if (!this.snapshot) throw new Error('Config not loaded'); return this.snapshot; }

  async reload(): Promise<ConfigSnapshot> {
    const root = path.join(this.options.rootDir, 'config');
    const data: Plain = {}; const sources: Record<string, string> = {};
    for (const [label, relative] of LAYERS) {
      const filePath = path.join(root, relative);
      merge(data, await this.readConfigFile(filePath), sources, `file:${filePath}`, label);
      console.info(`[ConfigManager] layer:${label} source:file ${filePath}`);
    }
    try {
      const dir = path.join(root, 'rulepacks');
      for (const file of (await readdir(dir)).filter((name: string) => RULEPACK_EXT.test(name))) {
        const slug = file.replace(RULEPACK_EXT, '');
        merge(data, { rulepacks: { [slug]: await this.readConfigFile(path.join(dir, file)) } }, sources, `file:rulepacks/${slug}`, `rulepacks.${slug}`);
        console.info(`[ConfigManager] layer:rulepack/${slug} source:file rulepacks/${slug}`);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const [label, layer, origin] of [['env', this.readEnvOverrides(), 'env'], ['cli', this.options.cliOverrides, 'cli']] as Array<[string, Plain, string]>) {
      if (Object.keys(layer).length) { merge(data, layer, sources, origin, label); console.info(`[ConfigManager] layer:${label} source:${origin}`); }
    }
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return (this.snapshot = { data, sources, hash, loadedAt: new Date() });
  }

  private async readConfigFile(filePath: string): Promise<Plain> {
    try {
      const parsed = YAML.parse(await readFile(filePath, 'utf8'));
      return isRecord(parsed) ? (parsed as Plain) : {};
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }

  private readEnvOverrides(): Plain {
    const prefix = `${this.options.envPrefix}__`; const overrides: Plain = {};
    for (const [rawKey, rawValue] of Object.entries(process.env)) {
      if (!rawKey.startsWith(prefix) || rawValue === undefined) continue;
      const segments = rawKey.slice(prefix.length).split('__').map((segment) => segment.toLowerCase());
      const value = this.parseEnvValue(rawValue);
      segments.reduce<Plain>((acc, segment, index) => {
        if (index === segments.length - 1) acc[segment] = value;
        else {
          const next = acc[segment];
          if (!isRecord(next)) acc[segment] = {};
          return acc[segment] as Plain;
        }
        return acc;
      }, overrides);
    }
    return overrides;
  }

  private parseEnvValue(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!Number.isNaN(num) && value.trim() !== '') return num;
    try { return JSON.parse(value); } catch { return value; }
  }
}
