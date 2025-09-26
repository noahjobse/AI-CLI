import * as fs from 'fs-extra';
import * as path from 'path';
import { Config, expandPath } from './config';
import { format } from 'date-fns';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: string;
  tool_call_id?: string;
}

export interface Session {
  paths: {
    file: string;
    monthDir: string;
    index: string;
  };
  messages: SessionMessage[];
  timers: {
    idle?: NodeJS.Timeout;
    warnAt?: number;
    timeoutAt?: number;
  };
  model: string;
  startTime: Date;
  lastActivity: Date;
}

export async function ensureDataDir(config: Config): Promise<void> {
  const dataDir = expandPath(config.dataDir);
  await fs.ensureDir(dataDir);
}

export async function newSession(config: Config): Promise<Session> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  const dataDir = expandPath(config.dataDir);
  const monthDir = path.join(dataDir, String(year), month);
  await fs.ensureDir(monthDir);
  
  const timestamp = `${year}-${month}-${day}_${hour}-${minute}`;
  
  // Start with default name, will be renamed after first prompt
  const sessionName = 'new-session';
  const slug = sessionName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const filename = `${timestamp}_${slug}.md`;
  const filePath = path.join(monthDir, filename);
  const indexPath = path.join(monthDir, 'index.md');
  
  // Write initial session file
  const header = `# AI Session - ${sessionName}

**Model:** ${config.model}
**Started:** ${format(now, 'yyyy-MM-dd HH:mm')}
**Last Updated:** ${format(now, 'yyyy-MM-dd HH:mm')}

---

`;
  
  await fs.writeFile(filePath, header, 'utf8');
  
  const session: Session = {
    paths: {
      file: filePath,
      monthDir,
      index: indexPath
    },
    messages: [],
    timers: {},
    model: config.model,
    startTime: now,
    lastActivity: now
  };
  
  await regenerateIndex(session);
  return session;
}


export async function appendUser(session: Session, text: string): Promise<void> {
  const timestamp = format(new Date(), 'HH:mm:ss');
  const content = `### You\n${text}\n\n`;
  
  await fs.appendFile(session.paths.file, content, 'utf8');
  
  session.messages.push({
    role: 'user',
    content: text,
    ts: timestamp
  });
  
  session.lastActivity = new Date();
  await updateFooter(session);
}

export async function appendAssistant(session: Session, text: string, options: { interrupted?: boolean } = {}): Promise<void> {
  const timestamp = format(new Date(), 'HH:mm:ss');
  const marker = options.interrupted ? ' *(interrupted)*' : '';
  const content = `### ${session.model}\n${text}${marker}\n\n---\n\n`;
  
  await fs.appendFile(session.paths.file, content, 'utf8');
  
  session.messages.push({
    role: 'assistant',
    content: text,
    ts: timestamp
  });
  
  session.lastActivity = new Date();
  await updateFooter(session);
}

export async function rewriteLastAssistant(session: Session, text: string): Promise<void> {
  if (session.messages.length === 0 || session.messages[session.messages.length - 1].role !== 'assistant') {
    throw new Error('No assistant message to rewrite');
  }
  
  // Read current file content
  const content = await fs.readFile(session.paths.file, 'utf8');
  
  // Find the last assistant section and replace it
  const lines = content.split('\n');
  let lastAssistantStart = -1;
  let lastAssistantEnd = -1;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('### ') && !lines[i].startsWith('### You')) {
      lastAssistantStart = i;
      break;
    }
  }
  
  if (lastAssistantStart === -1) {
    throw new Error('Could not find last assistant message');
  }
  
  // Find the end of the assistant message (next ### or end of file)
  for (let i = lastAssistantStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ') || lines[i].startsWith('---')) {
      lastAssistantEnd = i;
      break;
    }
  }
  
  if (lastAssistantEnd === -1) {
    lastAssistantEnd = lines.length;
  }
  
  // Replace the content
  const newContent = [
    ...lines.slice(0, lastAssistantStart),
    `### ${session.model}`,
    text,
    '',
    '---',
    '',
    ...lines.slice(lastAssistantEnd)
  ].join('\n');
  
  await fs.writeFile(session.paths.file, newContent, 'utf8');
  
  // Update in-memory message
  session.messages[session.messages.length - 1].content = text;
  session.lastActivity = new Date();
  await updateFooter(session);
}

