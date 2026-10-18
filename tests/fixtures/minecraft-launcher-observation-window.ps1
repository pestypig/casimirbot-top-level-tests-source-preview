param([Parameter(Mandatory)][string]$HandleFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# An inert fixture owned by the test. No Launcher, account or consent UI is
# opened or operated. The fixture closes itself even if the test is interrupted.
$form = [Windows.Forms.Form]::new()
$form.Text = 'CasimirBot isolated profile observation fixture'
$form.Size = [Drawing.Size]::new(640, 300)
$form.ShowInTaskbar = $false
$button = [Windows.Forms.Button]::new()
$button.Text = 'fixture-selected-profile fabric-loader-fixture'
$button.Size = [Drawing.Size]::new(450, 45)
$button.Location = [Drawing.Point]::new(20, 30)
$form.Controls.Add($button)
$disabled = [Windows.Forms.Button]::new()
$disabled.Text = 'disabled fixture control'
$disabled.Enabled = $false
$disabled.Location = [Drawing.Point]::new(20, 100)
$form.Controls.Add($disabled)
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 15000
$timer.Add_Tick({ $form.Close() })
$form.Add_Shown({
  [IO.File]::WriteAllText($HandleFile, (@{ window_handle = $form.Handle.ToInt64(); process_id = $PID } | ConvertTo-Json -Compress))
  $timer.Start()
})
try { [Windows.Forms.Application]::Run($form) }
finally { $timer.Dispose(); $form.Dispose() }
