import fs from 'fs';
import { execSync } from 'child_process';

const filePath = 'src/components/AdminPanel.tsx';

// Start with a clean copy of the original backup
let code = fs.readFileSync(filePath + '.bak', 'utf8');

// 1. Change the ternary back:
code = code.replace('{activeHeat.role === "Mixed" && (', '{activeHeat.role === "Mixed" ? (');

// 2. Remove premature closing at lines 2464-2465:
const targetBlock = `                    </div>
                  </div>
                )}
              </div>
            )}`;

if (code.includes(targetBlock)) {
  console.log("Removing premature block...");
  code = code.replace(targetBlock, `                    </div>
                  </div>
                )}`);
}

// 3. Close the scoring sheet editor card properly at line 3497/3498:
const closeScoringSheetTarget = `        ) : (
          <p className="text-xs text-slate-400 text-center py-4">Select an active heat to view the scoring sheet.</p>
        )}`;

const closeScoringSheetReplacement = `        ) : (
          <p className="text-xs text-slate-400 text-center py-4">Select an active heat to view the scoring sheet.</p>
        )}
      </>
    )}
  </div>`;

if (code.includes(closeScoringSheetTarget)) {
  console.log("Closing the scoring sheet editor card properly after line 3497...");
  code = code.replace(closeScoringSheetTarget, closeScoringSheetReplacement);
}

// 4. Clean up the end of the file.
// Let's look at the end of the file:
const endBlockTarget = `        </div>
      </div>
      </>
    )}`;

const endBlockReplacement = `        </div>
      </div>
    )}`;

if (code.includes(endBlockTarget)) {
  console.log("Removing the extra closing fragment at the end of the file...");
  code = code.replace(endBlockTarget, endBlockReplacement);
} else {
  // Try fallback replacement for the end
  code = code.replace(`      </>\n    )}`, `    )}`);
}

// Write the modified code to AdminPanel.tsx
fs.writeFileSync(filePath, code);

try {
  console.log("Running npm run build...");
  const output = execSync('npm run build', { encoding: 'utf8', stdio: 'pipe' });
  console.log("SUCCESS! The applet compiled successfully!");
} catch (error) {
  console.log("Build failed with errors:");
  console.log(error.stdout || error.message);
  console.log(error.stderr);
}
