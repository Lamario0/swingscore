import fs from 'fs';

const originalCode = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
let lines = originalCode.split('\n');

lines[2344] = '            {activeHeat.role === "Mixed" && (';
lines[2462] = '                )}\n              </div>\n            )}';
lines[3361] = '          ))}';
lines[3494] = '        )}';
lines[3495] = ''; // clear line 3496
lines[3779] = '      </>\n    )}';

const testCode = lines.join('\n');
const testLines = testCode.split('\n');
for (let i = 3770; i < testLines.length; i++) {
  console.log(`${i+1}: ${testLines[i]}`);
}