export async function removeLastQA(session: Session): Promise<void> {
  if (session.messages.length < 2) {
    throw new Error('No user-assistant pair to remove');
  }
  
  // Read current file content
  const content = await fs.readFile(session.paths.file, 'utf8');
  const lines = content.split('\n');
  
  // Find the last user message start
  let lastUserStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === '### You') {
      lastUserStart = i;
      break;
    }
  }
  
  if (lastUserStart === -1) {
    throw new Error('Could not find last user message');
  }
  
  // Remove from last user message to end, then add back the footer
  const beforeUser = lines.slice(0, lastUserStart);
  const newContent = beforeUser.join('\n') + '\n';
  
  await fs.writeFile(session.paths.file, newContent, 'utf8');
  
  // Remove last two messages from memory
  session.messages.pop(); // assistant
  session.messages.pop(); // user
  
  session.lastActivity = new Date();
  await updateFooter(session);
}

export async function updateFooter(session: Session): Promise<void> {
  const content = await fs.readFile(session.paths.file, 'utf8');
  
  // Calculate approximate tokens and cost
  const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  
  const duration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const now = new Date();
  const footer = `---

**Model:** ${session.model}
**Started:** ${format(session.startTime, 'yyyy-MM-dd HH:mm')}
**Last Updated:** ${format(now, 'yyyy-MM-dd HH:mm')}
**Tokens (est.):** ${estimatedTokens}
**Duration:** ${durationStr}

`;
  
  // Remove existing footer and add new one
  const lines = content.split('\n');
  let footerStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('**Model:**')) {
      footerStart = i;
      break;
    }
  }
  
  let newContent;
  if (footerStart !== -1) {
    newContent = [...lines.slice(0, footerStart), ...footer.split('\n')].join('\n');
  } else {
    newContent = content + '\n' + footer;
  }
  
  await fs.writeFile(session.paths.file, newContent, 'utf8');
}

