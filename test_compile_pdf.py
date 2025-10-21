import subprocess
import os
import platform
from pathlib import Path

# Path to your exported LaTeX file
TEX_PATH = Path(r"C:\Users\noahj\Documents\Projects\AI-CLI\exports\resumes\refined_Generic_2025-10-21_17-19-57.tex")

def compile_latex(tex_path: Path):
    """Compile a LaTeX file to PDF using pdflatex and open the result."""
    if not tex_path.exists():
        print(f"❌ File not found: {tex_path}")
        return

    pdf_path = tex_path.with_suffix(".pdf")
    print(f"⚙️ Compiling: {tex_path.name}")

    try:
        result = subprocess.run(
            [
                "pdflatex",
                "-interaction=nonstopmode",
                "-output-directory",
                str(tex_path.parent),
                str(tex_path),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0 and pdf_path.exists():
            print(f"✅ PDF generated successfully: {pdf_path}")

            # Clean up intermediate files
            for ext in [".aux", ".log", ".out", ".toc"]:
                aux_file = tex_path.with_suffix(ext)
                if aux_file.exists():
                    aux_file.unlink()

            # Open PDF in default viewer
            system = platform.system()
            try:
                if system == "Windows":
                    os.startfile(pdf_path)
                elif system == "Darwin":  # macOS
                    subprocess.run(["open", pdf_path])
                else:  # Linux
                    subprocess.run(["xdg-open", pdf_path])
                print("📂 PDF opened in default viewer.")
            except Exception as open_err:
                print(f"⚠️ Could not auto-open PDF: {open_err}")

        else:
            print("❌ PDF compilation failed.\n")
            print(result.stderr)
    except FileNotFoundError:
        print("❌ pdflatex not found. Make sure MiKTeX or TeX Live is installed and added to PATH.")

if __name__ == "__main__":
    compile_latex(TEX_PATH)
