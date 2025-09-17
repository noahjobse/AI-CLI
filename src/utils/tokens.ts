export function estimateTokens(text: string): number {
  // Simple heuristic: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function estimateTokensForMessages(messages: Array<{ content: string }>): number {
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  return Math.ceil(totalChars / 4);
}


