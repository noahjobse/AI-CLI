from openai import OpenAI
import os
import argparse
from dotenv import load_dotenv
from cli_renderer import render_banner, render_info, render_error, render_assistant_response, render_prompt
from rich.console import Console

console = Console()

def main():
    load_dotenv()  # Load environment variables from .env file

    parser = argparse.ArgumentParser(description="Interactive chatbot using the OpenAI API.")
    parser.add_argument("--model", type=str, default="gpt-5-mini", help="The OpenAI chat model to use (default: gpt-5-mini).")
    args = parser.parse_args()

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    messages = []
    render_banner()
    render_info("Chatbot started. Type 'exit' or 'quit' to end the conversation.")

    while True:
        user_input = console.input(str(render_prompt(args.model)))
        if user_input.lower() in ["exit", "quit"]:
            break

        messages.append({"role": "user", "content": user_input})

        try:
            # Adapt messages for client.responses.create input format
            # The 'input' parameter can take a string or a list of dictionaries
            # For multi-turn chat, we pass the entire messages list
            response = client.responses.create(
                model=args.model,
                input=messages
            )
            assistant_response = response.output_text
            render_assistant_response(assistant_response)
            messages.append({"role": "assistant", "content": assistant_response})
        except Exception as e:
            render_error(f"An error occurred: {e}")
            messages.pop() # Remove the last user message if there was an error

if __name__ == "__main__":
    main()
