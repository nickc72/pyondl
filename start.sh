#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=============================================================="
echo "  PyonDL - Manga & Gallery Downloader & Reader"
echo "=============================================================="
echo ""

if [ ! -d ".venv" ]; then
    echo "[INFO] Virtual environment not found. Setting up .venv..."
    python3 -m venv .venv || python -m venv .venv
    echo "[INFO] Installing required dependencies..."
    ./.venv/bin/pip install --upgrade pip
    ./.venv/bin/pip install -r requirements.txt
    echo "[INFO] Setup complete!"
    echo ""
fi

echo "Starting PyonDL..."
if [ -f ".venv/bin/python" ]; then
    ./.venv/bin/python run.py
else
    python3 run.py || python run.py
fi
