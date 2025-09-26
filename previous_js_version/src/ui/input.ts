import * as readline from 'readline';
import { Session } from '../core/session';
import { Config } from '../core/config';
import { getOpenAIClient } from '../adapters/openaiClient';
import { OpenAIModel } from '../adapters/openai';
import { CommandHandler } from '../core/commands';
import { streamChat } from '../adapters/openai';
import { getApiKey } from '../core/keychain';
import { renderPrompt, renderContinuation, renderCodeBlock } from '../core/renderer';
import { appendUser, renameSessionFromFirstPrompt, appendAssistant } from '../core/session';
import { getSystemPrompt } from '../prompts/systemPrompt';

// Function to execute web search using Responses API with enhanced context
const searchCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function executeWebSearch(query: string, apiKey: string): Promise<string> {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const openai = getOpenAIClient(apiKey);
  
  try {
    // Enhanced search query with current date context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const currentTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    const enhancedQuery = `${query} - Current date: ${currentDate}, Current time: ${currentTime}. Please provide the most recent and accurate information.`;
    
    // Check if query is location-specific (weather, local news, etc.)
    const isLocationQuery = /\b(weather|temperature|forecast|news|events|restaurants|shops|stores|near me|local|city|town|area)\b/i.test(query);
    
    const response = await openai.responses.create({
      model: 'gpt-5-nano' as OpenAIModel, // Use nano for search
      tools: [
        { 
          type: 'web_search',
          search_context_size: 'high', // Get more comprehensive context for better accuracy
          ...(isLocationQuery && {
            user_location: {
              type: 'approximate',
              country: 'CA',
              region: 'Alberta'
            }
          })
        }
      ],
      input: enhancedQuery
    });
    
    // Extract the text content from the response
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text') {
            const searchResults = contentItem.text;
            // Cache the result
            searchCache.set(query, { result: searchResults, timestamp: Date.now() });
            return searchResults;
          }
        }
      }
    }
    
    // Cache the result
    searchCache.set(query, { result: 'No search results found', timestamp: Date.now() });
    return 'No search results found';
  } catch (error) {
    console.error('Error executing web search:', error);
    // Cache the result
    searchCache.set(query, { result: 'Error: Failed to execute web search', timestamp: Date.now() });
    return 'Error: Failed to execute web search';
  }
}

export async function createRepl(config: Config, session: Session): Promise<void> {
  // Set up SIGINT handler before creating readline interface
  let isStreaming = false;
  let ctrlCCount = 0;
  let ctrlCTimeout: NodeJS.Timeout | null = null;
  
  // Command history for up/down arrow navigation
  const commandHistory: string[] = [];
  
  // Load history from session if available
  const historyMessages = session.messages.filter(msg => msg.role === 'user');
  historyMessages.forEach(msg => {
    if (msg.content.trim() && !commandHistory.includes(msg.content.trim())) {
      commandHistory.push(msg.content.trim());
    }
  });
  
  const handleSigint = () => {
    // Clear any existing timeout
    if (ctrlCTimeout) {
      clearTimeout(ctrlCTimeout);
    }
    
    if (isStreaming) {
      // First Ctrl+C: interrupt streaming
      console.log('\n[interrupted]');
      isStreaming = false;
      
      // Access the global stream controller if it exists
      const controller = (global as any).__currentStreamController;
      if (controller && controller.abort) {
        controller.abort();
      }
      
      // Set a timeout to reset the counter
      ctrlCTimeout = setTimeout(() => {
        ctrlCCount = 0;
      }, 1000);
    } else {
      ctrlCCount++;
      if (ctrlCCount === 1) {
        console.log('\n[interrupted] (press Ctrl+C again to exit)');
        ctrlCTimeout = setTimeout(() => {
          ctrlCCount = 0;
        }, 1000);
      } else {
        console.log('\n[exiting]');
        process.exit(0);
      }
    }
  };
  
  // Register the SIGINT handler
  process.on('SIGINT', handleSigint);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: renderPrompt(config.model),
    history: commandHistory,
    historySize: 1000
  });
  
  const commandHandler = new CommandHandler({
    session,
    config,
    attachedFiles: [],
    context: '',
  });
  
  // Update prompt before every input
  rl.on('line', async (input) => {
    const trimmed = input.trim();
    
    // Add to history if it's not empty and not a duplicate of the last command
    if (trimmed && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== trimmed)) {
      commandHistory.push(trimmed);
      // Keep history size manageable
      if (commandHistory.length > 1000) {
        commandHistory.shift();
      }
    }
    
    // History is managed automatically by readline
    
    await processInput(input, commandHandler, rl, () => isStreaming, (streaming) => { isStreaming = streaming; });
  });
  
  // Handle close
  rl.on('close', () => {
    console.log('\n[exiting]');
    process.exit(0);
  });
  
  // Initialize prompt
  rl.setPrompt(renderPrompt(config.model));
  rl.prompt();
}

