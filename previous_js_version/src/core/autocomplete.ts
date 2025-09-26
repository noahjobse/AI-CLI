import * as fs from 'fs-extra';
import * as path from 'path';

export async function getSessionCompletions(sessionDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(sessionDir);
    const sessionFiles = files
      .filter(f => f.endsWith('.md') && f !== 'index.md')
      .sort()
      .reverse(); // Most recent first
    
    const completions = [];
    for (let i = 0; i < sessionFiles.length; i++) {
      const file = sessionFiles[i];
      const number = i + 1;
      
      try {
        // Read the file to get the actual title
        const filePath = path.join(sessionDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const firstLine = content.split('\n')[0];
        const title = firstLine.replace(/^# AI Session - /, '') || 'Untitled';
        completions.push(`${number}: ${title}`);
      } catch (error) {
        // Fallback to filename if reading fails
        const title = file.replace(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_/, '').replace('.md', '');
        completions.push(`${number}: ${title}`);
      }
    }
    
    return completions;
  } catch (error) {
    return [];
  }
}

export function parseSessionNumber(input: string): number | null {
  const match = input.match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
}


