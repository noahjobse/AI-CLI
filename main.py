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
    args = parser.parse_args()

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    messages = []
    render_banner()
    render_info("Chatbot started. Type 'exit' or 'quit' to end the conversation.")

    while True:
        user_input = console.input(str(render_prompt(args.model)))
        if user_input.lower() in ["exit", "quit"]:
            break

        console.print(f"[bold cyan]📝 You:[/bold cyan] {user_input}")
        messages.append({"role": "user", "content": user_input})

        try:
            assistant_response = ""

            # Start spinner
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
                    if event.type == "response.output_text.delta":
                        if not first_token_printed:
                            # Stop spinner once first token arrives
                            status.stop()
                            console.print("\n🤖 [bold green]Assistant:[/bold green] ", end="")
                            first_token_printed = True

                        # Typing effect: print chars slowly
                        for ch in event.delta:
                            sys.stdout.write(ch)
                            sys.stdout.flush()
                            time.sleep(0.01)
                        assistant_response += event.delta

                    elif event.type == "response.completed":
                        sys.stdout.write("\n")
                        sys.stdout.flush()

            messages.append({"role": "assistant", "content": assistant_response})
            console.print(Rule(style="dim"))

        except Exception as e:
            render_error(f"An error occurred: {e}")
            if messages and messages[-1]["role"] == "user":
                messages.pop()

if __name__ == "__main__":
    main()
