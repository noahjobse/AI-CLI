import { getOpenAIClient } from './openaiClient';
import { SessionMessage } from '../core/session';

/**
 * Supported OpenAI models for the Responses API:
 * - 'gpt-5': Most capable overall model (GPT-5)
 *   - Best for complex tasks and high-quality responses
 *   - More expensive than other models
 * - 'gpt-5-mini': Faster, cost-efficient version of GPT-5
 *   - Balances performance and cost
 *   - Suitable for most use cases
 * - 'gpt-5-nano': Smallest and fastest model in the GPT-5 family
 * - 'gpt-4o': Optimized for multimodal tasks
 *   - Best for tasks that require multiple input formats (e.g., text, images)
 *   - More expensive than other models
 * - 'gpt-4-turbo': Legacy model with good performance
 *   - Less expensive than GPT-5 models
 *   - Suitable for simple tasks and low-cost applications
 * - 'gpt-3.5-turbo': Fastest and cheapest option
 *   - Best for simple tasks and low-cost applications
 *   - May not perform as well as other models for complex tasks
 */
export type OpenAIModel =
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo';

/**
 * Default model configuration
 * - Balances performance and cost
 * - Uses 'gpt-5-mini' as the default
 * - Suitable for most use cases
 */
export const DEFAULT_MODEL: OpenAIModel = 'gpt-5-mini';

export interface StreamChunk {
  content: string;
  finished: boolean;
  error?: string;
  toolCalls?: any[];
}

export interface StreamController {
  abort: () => void;
  isAborted: () => boolean;
}

// Add ResponseStreamEvent type for better type safety
type ResponseStreamEvent = {
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  finished?: boolean;
};

export async function* streamChat(
  apiKey: string,
  model: OpenAIModel = DEFAULT_MODEL,
  messages: SessionMessage[],
  tools?: any[]
): AsyncGenerator<StreamChunk, void, unknown> {
  const openai = getOpenAIClient(apiKey);
  
  const abortController = new AbortController();
  let isAborted = false;
  
  const controller: StreamController = {
    abort: () => { 
      isAborted = true;
      abortController.abort();
    },
    isAborted: () => isAborted
  };
  
  (global as any).__currentStreamController = controller;
  
  try {
    const response = await openai.responses.create({
      model,
      input: messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      })),
      tools: tools?.map(tool => ({
        type: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      })),
      stream: true
    }, {
      signal: abortController.signal
    });
    
    try {
      let toolCalls: any[] = [];
      
      for await (const chunk of response as AsyncIterable<ResponseStreamEvent>) {
        if (isAborted) break;
        
        // Handle text content
        const textContent = chunk.output?.find(item => item.type === 'message')?.content
          ?.find(content => content.type === 'output_text')?.text || '';
        
        if (textContent) {
          yield {
            content: textContent,
            finished: false
          };
        }
        
        // Handle tool calls
        const toolChunk = chunk.output?.find(item => item.type === 'tool_call');
        if (toolChunk) {
          toolCalls.push(toolChunk);
        }
        
        if (chunk.finished) break;
      }
      
      yield {
        content: '',
        finished: true,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };
    } catch (streamError: any) {
      if (isAborted || streamError.name === 'AbortError') {
        yield {
          content: '',
          finished: true,
          error: 'Stream aborted by user'
        };
      } else {
        throw streamError;
      }
    }
    
  } catch (error: any) {
    if (isAborted || error.name === 'AbortError') {
      yield {
        content: '',
        finished: true,
        error: 'Stream aborted by user'
      };
    } else {
      yield {
        content: '',
        finished: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } finally {
    delete (global as any).__currentStreamController;
  }
}

export async function generateSummary(
  apiKey: string,
  model: string,
  messages: SessionMessage[]
): Promise<string> {
  const openai = getOpenAIClient(apiKey);
  
  const recentMessages = messages.slice(-10);
  const context = recentMessages.map(msg => 
    `${msg.role}: ${msg.content}`
  ).join('\n\n');
  
  try {
    const response = await openai.responses.create({
      model,
      instructions: 'Generate a concise bullet-point summary of this conversation. Focus on key decisions, tasks, and outcomes.',
      input: context,
      store: false
    });
    
    return response.output_text || 'No summary generated';
  } catch (error) {
    throw new Error(`Failed to generate summary: ${error}`);
  }
}

export async function generateSessionName(
  apiKey: string,
  userPrompt: string,
  attachedFiles?: string[]
): Promise<string> {
  const openai = getOpenAIClient(apiKey);

  try {
    // Using type assertion to match actual API while satisfying TypeScript
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      instructions: `Generate a concise 3-5 word title in Title Case. Focus on the main topic.`,
      input: `User query: ${userPrompt}${attachedFiles?.length ? '\nFiles: ' + attachedFiles.join(', ') : ''}`,
      text: {
        format: {
          type: 'text',
          max_length: 50
        } as any // Temporary type assertion
      },
      temperature: 0.7,
      store: false
    });

    return response.output_text?.trim() || generateFallbackSessionName(userPrompt);
    
  } catch (error) {
    console.warn(`[warning] Failed to generate AI session name: ${error}`);
    return generateFallbackSessionName(userPrompt);
  }
}

function generateFallbackSessionName(prompt: string): string {
  // Clean up the prompt
  let name = prompt.trim();
  
  // Remove common question words and phrases
  name = name.replace(/^(what|how|why|when|where|can you|could you|please|help me|i need|i want|i'm trying|i'm looking for|i'm working on|i'm building|i'm creating|i'm developing|i'm learning|i'm studying|i'm researching|i'm debugging|i'm fixing|i'm optimizing|i'm refactoring|i'm implementing|i'm designing|i'm planning|i'm thinking about|i'm wondering|i'm curious about|i'm confused about|i'm stuck on|i'm having trouble with|i'm struggling with|i'm having issues with|i'm having problems with|i'm having difficulty with|i'm having a hard time with|i'm stuck|i'm confused|i'm wondering|i'm curious|i'm thinking|i'm planning|i'm designing|i'm implementing|i'm refactoring|i'm optimizing|i'm fixing|i'm debugging|i'm researching|i'm studying|i'm learning|i'm developing|i'm creating|i'm building|i'm working|i'm looking|i need|i want|i'm trying|help|please|can|could|what|how|why|when|where)\s+/i, '');
  
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
