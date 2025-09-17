import chalk from 'chalk';

export function renderBanner(): string {
  return `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                    🤖 AI CLI v1.0.0                          ║
║                                                              ║
║              Fast, calm, reliable terminal chat              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;
}

export function renderPrompt(model: string): string {
  return chalk.cyan(`[${model.replace('gpt-4o-mini', 'gpt-5-mini')}] > `);
}

export function renderContinuation(): string {
  return chalk.gray('... ');
}

export function renderCodeBlock(content: string, language: string = '', blockNumber: number = 1): string {
  const header = language ? `# Code block ${blockNumber} (${language})` : `# Code block ${blockNumber}`;
  return `\n${chalk.gray(header)}\n${chalk.green('```' + language)}\n${content}\n${chalk.green('```')}\n`;
}

export function renderTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  
  const colWidths = rows[0].map((_, i) => 
    Math.max(...rows.map(row => row[i]?.length || 0))
  );
  
  const separator = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const header = '| ' + rows[0].map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |';
  
  const body = rows.slice(1).map(row => 
    '| ' + row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ') + ' |'
  );
  
  return [header, separator, ...body].join('\n');
}

export function renderChecklist(items: { text: string; checked: boolean }[]): string {
  return items.map(item => 
    `[${item.checked ? 'x' : ' '}] ${item.text}`
  ).join('\n');
}

export function renderHyperlink(url: string, text: string): string {
  // Use ANSI escape sequences for hyperlinks where supported
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

export function renderSearchResults(provider: string, model: string, results: Array<{ title: string; url: string; snippet: string }>, answer?: string): string {
  let output = chalk.blue(`\n🔍 Search Results (${provider} + ${model})\n`);
  output += chalk.gray('─'.repeat(50)) + '\n\n';
  
  if (answer) {
    output += answer + '\n\n';
  }
  
  output += chalk.gray('Sources:\n');
  results.forEach((result, i) => {
    output += chalk.gray(`${i + 1}. ${result.title} - ${result.url}\n`);
  });
  
  return output;
}

export function renderError(message: string): string {
  return chalk.red(`[error] ${message}`);
}

export function renderWarning(message: string): string {
  return chalk.yellow(`[warning] ${message}`);
}

export function renderSuccess(message: string): string {
  return chalk.green(`[success] ${message}`);
}

export function renderInfo(message: string): string {
  return chalk.blue(`[info] ${message}`);
}
