import os
from dotenv import load_dotenv
from openai import OpenAI
from core.resume_refiner import refine_resume, extract_company_name

# --- Load environment variables ---
load_dotenv()
if not os.getenv("OPENAI_API_KEY"):
    raise SystemExit("❌ Missing OPENAI_API_KEY in .env")

# --- Minimal test data ---
JOB_DESCRIPTION = """\
We are seeking a Python Developer with experience in API design, async programming,
and OpenAI API integrations. Familiarity with Textual TUI frameworks is a plus.
"""

LATEX_RESUME = r"""
\documentclass{article}
\begin{document}
\section*{Experience}
\textbf{AI Developer} \hfill 2024--Present \\
Built several CLI tools using Python, including data parsers and async applications.

\section*{Skills}
Python, AsyncIO, OpenAI, API Integration
\end{document}
"""

# --- Run refinement ---
client = OpenAI()

print("→ Sending to refine_resume() ...")
result = refine_resume(LATEX_RESUME, JOB_DESCRIPTION, client)

print("\n------ OUTPUT START ------")
print(result[:2000])  # Show first 2000 chars
print("------ OUTPUT END --------")
