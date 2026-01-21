#!/usr/bin/env python3
"""
PDF to Markdown converter using LlamaParse
Usage: python parse_pdf.py <input.pdf> [output.md]
"""

import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from llama_parse import LlamaParse

# Load .env from repo root
script_dir = Path(__file__).parent
repo_root = script_dir.parent.parent
load_dotenv(repo_root / ".env")


def parse_pdf(input_path: str, output_path: Optional[str] = None) -> str:
    """Convert PDF to Markdown using LlamaParse."""

    api_key = os.getenv("LLAMA_CLOUD_API_KEY")
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY not set in .env file")

    parser = LlamaParse(
        api_key=api_key,
        result_type="markdown",
        parsing_instruction="This is an academic paper. Extract all text, tables, and equations accurately.",
    )

    documents = parser.load_data(input_path)

    # Combine all pages
    markdown_content = "\n\n".join([doc.text for doc in documents])

    # Determine output path
    if output_path is None:
        input_file = Path(input_path)
        output_path = input_file.with_suffix(".md")

    # Save to file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown_content)

    print(f"Converted: {input_path} -> {output_path}")
    return markdown_content


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_pdf.py <input.pdf> [output.md]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    parse_pdf(input_path, output_path)


if __name__ == "__main__":
    main()
