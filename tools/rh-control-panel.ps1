Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ApiPath = Join-Path $ProjectRoot "apps\api"
$WebPath = Join-Path $ProjectRoot "apps\web"

function Add-Log {
  param([string]$Text)
  $timestamp = Get-Date -Format "HH:mm:ss"
  $logBox.AppendText("[$timestamp] $Text`r`n")
  $logBox.SelectionStart = $logBox.Text.Length
  $logBox.ScrollToCaret()
  [System.Windows.Forms.Application]::DoEvents()
}

function Invoke-InFolder {
  param(
    [string]$Title,
    [string]$Folder,
    [scriptblock]$Command
  )
  Add-Log "== $Title =="
  Add-Log "Path: $Folder"
  $old = Get-Location
  try {
    Set-Location -LiteralPath $Folder
    $output = & $Command 2>&1 | Out-String
    if ($output.Trim()) { Add-Log $output.TrimEnd() }
    Add-Log "Done."
  } catch {
    Add-Log "ERROR: $($_.Exception.Message)"
  } finally {
    Set-Location $old
  }
}

function Start-DevProcess {
  param(
    [string]$Title,
    [string]$Folder,
    [string]$Command
  )
  Add-Log "Starting $Title..."
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $Folder -ArgumentList "-NoExit", "-Command", $Command
}

function New-Button {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$W,
    [int]$H,
    [scriptblock]$OnClick
  )
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($W, $H)
  $button.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  $button.Add_Click($OnClick)
  $form.Controls.Add($button)
  return $button
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "RH Solution Control Panel"
$form.Size = New-Object System.Drawing.Size(940, 650)
$form.StartPosition = "CenterScreen"
$form.MinimumSize = New-Object System.Drawing.Size(840, 560)

$title = New-Object System.Windows.Forms.Label
$title.Text = "RH Solution - Local Control Panel"
$title.Location = New-Object System.Drawing.Point(18, 14)
$title.Size = New-Object System.Drawing.Size(620, 28)
$title.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = "Project: $ProjectRoot"
$pathLabel.Location = New-Object System.Drawing.Point(20, 46)
$pathLabel.Size = New-Object System.Drawing.Size(860, 22)
$pathLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Controls.Add($pathLabel)

$commitLabel = New-Object System.Windows.Forms.Label
$commitLabel.Text = "Commit message"
$commitLabel.Location = New-Object System.Drawing.Point(20, 82)
$commitLabel.Size = New-Object System.Drawing.Size(150, 20)
$form.Controls.Add($commitLabel)

$commitBox = New-Object System.Windows.Forms.TextBox
$commitBox.Text = "Update RH Solution"
$commitBox.Location = New-Object System.Drawing.Point(170, 78)
$commitBox.Size = New-Object System.Drawing.Size(440, 28)
$form.Controls.Add($commitBox)

New-Button "Start API" 20 125 130 38 {
  Start-DevProcess "API" $ApiPath "npm run start:dev"
}

New-Button "Start Web" 160 125 130 38 {
  Start-DevProcess "Web" $WebPath "npm run dev"
}

New-Button "Stop Node" 300 125 130 38 {
  $answer = [System.Windows.Forms.MessageBox]::Show("This stops Node processes on this machine. Continue?", "Stop Node", "YesNo", "Warning")
  if ($answer -eq "Yes") {
    Invoke-InFolder "Stop Node processes" $ProjectRoot {
      Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    }
  }
}

New-Button "Git Status" 20 178 130 38 {
  Invoke-InFolder "Git status" $ProjectRoot { git status --short }
}

New-Button "Pull" 160 178 130 38 {
  Invoke-InFolder "Git pull" $ProjectRoot { git pull }
}

New-Button "Commit + Push" 300 178 170 38 {
  $message = $commitBox.Text.Trim()
  if (-not $message) {
    [System.Windows.Forms.MessageBox]::Show("Write a commit message first.", "Missing message", "OK", "Information") | Out-Null
    return
  }
  Invoke-InFolder "Stage selected project files" $ProjectRoot {
    git add .gitignore RH-Control-Panel.cmd tools apps/api apps/web
  }
  Invoke-InFolder "Commit" $ProjectRoot {
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
      "No staged changes to commit."
    } else {
      git commit -m $message
    }
  }
  Invoke-InFolder "Push" $ProjectRoot { git push }
}

New-Button "Prisma Deploy" 20 231 130 38 {
  Invoke-InFolder "Prisma migrate deploy" $ApiPath { npx prisma migrate deploy }
}

New-Button "Prisma Generate" 160 231 130 38 {
  Invoke-InFolder "Prisma generate" $ApiPath { npx prisma generate }
}

New-Button "Install Deps" 300 231 130 38 {
  Invoke-InFolder "npm install API" $ApiPath { npm install }
  Invoke-InFolder "npm install Web" $WebPath { npm install }
}

New-Button "Build All" 440 231 130 38 {
  Invoke-InFolder "Build API" $ApiPath { npm run build }
  Invoke-InFolder "Build Web" $WebPath { npm run build }
}

New-Button "Open App" 580 231 130 38 {
  Start-Process "http://localhost:5173"
}

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(20, 290)
$logBox.Size = New-Object System.Drawing.Size(880, 295)
$logBox.Anchor = "Top,Bottom,Left,Right"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

Add-Log "Ready."
Add-Log "Double-click RH-Control-Panel.cmd to open this window."
Add-Log "Commit + Push stages only project code folders and ignores .env / *.backup via .gitignore."

[void]$form.ShowDialog()
