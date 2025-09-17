import { Session } from './session';
import { Config, saveConfig } from './config';
import { getApiKey, setApiKey } from './keychain';
import { streamChat } from '../adapters/openai';
// Search is now handled by OpenAI web_search tool only
import { attachFiles } from './attach';
import { importContext } from './import';
import { calculateStats } from './stats';
import { logSummary } from './logger';
import { renderSearchResults, renderError, renderSuccess, renderInfo } from './renderer';
import { resolveModelAlias } from './config';
import * as clipboardy from 'clipboardy';
import * as fs from 'fs-extra';
import * as path from 'path';
import { expandPath } from './config';

export interface CommandContext {
  session: Session;
  config: Config;
  attachedFiles: Array<{ path: string; content: string; truncated: boolean }>;
  context: string;
}

export interface CommandResult {
  handled: boolean;
  output?: string;
  skipPrompt?: boolean;
}

export class CommandHandler {
  public context: CommandContext;
  
  constructor(context: CommandContext) {
    this.context = context;
  }
  
  async handleCommand(input: string): Promise<CommandResult> {
    const trimmed = input.trim();
    
    if (!trimmed.startsWith(':')) {
      return { handled: false };
    }
    
    const [command, ...args] = trimmed.slice(1).split(' ');
    
    try {
      switch (command) {
        case 'help':
          return { handled: true, output: this.getHelpText() };
        
        case 'history':
          return { handled: true, output: this.handleHistory() };
        
        case 'settings':
          return { handled: true, output: await this.handleSettings() };
        
        case 'config':
          return { handled: true, output: await this.handleConfig() };
        
        case 'model':
          return { handled: true, output: await this.handleModelSwitch(args[0]) };
        
        case 'redo':
          return { handled: true, output: await this.handleRedo() };
        
        case 'undo':
          return { handled: true, output: await this.handleUndo() };
        
        case 'recall':
          return { handled: true, output: await this.handleRecall() };
        
        case 'resume':
          return { handled: true, output: await this.handleResume(parseInt(args[0])) };
        
        case 'find':
          return { handled: true, output: await this.handleFind(args.join(' ')) };
        
        case 'delete':
          return { handled: true, output: await this.handleDelete(args[0]) };
        
        case 'rename':
          return { handled: true, output: await this.handleRename(parseInt(args[0]), args[1]) };
        
        case 'search':
          return { handled: true, output: await this.handleSearch(args.join(' ')) };
        
        case 'provider':
          return { handled: true, output: await this.handleProvider(args[0]) };
        
        case 'file':
          return { handled: true, output: await this.handleFile(args) };
        
        case 'import':
          return { handled: true, output: await this.handleImport(parseInt(args[0])) };
        
        case 'summarize':
          return { handled: true, output: await this.handleSummarize() };
        
        case 'copy':
          return { handled: true, output: await this.handleCopy(parseInt(args[0])) };
        
        case 'stats':
          return { handled: true, output: await this.handleStats() };
        
        case 'export':
          return { handled: true, output: await this.handleExport(args[0]) };
        
        case 'version':
          return { handled: true, output: this.handleVersion() };
        
        case 'apikey':
          return { handled: true, output: await this.handleApiKey() };
        
        case 'name':
          return { handled: true, output: await this.handleName(args.join(' ')) };
        
        default:
          return { handled: true, output: renderError(`Unknown command: ${command}`) };
      }
    } catch (error) {
      return { handled: true, output: renderError(`Command failed: ${error}`) };
    }
  }
  
