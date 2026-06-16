# PowerShell script to automatically extract direct file links from public Google Drive folders
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$csvFiles = Get-ChildItem -Filter "*.csv"
if ($csvFiles.Count -eq 0) {
    Write-Error "CSV file not found in the current directory!"
    exit
}
$csvPath = $csvFiles[0].FullName
Write-Output "Using CSV file: $($csvFiles[0].Name)"

Write-Output "Reading CSV records..."
$documents = Import-Csv -Path $csvPath -Encoding UTF8

# Find unique Google Drive folders
$uniqueFolders = $documents | Group-Object "Link sub folder" | Select-Object -ExpandProperty Name | Where-Object { $_ -ne "" }

Write-Output "Found $( $uniqueFolders.Count ) unique Google Drive folders."

# Create temporary directory for downloads
$tempDir = "./temp_folders"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$folderFilesMap = @{}
$folderIndex = 1

# Download each folder HTML page
foreach ($folderUrl in $uniqueFolders) {
    $folderId = ""
    if ($folderUrl -match 'folders/([a-zA-Z0-9_-]+)') {
        $folderId = $Matches[1]
    }
    
    if ([string]::IsNullOrEmpty($folderId)) {
        Write-Warning "Could not parse folder ID from: $folderUrl"
        continue
    }
    
    $htmlPath = "$tempDir/folder_$folderIndex.html"
    Write-Output "Retrieving folder index $folderIndex/$( $uniqueFolders.Count ): ID = $folderId"
    
    if (-not (Test-Path $htmlPath)) {
        curl.exe -sL "$folderUrl" -o "$htmlPath"
        Start-Sleep -Milliseconds 600
    }
    
    $folderFilesMap[$folderUrl] = $htmlPath
    $folderIndex++
}

# Match filenames to their IDs
Write-Output "`nMapping filenames to direct Google Drive file IDs..."
$linkMapping = @{}

foreach ($doc in $documents) {
    $fileName = $doc."File Name"
    $folderUrl = $doc."Link sub folder"
    
    if ([string]::IsNullOrEmpty($fileName) -or [string]::IsNullOrEmpty($folderUrl)) { continue }
    
    $htmlPath = $folderFilesMap[$folderUrl]
    if (-not (Test-Path $htmlPath) -or (Get-Item $htmlPath).Length -eq 0) { continue }
    
    $html = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)
    
    # Try finding exact match
    $index = $html.IndexOf($fileName)
    if ($index -eq -1) {
        # Fallback: try searching with minor space cleanup if exact fails
        $cleanFileName = $fileName.Replace(" ", " ")
        $index = $html.IndexOf($cleanFileName)
    }
    
    if ($index -eq -1) {
        Write-Warning "File not found in folder HTML: $fileName"
        continue
    }
    
    # Look backward 2000 characters for the data-id attribute
    $start = [Math]::Max(0, $index - 2000)
    $snippet = $html.Substring($start, $index - $start)
    
    $fileId = ""
    if ($snippet -match 'data-id="([a-zA-Z0-9_-]{28,45})"') {
        $fileId = $Matches[1]
    } elseif ($snippet -match '\b(1[a-zA-Z0-9_-]{32})\b') {
        $fileId = $Matches[1]
    }
    
    if (-not [string]::IsNullOrEmpty($fileId)) {
        $linkMapping[$fileName] = $fileId
        Write-Output "SUCCESS: $fileName -> $fileId"
    } else {
        Write-Warning "Failed to extract ID for: $fileName"
    }
}

# Save mappings to JavaScript file to bypass file:// CORS
$jsPath = "./public/file_links.js"
$json = $linkMapping | ConvertTo-Json
$jsContent = "window.fileLinksMap = $json;"
[System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.Encoding]::UTF8)

Write-Output "`nDone! Saved mapping of $( $linkMapping.Count )/$( $documents.Count ) files to: $jsPath"

# Cleanup temporary folder
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