export async function regenerateIndex(session: Session): Promise<void> {
  const sessionsDir = path.dirname(session.paths.monthDir);
  const monthDir = session.paths.monthDir;
  const indexPath = session.paths.index;
  
  // Find all session files in this month
  const files = await fs.readdir(monthDir);
  const sessionFiles = files
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .sort()
    .reverse(); // Most recent first
  
  const sessions = [];
  for (const file of sessionFiles) {
    const filePath = path.join(monthDir, file);
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    
    // Extract title from first line
    const firstLine = content.split('\n')[0];
    const title = firstLine.replace(/^# AI Session - /, '') || 'Untitled';
    
    // Calculate duration from footer
    const durationMatch = content.match(/\*\*Duration:\*\* (.+)/);
    const duration = durationMatch ? durationMatch[1] : '00:00:00';
    
    // Extract token count
    const tokenMatch = content.match(/\*\*Tokens \(est\.\):\*\* (\d+)/);
    const tokens = tokenMatch ? parseInt(tokenMatch[1]) : 0;
    
    sessions.push({
      file,
      title,
      tokens,
      duration,
      date: stats.mtime
    });
  }
  
  const monthName = path.basename(monthDir);
  const year = path.basename(path.dirname(monthDir));
  
  const indexContent = `# AI Sessions - ${year}-${monthName}

| Date | Title | Tokens | Duration | Path |
|------|-------|--------|----------|------|
${sessions.map(s => `| ${format(s.date, 'MM-dd HH:mm')} | ${s.title} | ${s.tokens} | ${s.duration} | [${s.file}](./${s.file}) |`).join('\n')}

`;
  
  await fs.writeFile(indexPath, indexContent, 'utf8');
}

export async function updateSessionTitle(session: Session, newTitle: string): Promise<void> {
  // Read current file content
  const content = await fs.readFile(session.paths.file, 'utf8');
  const lines = content.split('\n');
  
  // Update the first line (title)
  lines[0] = `# AI Session - ${newTitle}`;
  
  // Write back to file
  const newContent = lines.join('\n');
  await fs.writeFile(session.paths.file, newContent, 'utf8');
  
  // Regenerate index to reflect the new title
  await regenerateIndex(session);
}

export async function renameSessionFromFirstPrompt(
  session: Session, 
  firstPrompt: string, 
  apiKey?: string,
  attachedFiles?: string[]
): Promise<void> {
  let sessionName: string;
  
  // Try AI-generated naming first if API key is available
  if (apiKey) {
    try {
      const { generateSessionName } = await import('../adapters/openai');
      sessionName = await generateSessionName(apiKey, firstPrompt, attachedFiles);
    } catch (error) {
      console.warn(`[warning] AI naming failed, using fallback: ${error}`);
      sessionName = generateSessionNameFromPrompt(firstPrompt);
    }
  } else {
    // Fallback to simple prompt-based naming
    sessionName = generateSessionNameFromPrompt(firstPrompt);
  }
  
  const slug = sessionName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  
  // Create new filename with the same timestamp but new slug
  const timestamp = path.basename(session.paths.file).split('_')[0] + '_' + path.basename(session.paths.file).split('_')[1];
  const newFilename = `${timestamp}_${slug}.md`;
  const newFilePath = path.join(session.paths.monthDir, newFilename);
  
  // Only rename if the filename would actually change
  if (newFilePath !== session.paths.file) {
    // Move the file
    await fs.move(session.paths.file, newFilePath);
    
    // Update session paths
    session.paths.file = newFilePath;
    
    // Update the title in the file
    await updateSessionTitle(session, sessionName);
  }
}

function generateSessionNameFromPrompt(prompt: string): string {
  // Clean up the prompt
  let name = prompt.trim();
  
  // Remove common question words and phrases
  name = name.replace(/^(what|how|why|when|where|can you|could you|please|help me|i need|i want|i'm trying|i'm looking for|i'm working on|i'm building|i'm creating|i'm developing|i'm learning|i'm studying|i'm researching|i'm debugging|i'm fixing|i'm optimizing|i'm refactoring|i'm implementing|i'm designing|i'm planning|i'm thinking about|i'm wondering|i'm curious about|i'm confused about|i'm stuck on|i'm having trouble with|i'm struggling with|i'm having issues with|i'm having problems with|i'm having difficulty with|i'm having a hard time with|i'm having trouble|i'm having issues|i'm having problems|i'm having difficulty|i'm having a hard time|i'm stuck|i'm confused|i'm wondering|i'm curious|i'm thinking|i'm planning|i'm designing|i'm implementing|i'm refactoring|i'm optimizing|i'm fixing|i'm debugging|i'm researching|i'm studying|i'm learning|i'm developing|i'm creating|i'm building|i'm working|i'm looking|i need|i want|i'm trying|help|please|can|could|what|how|why|when|where)\s+/i, '');
  
  // Remove question marks and other punctuation at the end
  name = name.replace(/[?!.]+$/, '');
  
  // Limit length and clean up
  name = name.substring(0, 50).trim();
  
  // If it's too short or empty, use a generic name
  if (name.length < 3) {
    name = 'New Session';
  }
  
  return name;
}

export function resetIdleTimer(session: Session, config: Config): void {
  // Clear existing timer
  if (session.timers.idle) {
    clearTimeout(session.timers.idle);
  }
  
  const timeoutMs = config.timeoutMinutes * 60 * 1000;
  const warnMs = config.warnBeforeTimeoutSeconds * 1000;
  
  session.timers.warnAt = Date.now() + timeoutMs - warnMs;
  session.timers.timeoutAt = Date.now() + timeoutMs;
  
  session.timers.idle = setTimeout(() => {
    // Timeout warning
    if (Date.now() >= session.timers.warnAt! && Date.now() < session.timers.timeoutAt!) {
      console.log(`\n[warning] Session will timeout in 2 minutes due to inactivity`);
    } else if (Date.now() >= session.timers.timeoutAt!) {
      // Actual timeout
      console.log(`\n[timeout] Session timed out after ${config.timeoutMinutes}m of inactivity`);
      process.exit(0);
    }
  }, warnMs);
}


