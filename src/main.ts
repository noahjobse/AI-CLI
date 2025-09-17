import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadConfig } from './core/config';
import { ensureDataDir, newSession } from './core/session';
import { banner } from './ui/banner';
import { createRepl } from './ui/input';
import { renderInfo, renderWarning } from './core/renderer';
import { getSystemPrompt } from './prompts/systemPrompt';

// Load environment variables from .env file
// Try multiple possible locations for .env file
const possibleEnvPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '.env')
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (require('fs').existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

// Fallback: try to load from current directory without specific path
if (!envLoaded) {
  dotenv.config();
}

async function main() {
  try {
    const config = await loadConfig();
    await ensureDataDir(config);
    
    console.log(banner());
    const session = await newSession(config);
    console.log(renderInfo(`Logs: ${session.paths.monthDir}`));
    console.log(renderInfo(`Model: ${config.model.replace('gpt-4o-mini', 'gpt-5-mini')}`));
    console.log(renderInfo('Search: OpenAI web_search tool ✓'));
    
    // Display current date/time information
    const systemPrompt = getSystemPrompt();
    const dateTimeMatch = systemPrompt.content.match(/Current date: (.+?)$/m);
    
    if (dateTimeMatch) {
      console.log(renderInfo(`Current date/time: ${dateTimeMatch[1]}`));
    }
    
    await createRepl(config, session);
  } catch (error) {
    console.error('[fatal]', error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

main();