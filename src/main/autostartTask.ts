// Starts AULA Toolkit at sign-in with a Task Scheduler task instead of the Run key: it runs when the
// laptop is on battery, has no time limit, and can wait 30 s ("Enabled (delayed)"). The task belongs to
// the user, so no administrator rights. Checked at every start and rewritten when missing or out of date
// (deleted by hand, app moved, setting changed). The uninstaller removes it (resources/installer.nsh).
import { execFile } from 'node:child_process';
import { app } from 'electron';

export const TASK_NAME = 'AULA Toolkit';

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;

function run(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 30000 }, (e, out, err) => {
      if (e) reject(new Error(String(err || e.message).trim().split(/\r?\n/)[0]));
      else resolve(String(out).trim());
    });
  });
}

/** The exe to start: the portable build's own file when it runs from its temp folder. */
const exePath = (): string => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

/** 'off' removes the task; 'on' / 'delayed' make sure it exists as wanted. */
export async function applyAutostartTask(mode: 'off' | 'on' | 'delayed', log: (m: string) => void): Promise<void> {
  if (process.platform !== 'win32' || !app.isPackaged) return; // a dev run must not register electron.exe
  // The Run-key entry used before is replaced by the task.
  app.setLoginItemSettings({ openAtLogin: false });
  const name = q(TASK_NAME);
  try {
    if (mode === 'off') {
      const r = await run(`if (Get-ScheduledTask -TaskName ${name} -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName ${name} -Confirm:$false; 'removed' }`);
      if (r === 'removed') log('autostart task removed');
      return;
    }
    const delay = mode === 'delayed' ? 'PT30S' : 'PT0S';
    const r = await run(`
$exe = ${q(exePath())}; $arg = '--hidden'; $delay = '${delay}'
$u = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$t = Get-ScheduledTask -TaskName ${name} -ErrorAction SilentlyContinue
$d = if ($t -and $t.Triggers[0].Delay) { [string]$t.Triggers[0].Delay } else { 'PT0S' }
if ($t -and $t.Actions[0].Execute -eq $exe -and $t.Actions[0].Arguments -eq $arg -and $d -eq $delay -and $t.Principal.UserId -like "*$($env:USERNAME)") { 'ok'; exit }
$a = New-ScheduledTaskAction -Execute $exe -Argument $arg
$tr = New-ScheduledTaskTrigger -AtLogOn -User $u
$tr.Delay = $delay
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$p = New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName ${name} -Description 'Starts AULA Toolkit in the tray at sign-in.' -Action $a -Trigger $tr -Settings $s -Principal $p -Force | Out-Null
if ($t) { 'updated' } else { 'created' }`);
    if (r !== 'ok') log(`autostart task ${r}`);
  } catch (e) {
    log(`could not set up the autostart task: ${(e as Error).message}`);
  }
}
