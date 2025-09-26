export function getHelpText(): string {
  return `
AI CLI - Interactive Terminal Chat

Commands:
  :help              Show this help
  :settings          View/edit settings
  :config            Open config in editor
  :model <name>      Switch model
  :redo              Rerun last prompt
  :undo              Remove last Q+A pair
  :recall            List current month sessions
  :resume <n>        Resume session n
  :find <keyword>    Search current month
  :delete <n>        Delete session n
  :rename <n> <slug> Rename session n
  :search <query>    Web search (uses OpenAI web_search tool)
  :file <path...>    Attach files
  :import <n>        Import context from session n
  :summarize         Generate session summary
  :copy <n>          Copy code block n
  :stats             Show session stats
  :export <path>     Export current session
  :version           Show version
  :apikey            Set API key

Tips:
  - Use \\ at end of line for multi-line input
  - Press Ctrl+C to interrupt streaming
  - Sessions auto-save after each exchange
  - Use :recall to see previous sessions
`;
}


