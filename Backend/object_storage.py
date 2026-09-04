"""Private artifact storage with a Supabase Storage implementation and local fallback."""
from __future__ import annotations

import os
from pathlib import Path

import httpx


class ObjectStorage:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "flowstate-private")
        self.local_root = Path(__file__).parent / ".runtime" / "objects"

    async def put(self, path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        if self.url and self.key:
            endpoint = f"{self.url}/storage/v1/object/{self.bucket}/{path}"
            headers = {"Authorization": f"Bearer {self.key}", "apikey": self.key, "Content-Type": content_type, "x-upsert": "true"}
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(endpoint, headers=headers, content=content)
                if response.status_code == 404:
                    bucket_response = await client.post(
                        f"{self.url}/storage/v1/bucket",
                        headers={"Authorization": f"Bearer {self.key}", "apikey": self.key, "Content-Type": "application/json"},
                        json={"id": self.bucket, "name": self.bucket, "public": False},
                    )
                    if bucket_response.status_code not in {200, 201, 409}:
                        bucket_response.raise_for_status()
                    response = await client.post(endpoint, headers=headers, content=content)
                response.raise_for_status()
            return path
        target = self.local_root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return str(target)
