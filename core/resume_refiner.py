# core/resume_refiner.py
import os
import re
import subprocess
import asyncio
from pathlib import Path
from openai import AsyncOpenAI
from dotenv import load_dotenv

# --- Load environment variables ---
load_dotenv()

# ✅ Require explicit API key and model
API_KEY = os.environ["OPENAI_API_KEY"]
MODEL = os.environ["OPENAI_MODEL"]

# --- Initialize async client ---
client = AsyncOpenAI(api_key=API_KEY)

SYSTEM_PROMPT = """You are a professional technical resume editor.
Refine the given LaTeX resume to best suit the provided job description.

Rules:
- Only reword existing content; do not add new experiences or skills.
- Leave the Summary/Description section untouched.
- Preserve LaTeX formatting, indentation, and spacing.
- Keep the same structure, but refine it down to 1.5 pages or less.
"""

# ============================================================
# ✅ Resume refinement using the Responses API
# ============================================================

async def refine_resume(latex_text: str, job_description: str) -> str:
    """Refine a LaTeX resume using OpenAI's Responses API."""
    try:
        response = await client.responses.create(
            model=MODEL,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Job Description:\n{job_description}\n\nResume:\n{latex_text}",
                },
            ],
        )

        # Safely extract text output (new API format)
        if hasattr(response, "output_text") and response.output_text:
            return response.output_text.strip()

        # Fallback for event-style output
        if hasattr(response, "output") and response.output:
            for item in response.output:
                if getattr(item, "type", None) == "output_text":
                    return item.content.strip()

        return "% Error: No valid output returned from model."

    except Exception as e:
        return f"% Error during refinement: {e}"


# ============================================================
# ✅ Utility functions
# ============================================================

def extract_company_name(jd: str) -> str:
    """Extract a likely company name from the job description."""
    words = jd.split()
    for w in words:
        if w.istitle() and len(w) > 2:
            return re.sub(r"[^A-Za-z0-9]", "", w)
    return "Generic"


def compile_to_pdf(tex_path: Path, output_path: Path):
    """Compile a .tex file to PDF using pdflatex."""
    subprocess.run(
        [
            "pdflatex",
            "-interaction=nonstopmode",
            "-output-directory",
            output_path.parent,
            tex_path.name,
        ],
        cwd=tex_path.parent,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def cleanup_tex_artifacts(tex_path: Path):
    """Remove intermediate LaTeX compilation artifacts."""
    for ext in [".aux", ".log", ".out"]:
        try:
            (tex_path.parent / (tex_path.stem + ext)).unlink()
        except FileNotFoundError:
            pass
