import sys
import time
from rich.console import Console
from rich.rule import Rule
from rich.status import Status
from openai import OpenAI
import os
import argparse
from dotenv import load_dotenv
from cli_renderer import render_banner, render_info, render_error, render_prompt

console = Console()

def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Interactive chatbot using the OpenAI API.")
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-5-mini",
        help="The OpenAI chat model to use (default: gpt-5-mini)."
    )
    parser.add_argument(
        "--log",
        action="store_true",
        help="Save conversation to chat.log"
    )
    args = parser.parse_args()

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    # ---- Conversational system prompt ----
    system_prompt = """You are a general-purpose assistant running inside a CLI tool. 
Speak in a natural, conversational way — helpful but not stiff. 
Keep your answers short by default, but always organized and easy to read. 
Use plain text (no Markdown unless I ask), but you can use emojis sparingly when they make things clearer. 
Avoid filler like over-apologizing or being too formal. 

When answering:
- If something is unclear, ask me a quick clarifying question instead of guessing.
- Remember what we’ve talked about earlier in the session unless I reset you.
- Organize information into clean lists, steps, or bullet points when it helps readability.
- Show code examples in fenced code blocks with the right language tag.
- Don’t overdo structure like JSON/YAML unless I specifically request it.
- Keep reasoning out of your replies — just give me the final answer.

In short: be practical, concise, and conversational — like a sharp assistant who knows when to be brief and when to expand if I ask.
"""
    messages = [{"role": "system", "content": system_prompt}]

    render_banner()
    render_info("Chatbot started. Type 'exit' or 'quit' to end the conversation.")

    while True:
        user_input = console.input(str(render_prompt(args.model)))
        if user_input.lower() in ["exit", "quit"]:
            break

        # Print user block
        console.print(Rule(style="cyan"))
        console.print(f"[bold cyan]📝 You:[/bold cyan] {user_input}")
        console.print(Rule(style="cyan"))
        messages.append({"role": "user", "content": user_input})

        try:
            assistant_response = ""
            tool_called = False

            with console.status("[bold yellow]🤖 Assistant is thinking...[/bold yellow]", spinner="dots") as status:
                stream = client.responses.create(
                    model=args.model,
                    input=messages,
                    stream=True,
                    reasoning={"effort": "low"},
                    text={"verbosity": "low"},
                    tools=[{"type": "web_search"}],
                )

                first_token_printed = False

                for event in stream:
                    # --- Streamed text ---
                    if event.type == "response.output_text.delta" and not tool_called:
                        if not first_token_printed:
                            status.stop()
                            console.print("\n🤖 [bold green]Assistant:[/bold green]\n")
                            first_token_printed = True

                        # Smooth typing effect
                        for ch in event.delta:
                            sys.stdout.write(ch)
                            sys.stdout.flush()
                            time.sleep(0.005)
                        assistant_response += event.delta

                    # --- End of text (fix for pause) ---
                    elif event.type == "response.output_text.done":
                        sys.stdout.write("\n")
                        sys.stdout.flush()

                    # --- Tool call (filter only real tools) ---
                    elif event.type == "response.output_item.added":
                        if getattr(event.item, "type", None) in ("function_call", "tool"):
                            tool_called = True
                            status.stop()
                            tool_type = event.item.type
                            tool_name = getattr(event.item, "name", "<unknown>")
                            console.print(f"\n🔧 [yellow]Tool called:[/yellow] {tool_type} → {tool_name}\n")

            # Append only if we got content and no tool handled it
            if not tool_called and assistant_response.strip():
                messages.append({"role": "assistant", "content": assistant_response})

            console.print(Rule(style="dim"))

            # Optional logging
            if args.log and assistant_response.strip():
                with open("chat.log", "a", encoding="utf-8") as f:
                    f.write(f"USER: {user_input}\nASSISTANT: {assistant_response}\n\n")

        except Exception as e:
            sys.stdout.write("\n")
            sys.stdout.flush()
            render_error(f"An error occurred: {e}")
            if messages and messages[-1]["role"] == "user":
                messages.pop()

if __name__ == "__main__":
    main()
