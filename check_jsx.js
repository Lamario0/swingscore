import fs from 'fs';

const originalCode = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
let lines = originalCode.split('\n');

// Apply our architectural fixes
lines[2344] = '            {activeHeat.role === "Mixed" && (';
lines[2462] = '                )}\n              </div>\n            )}';
lines[3361] = '          ))}';
lines[3494] = '        )}';
lines[3495] = ''; // clear line 3496
lines[3779] = '      </>\n    )}';

const code = lines.join('\n');
const lines_arr = code.split('\n');

let tagStack = [];
const tagRegex = /<\/?[a-zA-Z0-9_\.]*(?:\s+[a-zA-Z0-9_-]+(?:\s*=\s*(?:{[^}]*}|"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>|<\/?>/g;

for (let i = 0; i < lines_arr.length; i++) {
  let line = lines_arr[i];
  
  // Remove string literals
  let lineClean = line.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
                      .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
                      .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, "``");
  
  // Remove comments
  lineClean = lineClean.replace(/{\/\*[\s\S]*?\*\/}/g, '');

  let match;
  while ((match = tagRegex.exec(lineClean)) !== null) {
    let tag = match[0];
    if (tag.startsWith('{/*') || tag.startsWith('//')) continue;
    
    // Self-closing tags
    if (tag.endsWith('/>') || tag.startsWith('<img') || tag.startsWith('<input') || tag.startsWith('<br') || tag.startsWith('<hr')) {
      continue;
    }
    
    if (tag.startsWith('</')) {
      let tagName = tag.substring(2, tag.length - 1).trim();
      if (tagStack.length === 0) {
        console.log(`Unmatched closing tag ${tag} at line ${i + 1}`);
      } else {
        let openTag = tagStack.pop();
        if (openTag.name !== tagName) {
          console.log(`Mismatched JSX tags: opened <${openTag.name}> at line ${openTag.line}, closed with ${tag} at line ${i + 1}`);
        }
      }
    } else if (tag.startsWith('<') && !tag.startsWith('<!')) {
      let tagName = tag.substring(1, tag.indexOf(' ') > 0 ? tag.indexOf(' ') : tag.indexOf('>')).trim();
      if (tagName.endsWith('/')) continue;
      tagStack.push({ name: tagName, line: i + 1 });
    }
  }
}

console.log('Unclosed JSX tags:', tagStack.length);
tagStack.forEach(t => {
  console.log(`- <${t.name}> opened at line ${t.line}`);
});
