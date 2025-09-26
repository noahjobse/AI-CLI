import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

export async function safeRename(oldPath: string, newPath: string): Promise<void> {
  try {
    await fs.rename(oldPath, newPath);
  } catch (error) {
    throw new Error(`Failed to rename ${oldPath} to ${newPath}: ${error}`);
  }
}

export async function safeDelete(filePath: string): Promise<void> {
  try {
    await fs.remove(filePath);
  } catch (error) {
    throw new Error(`Failed to delete ${filePath}: ${error}`);
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

export async function pathExists(filePath: string): Promise<boolean> {
  return await fs.pathExists(filePath);
}