  private getHelpText(): string {
    const aliases = Object.entries(this.context.config.modelAliases)
      .map(([alias, model]) => `  ${alias} → ${model}`)
      .join('\n');
    
    return `
Available commands:
  :help              Show this help
  :history           Show command history
  :settings          View/edit settings
  :config            Open config in editor
  :model <name>      Switch model
  :redo              Rerun last prompt
  :undo              Remove last Q+A pair
  :recall            List current month sessions
  :resume <n>        Resume session n
  :find <keyword>    Search current month
  :delete <n|all>    Delete session n or all sessions
  :rename <n> <slug> Rename session n
  :search <query>    Web search
  :provider <name>   Switch search provider
  :file <path...>    Attach files
  :import <n>        Import context from session n
  :summarize         Generate session summary
  :copy <n>          Copy code block n
  :stats             Show session stats
  :export <path>     Export current session
  :version           Show version
  :apikey            Set API key
  :name <title>      Set custom name for current session

Model aliases:
${aliases}
`;
  }
  
  private handleHistory(): string {
    const userMessages = this.context.session.messages.filter(msg => msg.role === 'user');
    
    if (userMessages.length === 0) {
      return 'No command history available.';
    }
    
    const history = userMessages.map((msg, index) => {
      const timestamp = msg.ts || 'unknown';
      return `${index + 1}. [${timestamp}] ${msg.content}`;
    }).join('\n');
    
    return `Command History (${userMessages.length} messages):\n${history}`;
  }
  
  private async handleSettings(): Promise<string> {
    // For now, just show current settings
    return `Current settings:
Model: ${this.context.config.model}
Data dir: ${this.context.config.dataDir}
Timeout: ${this.context.config.timeoutMinutes}m
        Search: OpenAI web_search tool
Max attach size: ${this.context.config.maxAttachBytes} bytes`;
  }
  
  private async handleConfig(): Promise<string> {
    const configPath = path.join(require('os').homedir(), '.aicli', 'config.yaml');
    const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
    
    // Open config in editor
    const { spawn } = require('child_process');
    spawn(editor, [configPath], { stdio: 'inherit' });
    
    return renderInfo('Opening config in editor...');
  }
  
  private async handleModelSwitch(modelName: string): Promise<string> {
    const resolvedModel = this.context.config.modelAliases[modelName] || modelName;
    
    // Validate model
    const validModels = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    if (!validModels.includes(resolvedModel)) {
      return renderError(`Invalid model: ${resolvedModel}. Valid options: ${validModels.join(', ')}`);
    }
    
    this.context.config.model = resolvedModel;
    await saveConfig(this.context.config);
    
    const aliasInfo = modelName !== resolvedModel ? ` (alias for ${resolvedModel})` : '';
    return `Switched to model: ${resolvedModel}${aliasInfo}`;
  }
  
  private async handleRedo(): Promise<string> {
    if (this.context.session.messages.length === 0) {
      return renderError('No messages to redo');
    }
    
    const lastUserMessage = this.context.session.messages[this.context.session.messages.length - 1];
    if (lastUserMessage.role !== 'user') {
      return renderError('Last message is not from user');
    }
    
    // Get API key
    const apiKey = await getApiKey(this.context.config);
    if (!apiKey) {
      return renderError('API key not set. Use :apikey to set it.');
    }
    
    // Stream new response
    const messages = this.context.session.messages.slice(0, -1); // Remove last assistant message
    const stream = streamChat(apiKey, this.context.session.model, messages);
    
    let response = '';
    for await (const chunk of stream) {
      if (chunk.error) {
        return renderError(`Streaming error: ${chunk.error}`);
      }
      response += chunk.content;
      if (chunk.finished) break;
    }
    
    // Rewrite the last assistant message
    const { rewriteLastAssistant } = await import('./session');
    await rewriteLastAssistant(this.context.session, response);
    
    return renderSuccess('Redid last prompt');
  }
  
  private async handleUndo(): Promise<string> {
    const { removeLastQA } = await import('./session');
    await removeLastQA(this.context.session);
    return renderSuccess('Removed last Q+A pair');
  }
  
  private async handleRecall(): Promise<string> {
    const { getSessionCompletions } = await import('./autocomplete');
    const completions = await getSessionCompletions(this.context.session.paths.monthDir);
    
    if (completions.length === 0) {
      return 'No sessions found in current month.';
    }
    
    return completions.join('\n');
  }
  
