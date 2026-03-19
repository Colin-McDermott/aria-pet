import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

const SHOTS = '/home/colin/projects/apps/aria-pet/screenshots';
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

let num = 0;
function shot(name) {
  num++;
  const path = `${SHOTS}/${String(num).padStart(2, '0')}_${name}.png`;
  try {
    // Find and focus ARIA window
    execSync('xdotool search --name "ARIA" windowactivate 2>/dev/null || xdotool search --name "Nebath" windowactivate 2>/dev/null', { timeout: 3000 });
    execSync('sleep 0.5');
    execSync(`spectacle -b -a -o ${path}`, { timeout: 5000 });
    console.log(`  📸 ${path}`);
  } catch (e) {
    console.log(`  ⚠ Screenshot failed: ${name}`);
  }
}

console.log('🧪 ARIA Screenshot Test\n');

// Wait for app to be ready
execSync('sleep 2');
shot('main_view');

// Wait for creature to animate
execSync('sleep 3');
shot('creature_animated');

// Click creature (poke)
try {
  const wid = execSync('xdotool search --name "ARIA" 2>/dev/null || xdotool search --name "Nebath" 2>/dev/null').toString().trim().split('\n')[0];
  if (wid) {
    execSync(`xdotool mousemove --window ${wid} 150 180`);
    execSync('sleep 0.5');
    shot('mouse_hover');
    execSync(`xdotool click --window ${wid} 1`);
    execSync('sleep 0.5');
    shot('after_poke');
    // Double click (tickle)
    execSync(`xdotool click --window ${wid} --repeat 2 --delay 100 1`);
    execSync('sleep 0.5');
    shot('after_tickle');
  }
} catch (e) {
  console.log('  ⚠ Interaction test failed');
}

// Wait for more animation
execSync('sleep 5');
shot('idle_state');

console.log(`\n✅ ${num} screenshots saved to ${SHOTS}/`);
