param([string]$FixtureRoot, [string]$ProviderScript)
$ErrorActionPreference = 'Stop'
. $ProviderScript
$env:APPDATA = Join-Path $FixtureRoot 'roaming'
$env:LOCALAPPDATA = Join-Path $FixtureRoot 'local'
$fixtureJavaRoot = Join-Path $env:APPDATA '.minecraft\runtime\java-runtime-delta\windows-x64\java-runtime-delta'
$script:fixtureJava = Join-Path $fixtureJavaRoot 'bin\java.exe'
New-Item -ItemType Directory -Path (Split-Path $script:fixtureJava) -Force | Out-Null
[IO.File]::WriteAllText($script:fixtureJava, 'inert fixture; never executed')
[IO.File]::WriteAllText((Join-Path $fixtureJavaRoot 'release'), 'JAVA_VERSION="21.0.7"')

# Replace only OS process observations/effects inside this isolated test process.
# Production profile, EULA, properties, journal and mutex code runs unchanged.
function Get-CimInstance { [CmdletBinding()] param([string]$ClassName)
  [pscustomobject]@{ FreePhysicalMemory = $script:freeMemory; TotalVisibleMemorySize = 16777216; FreeVirtualMemory = 8388608 }
}
function Get-Process { [CmdletBinding()] param([int]$Id)
  if ($script:fixtureProcess -and -not $script:exitAfterSpawn -and $Id -eq $script:fixtureProcess.Id) { $script:fixtureProcess }
}
function Get-NetTCPConnection { [CmdletBinding()] param([string]$State, [int]$LocalPort)
  if ($script:portConflict) { [pscustomobject]@{ OwningProcess = 9999; LocalAddress = '127.0.0.1' } }
  elseif ($script:fixtureProcess -and $script:allowListen) { [pscustomobject]@{ OwningProcess = $script:fixtureProcess.Id; LocalAddress = '127.0.0.1' } }
}
function Start-Sleep { [CmdletBinding()] param([int]$Seconds) }
function Start-Process { [CmdletBinding()] param([string]$FilePath, [string]$WorkingDirectory, [string[]]$ArgumentList, [string]$WindowStyle, [switch]$PassThru)
  if ($FilePath -ne $script:fixtureJava -or $WindowStyle -ne 'Hidden' -or
      ($ArgumentList -join '|') -ne ('-Xms256M|-Xmx1536M|-jar|"' + (Join-Path $WorkingDirectory 'fabric-server-launch.jar') + '"|nogui')) {
    throw 'fixture_unexpected_process_arguments'
  }
  $script:spawnCount++
  $script:fixtureProcess = [pscustomobject]@{ Id = 4321; Path = $FilePath; StartTime = [DateTime]::UtcNow.AddSeconds(-2) }
  if ($script:unknownSpawn) { throw 'fixture_lost_start_reply' }
  $script:fixtureProcess
}
function Stop-Process { throw 'fixture_process_replacement_forbidden' }
function Get-FixtureHash([string]$File) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { [BitConverter]::ToString($hash.ComputeHash([IO.File]::ReadAllBytes($File))) }
  finally { $hash.Dispose() }
}

$results = @()
foreach ($case in @('start_reuse', 'timeout_reconcile', 'exit_before_ready', 'unknown_outcome',
    'port_conflict', 'pid_reuse', 'wrong_port', 'remote_bind', 'missing_eula', 'duplicate_eula',
    'escaped_property', 'uppercase_ip', 'uppercase_eula', 'corrupt_state', 'memory_ceiling', 'mutex_busy', 'missing_java')) {
  $run = Join-Path $FixtureRoot $case
  New-Item -ItemType Directory -Path (Join-Path $run 'config') -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $run 'fabric-server-launch.jar'), 'inert fixture')
  [IO.File]::WriteAllText((Join-Path $run 'server.properties'), "server-ip=127.0.0.1`nserver-port=25566`nquery.port=25566`nrcon.port=25575`nrcon.password=fixture-private-property`n")
  [IO.File]::WriteAllText((Join-Path $run 'eula.txt'), "# fixture only`neula=true`n")
  $script:fixtureProcess = $null; $script:spawnCount = 0; $script:allowListen = $true
  $script:portConflict = $false; $script:exitAfterSpawn = $false; $script:unknownSpawn = $false
  $script:freeMemory = 8388608
  switch ($case) {
    'timeout_reconcile' { $script:allowListen = $false }
    'exit_before_ready' { $script:exitAfterSpawn = $true }
    'unknown_outcome' { $script:unknownSpawn = $true }
    'port_conflict' { $script:portConflict = $true }
    'wrong_port' { [IO.File]::WriteAllText((Join-Path $run 'server.properties'), "server-ip=127.0.0.1`nserver-port=25565`n") }
    'remote_bind' { [IO.File]::WriteAllText((Join-Path $run 'server.properties'), "server-ip=0.0.0.0`nserver-port=25566`n") }
    'missing_eula' { [IO.File]::WriteAllText((Join-Path $run 'eula.txt'), 'eula=false') }
    'duplicate_eula' { [IO.File]::WriteAllText((Join-Path $run 'eula.txt'), "eula=false`neula=true") }
    'escaped_property' { [IO.File]::AppendAllText((Join-Path $run 'server.properties'), '\u0073erver-ip=0.0.0.0') }
    'uppercase_ip' { [IO.File]::WriteAllText((Join-Path $run 'server.properties'), "SERVER-IP=127.0.0.1`nserver-port=25566`n") }
    'uppercase_eula' { [IO.File]::WriteAllText((Join-Path $run 'eula.txt'), 'EULA=true') }
    'corrupt_state' { [IO.File]::WriteAllText((Join-Path $run 'config\helix-fabric-server.workstation-state.json'), '{broken') }
    'memory_ceiling' { $script:freeMemory = 524288 }
    'missing_java' { [IO.File]::WriteAllText((Join-Path $fixtureJavaRoot 'release'), 'JAVA_VERSION="8.0.1"') }
  }
  $propertiesBefore = Get-FixtureHash (Join-Path $run 'server.properties')
  $eulaBefore = Get-FixtureHash (Join-Path $run 'eula.txt')
  $first = Invoke-HelixSavedFabricServer -RunDirectory $run -ServerAddress '127.0.0.1:25566' -StartupTimeoutSeconds 1
  $second = $null
  if ($case -in @('start_reuse', 'timeout_reconcile', 'pid_reuse', 'unknown_outcome')) {
    $script:allowListen = $true
    if ($case -eq 'pid_reuse') { $script:fixtureProcess.StartTime = $script:fixtureProcess.StartTime.AddSeconds(1) }
    $second = Invoke-HelixSavedFabricServer -RunDirectory $run -ServerAddress '127.0.0.1:25566' -StartupTimeoutSeconds 1
  }
  if ($propertiesBefore -ne (Get-FixtureHash (Join-Path $run 'server.properties')) -or
      $eulaBefore -ne (Get-FixtureHash (Join-Path $run 'eula.txt'))) { throw 'fixture_configuration_modified' }
  $results += @{ case = $case; first = $first; second = $second; spawns = $script:spawnCount }
}
@{ schema = 'minecraft_server_lifecycle_fixture.v1'; results = $results } | ConvertTo-Json -Depth 9 -Compress
