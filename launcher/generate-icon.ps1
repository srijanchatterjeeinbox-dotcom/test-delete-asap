# Dr. Pandey Clinic - Windows Multi-Resolution Icon Generator
# Generates Windows .ico containing 256x256, 128x128, 64x64, 48x48, 32x32, 16x16

param(
    [string]$SourcePath = "$PSScriptRoot\..\assets\logo.webp",
    [string]$OutputIco = "$PSScriptRoot\..\assets\logo.ico",
    [string]$OutputPng = "$PSScriptRoot\..\assets\logo.png",
    [string]$PublicPng = "$PSScriptRoot\..\public\logo.png"
)

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $SourcePath)) {
    Write-Error "Source image not found: $SourcePath"
    exit 1
}

Write-Host "Loading source logo from: $SourcePath"
$uri = [System.Uri]::new((Resolve-Path $SourcePath).Path)
$decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($uri, [System.Windows.Media.Imaging.BitmapCreateOptions]::None, [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
$encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
$encoder.Frames.Add($decoder.Frames[0])
$ms = [System.IO.MemoryStream]::new()
$encoder.Save($ms)
$ms.Position = 0
$srcBmp = [System.Drawing.Bitmap]::new($ms)

# Crop the emblem portion (x: 28 to 356, y: 30 to 400)
$cropX = 28
$cropY = 30
$cropW = 328
$cropH = 370

$emblem = [System.Drawing.Bitmap]::new($cropW, $cropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($emblem)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($srcBmp, [System.Drawing.Rectangle]::new(0, 0, $cropW, $cropH), [System.Drawing.Rectangle]::new($cropX, $cropY, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

# Create a 512x512 master canvas with transparent background
$master = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gm = [System.Drawing.Graphics]::FromImage($master)
$gm.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gm.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gm.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gm.Clear([System.Drawing.Color]::Transparent)

# Fit emblem inside master canvas with comfortable padding
$targetH = 460
$scale = $targetH / $cropH
$targetW = [int]($cropW * $scale)
$targetX = [int]((512 - $targetW) / 2)
$targetY = [int]((512 - $targetH) / 2)

$gm.DrawImage($emblem, [System.Drawing.Rectangle]::new($targetX, $targetY, $targetW, $targetH), [System.Drawing.Rectangle]::new(0, 0, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)
$gm.Dispose()
$emblem.Dispose()

# Flood-fill transparency from borders to convert outer white to transparent
$visited = New-Object 'bool[,]' 512, 512
$queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()

for ($x = 0; $x -lt 512; $x++) {
    $queue.Enqueue([System.Drawing.Point]::new($x, 0))
    $queue.Enqueue([System.Drawing.Point]::new($x, 511))
    $visited[$x, 0] = $true
    $visited[$x, 511] = $true
}
for ($y = 0; $y -lt 512; $y++) {
    $queue.Enqueue([System.Drawing.Point]::new(0, $y))
    $queue.Enqueue([System.Drawing.Point]::new(511, $y))
    $visited[0, $y] = $true
    $visited[511, $y] = $true
}

while ($queue.Count -gt 0) {
    $pt = $queue.Dequeue()
    $c = $master.GetPixel($pt.X, $pt.Y)
    if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) {
        $master.SetPixel($pt.X, $pt.Y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
        
        $neighbors = @(
            [System.Drawing.Point]::new($pt.X + 1, $pt.Y),
            [System.Drawing.Point]::new($pt.X - 1, $pt.Y),
            [System.Drawing.Point]::new($pt.X, $pt.Y + 1),
            [System.Drawing.Point]::new($pt.X, $pt.Y - 1)
        )
        foreach ($n in $neighbors) {
            if ($n.X -ge 0 -and $n.X -lt 512 -and $n.Y -ge 0 -and $n.Y -lt 512) {
                if (-not $visited[$n.X, $n.Y]) {
                    $visited[$n.X, $n.Y] = $true
                    $queue.Enqueue($n)
                }
            }
        }
    }
}

# Save Master PNG
$master.Save($OutputPng, [System.Drawing.Imaging.ImageFormat]::Png)
if ($PublicPng) {
    $master.Save($PublicPng, [System.Drawing.Imaging.ImageFormat]::Png)
}
Write-Host "Generated PNG: $OutputPng"

# Generate multi-resolution icon (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngBytesList = @()

foreach ($sz in $sizes) {
    $resized = [System.Drawing.Bitmap]::new($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gr = [System.Drawing.Graphics]::FromImage($resized)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gr.Clear([System.Drawing.Color]::Transparent)
    $gr.DrawImage($master, [System.Drawing.Rectangle]::new(0, 0, $sz, $sz), [System.Drawing.Rectangle]::new(0, 0, 512, 512), [System.Drawing.GraphicsUnit]::Pixel)
    $gr.Dispose()

    $pms = [System.IO.MemoryStream]::new()
    $resized.Save($pms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pms.ToArray()
    $pms.Dispose()
    $resized.Dispose()
    $pngBytesList += ,@($sz, $pngBytes)
}
$master.Dispose()
$srcBmp.Dispose()

# Package into .ico format
$fs = [System.IO.FileStream]::new($OutputIco, [System.IO.FileMode]::Create)
$bw = [System.IO.BinaryWriter]::new($fs)

# ICONHEADER: 6 bytes
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type: 1 = Icon
$bw.Write([uint16]$pngBytesList.Count) # Count: 6

$offset = 6 + ($pngBytesList.Count * 16)

foreach ($item in $pngBytesList) {
    $sz = $item[0]
    $data = $item[1]
    $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $hByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $bw.Write($wByte) # Width
    $bw.Write($hByte) # Height
    $bw.Write([byte]0) # ColorCount
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Planes
    $bw.Write([uint16]32) # BitCount
    $bw.Write([uint32]$data.Length) # BytesInRes
    $bw.Write([uint32]$offset) # ImageOffset

    $offset += $data.Length
}

foreach ($item in $pngBytesList) {
    $data = $item[1]
    $bw.Write($data)
}

$bw.Flush()
$bw.Close()
$fs.Close()

Write-Host "Generated multi-resolution ICO: $OutputIco"
Write-Host "Resolutions included: $($sizes -join ', ') px"

