import { Session } from './session';
import { Config } from './config';

export interface SessionStats {
  tokens: number;
  cost: number;
  duration: string;
  messages: number;
}

export function calculateStats(session: Session, config: Config): SessionStats {
  const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  
  const duration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Calculate cost based on model
  const modelCosts = config.costsPer1kTokens[session.model];
  let cost = 0;
  
  if (modelCosts) {
    // Rough estimate: assume 70% input, 30% output
    const inputTokens = Math.ceil(estimatedTokens * 0.7);
    const outputTokens = Math.ceil(estimatedTokens * 0.3);
    
    cost = (inputTokens / 1000) * modelCosts.input + (outputTokens / 1000) * modelCosts.output;
  }
  
  return {
    tokens: estimatedTokens,
    cost: Math.round(cost * 100) / 100,
    duration: durationStr,
    messages: session.messages.length
  };
}


