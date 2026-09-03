import fs from 'fs';

const originalCode = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
const lines = originalCode.split('\n');

function checkCode(code) {
  let stack = [];
  let codeLines = code.split('\n');
  let mismatches = 0;

  for (let i = 0; i < codeLines.length; i++) {
    let line = codeLines[i];
    for (let j = 0; j < line.length; j++) {
      let char = line[j];
      if (char === '(' || char === '{' || char === '[') {
        stack.push({ char, line: i + 1, col: j + 1 });
      } else if (char === ')' || char === '}' || char === ']') {
        if (stack.length === 0) {
          mismatches++;
        } else {
          let open = stack.pop();
          let expected = char === ')' ? '(' : char === '}' ? '{' : '[';
          if (open.char !== expected) {
            mismatches++;
          }
        }
      }
    }
  }
  return { unclosed: stack.length, mismatches, remaining: stack };
}

// Generate combinations of characters dynamically
const chars = [')', '}', ']'];
function getCombinations(length) {
  if (length === 1) return chars;
  let sub = getCombinations(length - 1);
  let res = [];
  for (let c of chars) {
    for (let s of sub) {
      res.push(c + s);
    }
  }
  return res;
}

const candidates3362 = [
  ...getCombinations(2),
  ...getCombinations(3),
  ...getCombinations(4),
  ...getCombinations(5),
].map(c => '          ' + c);

const candidates3495 = [
  '        )}',
  '      </>)}',
  '        </>)}',
  '</>)}',
  '      </>)}',
  '    </>)}',
  '  </>)}',
  '</>)}',
  '        )}',
  '      )}',
  '    )}',
  '      </>)}',
];

let minSum = Infinity;
let bestOption = null;

for (let c3362 of candidates3362) {
  for (let c3495 of candidates3495) {
    let testLines = [...lines];
    testLines[3361] = c3362;
    testLines[3494] = c3495;
    let testCode = testLines.join('\n');
    let res = checkCode(testCode);
    let sum = res.unclosed + res.mismatches;
    if (sum < minSum) {
      minSum = sum;
      bestOption = { c3362, c3495, res };
    }
  }
}

console.log('BEST OPTION FOUND:');
console.log(`3362: "${bestOption.c3362}"`);
console.log(`3495: "${bestOption.c3495}"`);
console.log(`Unclosed: ${bestOption.res.unclosed}, Mismatches: ${bestOption.res.mismatches}`);
console.log('Remaining Stack items:');
bestOption.res.remaining.forEach(item => {
  if (item.line > 2100) {
    console.log(`- ${item.char} at line ${item.line}:${item.col}: ${lines[item.line-1].trim()}`);
  }
});

