export function isJsonOutput(output: string): boolean {
  const trimmed = output.trim();
  // Check for standard JSON start OR markdown code block start
  return /^\s*[\{\[]/.test(trimmed) || /^\s*```/.test(trimmed) || /\[\s*{[\s\S]*\}\s*\]/.test(trimmed);
}

export function parseJsonOutput(output: string): any {
  let jsonStr = output
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);

  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  } else if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  return JSON.parse(jsonStr);
}
