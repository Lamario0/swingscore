import fs from 'fs';
import { execSync } from 'child_process';

const originalCode = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
let lines = originalCode.split('\n');

lines[2344] = '            {activeHeat.role === "Mixed" && (';
lines[2462] = '                )}\n              </div>\n            )}';
lines[3361] = '          ))}';
lines[3494] = '        )}';
lines[3495] = ''; // clear line 3496
lines[3779] = '      </>\n    )}';

const testCode = lines.join('\n');
fs.writeFileSync('src/components/AdminPanel.temp.tsx', testCode);

try {
  execSync('npx esbuild src/components/AdminPanel.temp.tsx', { stdio: 'pipe' });
  console.log("SUCCESS!");
} catch (e) {
  console.log(e.stderr.toString());
}

if (fs.existsSync('src/components/AdminPanel.temp.tsx')) {
  fs.unlinkSync('src/components/AdminPanel.temp.tsx');
}
