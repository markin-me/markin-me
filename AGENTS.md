## Encoding rules (strict)
- All text files must be UTF-8 without BOM.
- Never save JS/CSS/HTML/EJS files in UTF-16, Windows-1251, or CP1251.
- For user-facing Russian strings in JS, prefer `\uXXXX` escapes when editing existing files with mixed or broken encoding.
- Do not run bulk rewrite/replace on large files if it can change encoding or line endings.
- Preserve existing line endings in edited files.
- Before finishing any edit, verify encoding for changed files and ensure no mojibake (`Р...`, `вЂ`, `вњ`) appeared in new or changed UI strings.

If encoding became broken after assistant edits, assistant must immediately restore the file from git and re-apply changes with a minimal patch.
