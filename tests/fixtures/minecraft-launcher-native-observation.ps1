param([string]$ProviderScript, [string]$HandleFile)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($ProviderScript, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'fixture_provider_parse_failed' }
foreach ($name in @('Get-HelixLauncherProfileObservation', 'Assert-HelixLauncherSelectedProfile')) {
  $definition = $ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  }, $true)
  if ($definition.Count -ne 1) { throw 'fixture_observer_missing' }
  . ([ScriptBlock]::Create($definition[0].Extent.Text))
}
$identity = Get-Content -LiteralPath $HandleFile -Raw | ConvertFrom-Json
# The only real UI read targets the separately created test window, never a
# user's Launcher or another application. No input is sent.
$observation = Get-HelixLauncherProfileObservation ([IntPtr]$identity.window_handle)
Assert-HelixLauncherSelectedProfile -WindowHandle ([IntPtr]$identity.window_handle) `
  -ExpectedProcessId $identity.process_id -ProfileName 'fixture-selected-profile' -ProfileVersion 'fabric-loader-fixture'
@{ schema = 'minecraft_launcher_native_observation_fixture.v1'; observation = $observation } | ConvertTo-Json -Depth 4 -Compress
