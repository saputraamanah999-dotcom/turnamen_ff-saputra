"""Jalankan STIKAR AI OBSERVER via uvicorn pada 127.0.0.1:8077."""
from __future__ import annotations

import uvicorn

from app.config import get_settings


def main() -> None:
    """Bind default localhost-only; konfigurasi baca dari env/.env."""
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,   # default 127.0.0.1 (jangan diekspos publik)
        port=settings.port,   # default 8077
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
