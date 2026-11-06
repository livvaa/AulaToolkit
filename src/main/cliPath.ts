// Puts the `aula` command (resources\bin) on the user's PATH, so it works from any terminal opened
// afterwards. Installed builds only: the portable one has no fixed place. The uninstaller takes it off
// again (resources/installer.nsh). User PATH, so no administrator rights.
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';

const script = (dir: string): string => `
$dir = '${dir.replace(/'/g, "''")}'
$cur = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @($cur -split ';' | Where-Object { $_ })
if ($parts | Where-Object { $_.TrimEnd('\\') -ieq $dir.TrimEnd('\\') }) { 'present'; exit }
[Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')
'added'`;

export function ensureCliOnPath(log: (message: string) => void): void {
  if (process.platform !== 'win32' || !app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  const dir = join(process.resourcesPath, 'bin');
  execFile('powershell.exe', ['-NoProfile', '-Command', script(dir)], { windowsHide: true, timeout: 20000 }, (e, out) => {
    if (e) log(`could not add the aula command to PATH: ${e.message}`);
    else if (String(out).trim() === 'added') log(`aula command added to PATH (${dir}); new terminals will find it`);
  });
}
