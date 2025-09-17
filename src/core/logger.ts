import * as fs from 'fs-extra';
import * as path from 'path';
import { Session } from './session';

export async function logAttachment(session: Session, filePath: string, size: number): Promise<void> {
  const content = `> Attached: ${filePath} (${size} bytes)\n\n`;
  await fs.appendFile(session.paths.file, content, 'utf8');
}

export async function logImport(session: Session, sourceFile: string, tokenCount: number): Promise<void> {
  const content = `> Imported context from ${sourceFile} (approx ${tokenCount} tokens)\n\n`;
  await fs.appendFile(session.paths.file, content, 'utf8');
}

export async function logTimeout(session: Session, timeoutMinutes: number): Promise<void> {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const content = `> Session timed out after ${timeoutMinutes}m of inactivity (ended at ${timeStr}).\n\n`;
  await fs.appendFile(session.paths.file, content, 'utf8');
}

export async function logSummary(session: Session, summary: string): Promise<void> {
  const content = `\n## Session Summary\n\n${summary}\n\n`;
  await fs.appendFile(session.paths.file, content, 'utf8');
}


