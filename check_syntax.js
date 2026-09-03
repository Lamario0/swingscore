import fs from 'fs';

const code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Simple lexical tokenizer for parentheses, braces, and brackets
let stack = [];
let lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  for (let j = 0; j < line.length; j++) {
    let char = line[j];
    if (char === '(' || char === '{' || char === '[') {
      stack.push({ char, line: i + 1, col: j + 1 });
    } else if (char === ')' || char === '}' || char === ']') {
      if (stack.length === 0) {
        console.log(`Unmatched closing ${char} at line ${i + 1}:${j + 1}`);
      } else {
        let open = stack.pop();
        let expected = char === ')' ? '(' : char === '}' ? '{' : '[';
        if (open.char !== expected) {
          console.log(`Mismatched: opened ${open.char} at line ${open.line}:${open.col}, closed with ${char} at line ${i + 1}:${j + 1}`);
        }
      }
    }
  }
}

console.log('Unclosed remaining items:', stack.length);
stack.forEach(item => {
  console.log(`- ${item.char} opened at line ${item.line}:${item.col}: ${lines[item.line-1].trim()}`);
});

