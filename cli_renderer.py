from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.table import Table
from rich.syntax import Syntax
from rich.markdown import Markdown
from rich import box

console = Console()

def render_banner():
    banner_text = Text(
        "🤖 AI CLI v1.0.0\n\nFast, calm, reliable terminal chat",
        justify="center",
        style="bold cyan"
    )
    panel = Panel(
        banner_text,
        box=box.DOUBLE,
        border_style="blue",
        width=70
    )
    console.print(panel)

def render_prompt(model: str) -> str:
    return Text(f"[{model.replace('gpt-4o-mini', 'gpt-5-mini')}] > ", style="cyan")

def render_continuation() -> str:
    return Text("... ", style="dim white")

def render_code_block(content: str, language: str = '', block_number: int = 1):
    header = Text(f"# Code block {block_number}", style="dim white")
    if language:
        header.append(f" ({language})", style="dim white")
    console.print(header)
    syntax = Syntax(content, language, theme="monokai", line_numbers=True)
    console.print(syntax)

def render_table(rows: list[list[str]]):
    if not rows:
        return
    
    table = Table(show_header=True, header_style="bold magenta")
    for header_text in rows[0]:
        table.add_column(header_text)
    
    for row_data in rows[1:]:
        table.add_row(*row_data)
        
    console.print(table)

def render_checklist(items: list[dict]):
    for item in items:
        status = "[green]✔[/green]" if item["checked"] else "[red]✖[/red]"
        console.print(f"{status} {item['text']}")

def render_hyperlink(url: str, text: str):
    console.print(Text(text, style=f"link {url}"))

def render_search_results(provider: str, model: str, results: list[dict], answer: str = None):
    output = Text(f"🔍 Search Results ({provider} + {model})\n", style="bold blue")
    output.append(Text("─" * 50 + "\n\n", style="dim white"))
    
    if answer:
        output.append(Markdown(answer))
        output.append("\n\n")
    
    output.append(Text("Sources:\n", style="dim white"))
    for i, result in enumerate(results):
        output.append(Text(f"{i + 1}. ", style="dim white"))
        output.append(Text(result["title"], style="bold"))
        output.append(Text(f" - ", style="dim white"))
        output.append(Text(result["url"], style=f"link {result['url']}"))
        output.append("\n")
    
    console.print(output)

def render_assistant_response(response_text: str):
    console.print(Markdown(response_text, style="white"))

def render_error(message: str):
    console.print(f"[bold red][error][/bold red] {message}")

def render_warning(message: str):
    console.print(f"[bold yellow][warning][/bold yellow] {message}")

def render_success(message: str):
    console.print(f"[bold green][success][/bold green] {message}")

def render_info(message: str):
    console.print(f"[bold blue][info][/bold blue] {message}")
