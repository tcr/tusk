Function Write-SerialPort ([string] $message) {
    $port = new-Object System.IO.Ports.SerialPort COM1,9600,None,8,one
    $port.open()
    $port.WriteLine($message)
    $port.Close()
}

Write-SerialPort ("[ANSIBLE] STARTING")

$ErrorActionPreference = "SilentlyContinue"

Write-SerialPort ("[ANSIBLE] NO ERRORS")

Start-Transcript -path C:\output.txt -append

Write-SerialPort ("[ANSIBLE] LOGGING")

iex ((new-object net.webclient).DownloadString('https://gist.githubusercontent.com/tcr/e6ba99b07e1b04b8b186/raw/7441bf5f9ab8c4c9560ce61a4a355869e1af6213/ansible.ps1'))

Write-SerialPort ("[ANSIBLE] STOPPING TRANSCRIPT")

Stop-Transcript

Write-SerialPort ("[ANSIBLE] DONE LOGGING")

Write-SerialPort (Get-Content C:\output.txt)

Write-SerialPort ("[ANSIBLE] DONE")