  private async handleResume(sessionNumber: number): Promise<string> {
    if (!sessionNumber) {
      return renderError('Session number required');
    }
    
    // This would require more complex session switching logic
    return renderError('Resume not yet implemented');
  }
  
  private async handleFind(keyword: string): Promise<string> {
    if (!keyword) {
      return renderError('Search keyword required');
    }
    
    // Simple file search implementation
    const files = await fs.readdir(this.context.session.paths.monthDir);
    const sessionFiles = files.filter(f => f.endsWith('.md') && f !== 'index.md');
    
    const results = [];
    for (const file of sessionFiles) {
      const content = await fs.readFile(path.join(this.context.session.paths.monthDir, file), 'utf8');
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        results.push(file);
      }
    }
    
    return results.length > 0 ? results.join('\n') : 'No matches found.';
  }
  
  private async handleDelete(deleteArg: string): Promise<string> {
    if (!deleteArg) {
      return renderError('Session number or "all" required');
    }
    
    if (deleteArg.toLowerCase() === 'all') {
      return await this.handleDeleteAll();
    }
    
    const sessionNumber = parseInt(deleteArg);
    if (isNaN(sessionNumber)) {
      return renderError('Invalid session number');
    }
    
    return await this.handleDeleteSession(sessionNumber);
  }
  
  private async handleDeleteSession(sessionNumber: number): Promise<string> {
    try {
      // Get list of sessions
      const { getSessionCompletions } = await import('./autocomplete');
      const completions = await getSessionCompletions(this.context.session.paths.monthDir);
      
      if (sessionNumber < 1 || sessionNumber > completions.length) {
        return renderError(`Session number must be between 1 and ${completions.length}`);
      }
      
      // Get the actual filename
      const files = await fs.readdir(this.context.session.paths.monthDir);
      const sessionFiles = files
        .filter(f => f.endsWith('.md') && f !== 'index.md')
        .sort()
        .reverse(); // Most recent first
      
      const targetFile = sessionFiles[sessionNumber - 1];
      const filePath = path.join(this.context.session.paths.monthDir, targetFile);
      
      // Check if it's the current session
      if (filePath === this.context.session.paths.file) {
        return renderError('Cannot delete current session');
      }
      
      // Delete the file
      await fs.remove(filePath);
      
      // Regenerate index
      const { regenerateIndex } = await import('./session');
      await regenerateIndex(this.context.session);
      
      return renderSuccess(`Deleted session ${sessionNumber}: ${targetFile}`);
    } catch (error) {
      return renderError(`Failed to delete session: ${error}`);
    }
  }
  
  private async handleDeleteAll(): Promise<string> {
    try {
      // Get all session files
      const files = await fs.readdir(this.context.session.paths.monthDir);
      const sessionFiles = files
        .filter(f => f.endsWith('.md') && f !== 'index.md');
      
      if (sessionFiles.length === 0) {
        return renderInfo('No sessions to delete');
      }
      
      // Delete all session files except current one
      const currentFile = path.basename(this.context.session.paths.file);
      const filesToDelete = sessionFiles.filter(f => f !== currentFile);
      
      if (filesToDelete.length === 0) {
        return renderInfo('Only current session exists, nothing to delete');
      }
      
      // Delete files
      for (const file of filesToDelete) {
        const filePath = path.join(this.context.session.paths.monthDir, file);
        await fs.remove(filePath);
      }
      
      // Regenerate index
      const { regenerateIndex } = await import('./session');
      await regenerateIndex(this.context.session);
      
      return renderSuccess(`Deleted ${filesToDelete.length} session(s). Current session preserved.`);
    } catch (error) {
      return renderError(`Failed to delete sessions: ${error}`);
    }
  }
  
  private async handleRename(sessionNumber: number, newSlug: string): Promise<string> {
    if (!sessionNumber || !newSlug) {
      return renderError('Session number and new slug required');
    }
    
    // Implementation would require file renaming and index update
    return renderError('Rename not yet implemented');
  }
  
  private async handleSearch(query: string): Promise<string> {
    if (!query) {
      return renderError('Search query required');
    }
    
    // Return a special marker to indicate this should be handled as streaming search
    return `__SEARCH_STREAM__:${query}`;
  }
  
  private async handleProvider(providerName: string): Promise<string> {
    return renderError('Search provider switching is no longer available. All searches use OpenAI web_search tool.');
  }
  
  private async handleFile(filePaths: string[]): Promise<string> {
    if (filePaths.length === 0) {
      return renderError('File paths required');
    }
    
    try {
      const attachedFiles = await attachFiles(filePaths, this.context.session, this.context.config);
      this.context.attachedFiles.push(...attachedFiles);
      
      return renderSuccess(`Attached ${attachedFiles.length} file(s)`);
    } catch (error) {
      return renderError(`Failed to attach files: ${error}`);
    }
  }
  
  private async handleImport(sessionNumber: number): Promise<string> {
    if (!sessionNumber) {
      return renderError('Session number required');
    }
    
    try {
      const context = await importContext(sessionNumber, this.context.session, this.context.config);
      this.context.context += '\n\n' + context;
      
      return renderSuccess(`Imported context from session ${sessionNumber}`);
    } catch (error) {
      return renderError(`Failed to import context: ${error}`);
    }
  }
  
  private async handleSummarize(): Promise<string> {
    const apiKey = await getApiKey(this.context.config);
    if (!apiKey) {
      return renderError('API key not set. Use :apikey to set it.');
    }
    
    try {
      const { generateSummary } = await import('../adapters/openai');
      const summary = await generateSummary(apiKey, this.context.session.model, this.context.session.messages);
      
      await logSummary(this.context.session, summary);
      
      return `Session Summary:\n\n${summary}`;
    } catch (error) {
      return renderError(`Failed to generate summary: ${error}`);
    }
  }
  
  private async handleCopy(blockNumber: number): Promise<string> {
    if (!blockNumber) {
      return renderError('Code block number required');
    }
    
    // This would require parsing the last assistant message for code blocks
    return renderError('Copy not yet implemented');
  }
  
  private async handleStats(): Promise<string> {
    const stats = calculateStats(this.context.session, this.context.config);
    
    return `Session Statistics:
Messages: ${stats.messages}
Tokens: ${stats.tokens}
Cost: $${stats.cost}
Duration: ${stats.duration}`;
  }
  
  private async handleExport(exportPath: string): Promise<string> {
    if (!exportPath) {
      return renderError('Export path required');
    }
    
    try {
      const resolvedPath = path.resolve(exportPath);
      await fs.copy(this.context.session.paths.file, resolvedPath);
      
      return renderSuccess(`Exported session to: ${resolvedPath}`);
    } catch (error) {
      return renderError(`Failed to export: ${error}`);
    }
  }
  
  private handleVersion(): string {
    return 'AI CLI v1.0.0';
  }
  
  private async handleApiKey(): Promise<string> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Enter your OpenAI API key: ', async (apiKey: string) => {
        rl.close();
        
        if (!apiKey.trim()) {
          resolve(renderError('API key cannot be empty'));
          return;
        }
        
        try {
          await setApiKey(apiKey.trim(), this.context.config);
          resolve(renderSuccess('API key saved successfully'));
        } catch (error) {
          resolve(renderError(`Failed to save API key: ${error}`));
        }
      });
    });
  }
  
  private async handleName(title: string): Promise<string> {
    if (!title.trim()) {
      return renderError('Session title required');
    }
    
    try {
      // Update the session file with new title
      const { updateSessionTitle } = await import('./session');
      await updateSessionTitle(this.context.session, title.trim());
      
      return renderSuccess(`Session renamed to: ${title.trim()}`);
    } catch (error) {
      return renderError(`Failed to rename session: ${error}`);
    }
  }
}
