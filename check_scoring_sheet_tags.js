import fs from 'fs';

const code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
const lines = code.split('\n');

const startLine = 2336;
const endLine = 3505;

let stack = [];
const tagRegex = /<\/?[a-zA-Z0-9_\.]*(?:\s+[a-zA-Z0-9_-]+(?:\s*=\s*(?:{[^}]*}|"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>|<\/?>/g;

for (let i = startLine - 1; i < endLine; i++) {
  let line = lines[i];
  let lineClean = line.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
                      .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
                      .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, "``");
  
  // Remove comments
  lineClean = lineClean.replace(/{\/\*[\s\S]*?\*\/}/g, '')
                      .replace(/\/\/.*$/g, '');

  let match;
  while ((match = tagRegex.exec(lineClean)) !== null) {
    let tag = match[0];
    
    // Skip self-closing tags
    if (tag.endsWith('/>') || tag.startsWith('<img') || tag.startsWith('<input') || tag.startsWith('<br') || tag.startsWith('<hr')) {
      continue;
    }
    
    if (tag.startsWith('</')) {
      let tagName = tag.substring(2, tag.length - 1).trim();
      if (stack.length === 0) {
        console.log(`Unmatched closing tag ${tag} at line ${i + 1}`);
      } else {
        let openTag = stack.pop();
        if (openTag.name !== tagName) {
          console.log(`Mismatched JSX: opened <${openTag.name}> at line ${openTag.line}, closed with ${tag} at line ${i + 1}`);
        }
      }
    } else if (tag.startsWith('<') && !tag.startsWith('<!')) {
      let tagName = tag.substring(1, tag.indexOf(' ') > 0 ? tag.indexOf(' ') : tag.indexOf('>')).trim();
      if (tagName.endsWith('/')) continue;
      stack.push({ name: tagName, line: i + 1 });
    }
  }
}

console.log('Unclosed tags at the end of block:', stack.length);
stack.forEach(t => {
  console.log(`- <${t.name}> opened at line ${t.line}`);
});