async function processInput(input: string, commandHandler: CommandHandler, rl: readline.Interface, getIsStreaming?: () => boolean, setIsStreaming?: (streaming: boolean) => void): Promise<void> {
  const { config } = commandHandler.context;
  const trimmed = input.trim();
  
  if (!trimmed) {
    rl.setPrompt(renderPrompt(config.model));
    rl.prompt();
    return;
  }
  
  // Handle search command with streaming first (before other commands)
  if (trimmed.startsWith(':search ')) {
    const query = trimmed.slice(8).trim();
    if (query) {
      await handleStreamingSearch(query, commandHandler, rl, getIsStreaming, setIsStreaming);
      return;
    }
  }
  
  // Handle other commands
  if (trimmed.startsWith(':')) {
    const result = await commandHandler.handleCommand(trimmed);
    if (result.handled) {
      if (result.output) {
        // Check if this is a search stream marker
        if (result.output.startsWith('__SEARCH_STREAM__:')) {
          const query = result.output.slice(18); // Remove '__SEARCH_STREAM__:' prefix
          await handleStreamingSearch(query, commandHandler, rl, getIsStreaming, setIsStreaming);
          return;
        }
        console.log(result.output);
      }
      if (!result.skipPrompt) {
        rl.setPrompt(renderPrompt(config.model));
        rl.prompt();
      }
    }
    return;
  }
  
  // Handle regular chat
  const { session } = commandHandler.context;
  
  try {
    const startTime = Date.now();
    
    // Get API key
    const apiKey = await getApiKey(config);
    if (!apiKey) {
      console.log('API key not set. Use :apikey to set it.');
      rl.setPrompt(renderPrompt(config.model));
      rl.prompt();
      return;
    }
    
    const keyTime = Date.now();
    if (config.responseSpeed === 'fast') {
      console.log(`[debug] API key retrieved in ${keyTime - startTime}ms`);
    }
    
    // Add user message to session
    await appendUser(session, trimmed);
    
    const sessionTime = Date.now();
    if (config.responseSpeed === 'fast') {
      console.log(`[debug] Session updated in ${sessionTime - keyTime}ms`);
    }
    
    // Rename session based on first prompt (only once)
    if (session.messages.length === 1) {
      const attachedFilePaths = commandHandler.context.attachedFiles.map(file => file.path);
      // Defer session renaming to avoid blocking the response
      setImmediate(() => renameSessionFromFirstPrompt(session, trimmed, apiKey, attachedFilePaths, config)); 
    }
    
    // Prepare messages for AI
    const messages = [...session.messages];
    
    // Only add system prompt at the beginning of the conversation
    const hasSystemPrompt = messages.some(msg => msg.role === 'system');
    if (!hasSystemPrompt) {
      const systemPrompt = getSystemPrompt();
      messages.unshift({
        role: 'system',
        content: systemPrompt.content,
        ts: new Date().toLocaleTimeString()
      });
    }
    
    // Stream response
    let response = '';
    let codeBlockCount = 0;
    let currentCodeBlock = '';
    let inCodeBlock = false;
    let codeLanguage = '';
    
    console.log(); // New line before response
    
    const streamStartTime = Date.now();
    if (config.responseSpeed === 'fast') {
      console.log(`[debug] Starting stream in ${streamStartTime - sessionTime}ms`);
    }
    
    const stream = streamChat(apiKey, session.model, messages);
    
    // Set streaming state
    if (setIsStreaming) setIsStreaming(true);
    
    let firstChunkReceived = false;
    const firstChunkTime = Date.now();
    
    for await (const chunk of stream) {
      // Check if streaming was interrupted
      if (getIsStreaming && !getIsStreaming()) {
        console.log('\n[interrupted] Chat stopped.');
        break;
      }
      if (chunk.error) {
        if (chunk.error === 'Stream aborted by user') {
          console.log('\n[interrupted] Chat stopped.');
        } else {
          console.log(`[error] ${chunk.error}`);
        }
        break;
      }
      
      // Track time to first response chunk
      if (!firstChunkReceived && chunk.content) {
        firstChunkReceived = true;
        const responseTime = Date.now() - firstChunkTime;
        if (config.responseSpeed === 'fast') {
          console.log(`[debug] First response chunk in ${responseTime}ms`);
        }
      }
      
      response += chunk.content;
      
      // Simplified streaming - just output content directly for speed
      if (inCodeBlock) {
        currentCodeBlock += chunk.content;
      } else {
        process.stdout.write(chunk.content);
      }
      
      // Simple code block detection
      if (chunk.content.includes('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockCount++;
          console.log(); // New line before code block
        } else {
          inCodeBlock = false;
          console.log(); // New line after code block
        }
      }
      
      if (chunk.finished) {
        // The Responses API handles tool calls natively, so we just break here
        break;
      }
    }
    
    // Add assistant response to session (defer to avoid blocking)
    setImmediate(() => appendAssistant(session, response));
    
    const totalTime = Date.now() - startTime;
    if (config.responseSpeed === 'fast') {
      console.log(`[debug] Total response time: ${totalTime}ms`);
    }
    
    console.log('\n'); // New line after response
    
  } catch (error) {
    console.log(`[error] ${error}`);
  }
  
  // Clear streaming state
  if (setIsStreaming) setIsStreaming(false);
  
  rl.setPrompt(renderPrompt(config.model));
  rl.prompt();
}

