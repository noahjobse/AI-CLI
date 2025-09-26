import * as fs from 'fs-extra';
import * as path from 'path';
import { Session } from './session';
import { logImport } from './logger';
import { Config, expandPath } from './config';

export async function importContext(sessionNumber: number, currentSession: Session, config: Config): Promise<string> {
  // Find the session file
  const sessionsDir = currentSession.paths.monthDir;
  const files = await fs.readdir(sessionsDir);
  const sessionFiles = files
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .sort()
    .reverse(); // Most recent first
  
  if (sessionNumber < 1 || sessionNumber > sessionFiles.length) {
    throw new Error(`Invalid session number: ${sessionNumber}`);
  }
  
  const targetFile = sessionFiles[sessionNumber - 1];
  const targetPath = path.join(sessionsDir, targetFile);
  
  // Read the session content
  const content = await fs.readFile(targetPath, 'utf8');
  
  // Extract messages from the session
  const messages = parseSessionMessages(content);
  
  // Take the last ~4K tokens worth of content
  const maxTokens = config.importContextTokens;
  const selectedMessages = selectMessagesForImport(messages, maxTokens);
  
  // Convert to context string
  const context = selectedMessages.map(msg => 
    `${msg.role}: ${msg.content}`
  ).join('\n\n');
  
  // Log the import
  const tokenCount = Math.ceil(context.length / 4);
  await logImport(currentSession, targetFile, tokenCount);
  
  return context;
}

function parseSessionMessages(content: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const lines = content.split('\n');
  
  let currentMessage: { role: 'user' | 'assistant'; content: string } | null = null;
  
  for (const line of lines) {
    if (line.startsWith('### You')) {
      if (currentMessage) {
        messages.push(currentMessage);
      }
      currentMessage = { role: 'user', content: '' };
    } else if (line.startsWith('### ')) {
      if (currentMessage) {
        messages.push(currentMessage);
      }
      currentMessage = { role: 'assistant', content: '' };
    } else if (currentMessage && !line.startsWith('---') && !line.startsWith('**')) {
      if (currentMessage.content) {
        currentMessage.content += '\n';
      }
      currentMessage.content += line;
    }
  }
  
  if (currentMessage) {
    messages.push(currentMessage);
  }
  
  return messages;
}

function selectMessagesForImport(messages: Array<{ role: 'user' | 'assistant'; content: string }>, maxTokens: number): Array<{ role: 'user' | 'assistant'; content: string }> {
  const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let tokenCount = 0;
  
  // Start from the end and work backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = Math.ceil(message.content.length / 4);
    
    if (tokenCount + messageTokens > maxTokens) {
      break;
    }
    
    selected.unshift(message);
    tokenCount += messageTokens;
  }
  
  return selected;
}


