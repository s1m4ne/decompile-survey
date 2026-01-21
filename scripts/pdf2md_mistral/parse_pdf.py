#!/usr/bin/env python3
"""
PDF to Markdown converter using Mistral OCR 3
Usage: python parse_pdf.py <input.pdf> [output.md]
"""

import base64
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from mistralai import Mistral

# Load .env from script directory
script_dir = Path(__file__).parent
load_dotenv(script_dir / ".env")


def parse_pdf(input_path: str, output_path: Optional[str] = None) -> str:
    """Convert PDF to Markdown using Mistral OCR 3."""

    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise ValueError("MISTRAL_API_KEY not set in .env file")

    client = Mistral(api_key=api_key)

    # Read and encode PDF file
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    with open(input_file, "rb") as f:
        pdf_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # Process with Mistral OCR (use document_url with data URI)
    ocr_response = client.ocr.process(
        model="mistral-ocr-latest",
        document={
            "type": "document_url",
            "document_url": f"data:application/pdf;base64,{pdf_data}",
        },
        include_image_base64=True,
    )

    # Determine output path
    if output_path is None:
        output_path = input_file.with_suffix(".md")
    output_path = Path(output_path)
    output_dir = output_path.parent

    # Save images to same directory
    for page in ocr_response.pages:
        for image in page.images:
            image_data = image.image_base64
            # Remove data URI prefix if present
            if image_data.startswith("data:"):
                header, image_data = image_data.split(",", 1)
            image_bytes = base64.b64decode(image_data)
            image_path = output_dir / image.id
            with open(image_path, "wb") as f:
                f.write(image_bytes)
            print(f"Saved image: {image_path}")

    # Combine all pages
    markdown_parts = []
    for page in ocr_response.pages:
        markdown_parts.append(page.markdown)

    markdown_content = "\n\n".join(markdown_parts)

    # Save markdown to file
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
