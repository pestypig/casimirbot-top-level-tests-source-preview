param([string]$MutexName)
$mutex = [Threading.Mutex]::new($false, $MutexName)
try {
  if (-not $mutex.WaitOne(1000)) { throw 'fixture_mutex_unavailable' }
  try {
    [Console]::Out.WriteLine('fixture_mutex_ready')
    [Console]::Out.Flush()
    [void][Console]::ReadLine()
  } finally { $mutex.ReleaseMutex() }
} finally { $mutex.Dispose() }
