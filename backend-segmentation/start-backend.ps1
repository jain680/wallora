# Start the SAM wall-segmentation backend (required for click-to-paint)
$bd = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $bd "venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Missing venv. Run from backend-segmentation folder:"
  Write-Host "  python -m venv venv"
  Write-Host "  .\venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu"
  Write-Host "  .\venv\Scripts\pip install transformers flask flask-cors opencv-python scikit-image pillow numpy"
  exit 1
}

Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
Set-Location $bd
Write-Host "Starting segmentation API on http://127.0.0.1:5000 ..."
& $py segmentation_api.py
