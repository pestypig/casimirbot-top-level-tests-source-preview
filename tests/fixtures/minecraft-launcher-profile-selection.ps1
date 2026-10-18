param([string]$ProviderScript)
$ErrorActionPreference = 'Stop'
# Load only the real independent functions from the production AST. Never run
# the full launcher script or introduce a production fixture/consent bypass.
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ProviderScript, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'fixture_provider_parse_failed' }
$definition = $ast.FindAll({ param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
  $node.Name -eq 'Assert-HelixLauncherSelectedProfile'
}, $true)
if ($definition.Count -ne 1) { throw 'fixture_profile_guard_missing' }
. ([ScriptBlock]::Create($definition[0].Extent.Text))
function Get-HelixLauncherProfileObservation([IntPtr]$WindowHandle) {
  if ($script:unavailable) { throw 'fixture_private_observation_failure' }
  return $script:observation
}
$cases = @()
foreach ($case in @('current_selection', 'multiline_selection', 'wrong_profile', 'wrong_version', 'wrong_process', 'missing', 'empty_observation', 'ambiguous', 'unavailable', 'case_mismatch', 'window_frame_loading', 'populated_wrong_profile')) {
  $expected = 'helix-combat-c0-isolated fabric-loader-0.18.4-1.21.8'
  $script:observation = @{ process_id = 1234; button_names = @('PLAY', $expected) }
  $script:unavailable = $false
  switch ($case) {
    'multiline_selection' { $script:observation.button_names = @("helix-combat-c0-isolated`r`nfabric-loader-0.18.4-1.21.8") }
    'wrong_profile' { $script:observation.button_names = @('other-profile fabric-loader-0.18.4-1.21.8') }
    'wrong_version' { $script:observation.button_names = @('helix-combat-c0-isolated fabric-loader-0.18.3-1.21.8') }
    'wrong_process' { $script:observation.process_id = 5678 }
    'missing' { $script:observation.button_names = @('PLAY') }
    'empty_observation' { $script:observation.button_names = @() }
    'ambiguous' { $script:observation.button_names = @($expected, $expected) }
    'unavailable' { $script:unavailable = $true }
    'case_mismatch' { $script:observation.button_names = @($expected.ToUpperInvariant()) }
    'window_frame_loading' { $script:observation.button_names = @('Minimize', 'Maximize', 'Close') }
    'populated_wrong_profile' { $script:observation.button_names = @('Minimize', 'Maximize', 'Close', 'PLAY', 'other-profile fabric-loader-0.18.4-1.21.8') }
  }
  try {
    Assert-HelixLauncherSelectedProfile -WindowHandle ([IntPtr]1) -ExpectedProcessId 1234 `
      -ProfileName 'helix-combat-c0-isolated' -ProfileVersion 'fabric-loader-0.18.4-1.21.8'
    $cases += @{ case = $case; ok = $true }
  } catch { $cases += @{ case = $case; ok = $false; error = $_.Exception.Message } }
}
@{ schema = 'minecraft_launcher_profile_fixture.v1'; cases = $cases } | ConvertTo-Json -Depth 4 -Compress
