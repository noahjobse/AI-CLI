import * as fs from 'fs-extra';
import * as path from 'path';
import { Session } from './session';
import { logAttachment } from './logger';
import { Config, expandPath } from './config';

export interface AttachedFile {
  path: string;
  content: string;
  truncated: boolean;
}

export async function attachFiles(filePaths: string[], session: Session, config: Config): Promise<AttachedFile[]> {
  const attachedFiles: AttachedFile[] = [];
  
  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(filePath);
    
    if (!await fs.pathExists(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }
    
    const maxBytes = config.maxAttachBytes;
    let content: string;
    let truncated = false;
    
    if (stats.size <= maxBytes) {
      content = await fs.readFile(resolvedPath, 'utf8');
    } else {
      // Truncate large files
      const buffer = await fs.readFile(resolvedPath);
      const head = buffer.slice(0, 1024).toString('utf8');
      const tail = buffer.slice(-1024).toString('utf8');
      content = `${head}\n\n... [truncated ${stats.size - 2048} bytes] ...\n\n${tail}`;
      truncated = true;
    }
    
    attachedFiles.push({
      path: resolvedPath,
      content,
      truncated
    });
    
    await logAttachment(session, resolvedPath, stats.size);
  }
  
  return attachedFiles;
}


