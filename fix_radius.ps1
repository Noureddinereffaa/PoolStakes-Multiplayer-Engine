$filePath = "c:\Users\DELL\Desktop\multiplayer-8-ball-pool\src\components\PoolTable.tsx"
$content = Get-Content $filePath -Raw -Encoding UTF8
$lines = $content -split "`r?`n"

for ($i = 1200; $i -lt 1580; $i++) {
    if ($lines[$i] -match 'b\.radius') {
        $lines[$i] = $lines[$i] -replace 'b\.radius', 'ballRadius'
    }
}

$result = $lines -join "`r`n"
[System.IO.File]::WriteAllText($filePath, $result, [System.Text.Encoding]::UTF8)
Write-Host "Done replacing b.radius with ballRadius in lines 1201-1580"
