import fs from 'fs';
import { execSync } from 'child_process';

const originalCode = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
const lines = originalCode.split('\n');

const testCases = [
  {
    c3362: '          ))}\n        </div>\n      )}',
    c3495: '        )}'
  },
  {
    c3362: '          ))}\n        </div>\n      )}',
    c3495: '      </>)}'
  },
  {
    c3362: '          ))}\n        </div>',
    c3495: '        )}'
  }
];

for (let tc of testCases) {
  let testLines = [...lines];
  testLines[3361] = tc.c3362;
  testLines[3494] = tc.c3495;
  let testCode = testLines.join('\n');
  
  fs.writeFileSync('src/components/AdminPanel.temp.tsx', testCode);
  
  try {
    execSync('npx esbuild src/components/AdminPanel.temp.tsx', { stdio: 'pipe' });
    console.log(`SUCCESS! 3362: "${tc.c3362.replace(/\n/g, '\\n')}" 3495: "${tc.c3495}"`);
  } catch (e) {
    console.log(`Error for 3362: "${tc.c3362.replace(/\n/g, '\\n')}" 3495: "${tc.c3495}":`);
    console.log(e.stderr.toString());
  }
}

if (fs.existsSync('src/components/AdminPanel.temp.tsx')) {
  fs.unlinkSync('src/components/AdminPanel.temp.tsx');
}
