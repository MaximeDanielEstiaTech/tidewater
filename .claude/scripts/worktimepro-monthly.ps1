# Opens Git Bash with an interactive Claude Code session that runs /worktimepro.
# Start this script one time each day (for example at logon).
# The script opens the terminal only on the last working day (Monday to Friday) of the month,
# or on a later day of the same month if the computer was off. It opens the terminal one time each month.
#
# -Force  : open the terminal now, with no date check and no change to the state file.
# -DryRun : show the decision, but do not open the terminal and do not change the state file.
param([switch]$Force, [switch]$DryRun)

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$today = (Get-Date).Date
$month = $today.ToString('yyyy-MM')

# Find the last working day of the current month.
$lastWorkDay = (Get-Date -Year $today.Year -Month $today.Month -Day 1).Date.AddMonths(1).AddDays(-1)
while ($lastWorkDay.DayOfWeek -eq [DayOfWeek]::Saturday -or $lastWorkDay.DayOfWeek -eq [DayOfWeek]::Sunday) {
    $lastWorkDay = $lastWorkDay.AddDays(-1)
}

# The state file keeps the last month for which the script opened the terminal.
$stateFile = Join-Path $env:LOCALAPPDATA 'tidewater-mcp\worktimepro-last-run.txt'
$lastRun = ''
if (Test-Path $stateFile) { $lastRun = (Get-Content $stateFile -Raw).Trim() }

if (-not $Force) {
    if ($today -lt $lastWorkDay) {
        if ($DryRun) { "Skip: today $($today.ToString('yyyy-MM-dd')) is before the last working day $($lastWorkDay.ToString('yyyy-MM-dd'))." }
        exit 0
    }
    if ($lastRun -eq $month) {
        if ($DryRun) { "Skip: the terminal was already opened for $month." }
        exit 0
    }
}

if ($DryRun) { "Open: Claude Code with /worktimepro in $repo."; exit 0 }

# A forced run is a test or a manual run: do not record it, so that the scheduled run of the month still occurs.
if (-not $Force) {
    New-Item -ItemType Directory -Force (Split-Path $stateFile) | Out-Null
    Set-Content -Path $stateFile -Value $month -Encoding utf8
}

# Find git-bash.exe in a parent folder of git.exe.
$gitBash = $null
$dir = Split-Path (Get-Command git.exe -ErrorAction Stop).Source
while ($dir -and -not $gitBash) {
    if (Test-Path (Join-Path $dir 'git-bash.exe')) { $gitBash = Join-Path $dir 'git-bash.exe' }
    $dir = Split-Path $dir
}
if (-not $gitBash) { throw 'git-bash.exe not found.' }

# Run /worktimepro, then keep the Git Bash window open after Claude Code stops.
Start-Process $gitBash -ArgumentList @("--cd=`"$repo`"", '-c', '"claude /worktimepro; exec bash -l"')