async function handleStreamingSearch(query: string, commandHandler: CommandHandler, rl: readline.Interface, getIsStreaming?: () => boolean, setIsStreaming?: (streaming: boolean) => void): Promise<void> {
  const { session, config } = commandHandler.context;
  
  try {
    const startTime = Date.now();
    
    // Get API key
    const apiKey = await getApiKey(config);
    if (!apiKey) {
      console.log('API key not set. Use :apikey to set it.');
      rl.setPrompt(renderPrompt(config.model));
      rl.prompt();
      return;
    }
    
    // Add user message to session
    await appendUser(session, `:search ${query}`);
    
    // Rename session based on first prompt (only once)
    if (session.messages.length === 1) {
      const attachedFilePaths = commandHandler.context.attachedFiles.map(file => file.path);
      // Defer session renaming to avoid blocking the response
      setImmediate(() => renameSessionFromFirstPrompt(session, query, apiKey, attachedFilePaths, config)); 
    }
    
    console.log(); // New line before response
    console.log('🔍 Searching the web...');
    
    // Set streaming state
    if (setIsStreaming) setIsStreaming(true);
    
    // Execute web search using Responses API
    const searchResults = await executeWebSearch(query, apiKey);
    
    // Display the search results
    console.log('\n' + searchResults);
    
    // Add assistant response to session (defer to avoid blocking)
    setImmediate(() => appendAssistant(session, searchResults));
    
    const totalTime = Date.now() - startTime;
    if (config.responseSpeed === 'fast') {
      console.log(`[debug] Search completed in ${totalTime}ms`);
    }
    
    console.log('\n'); // New line after response
    
  } catch (error) {
    console.log(`[error] ${error}`);
  }
  
  // Clear streaming state
  if (setIsStreaming) setIsStreaming(false);
  
  rl.setPrompt(renderPrompt(config.model));
  rl.prompt();
}