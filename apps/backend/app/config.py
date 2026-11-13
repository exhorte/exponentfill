from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings, read from `EF_*` environment variables.

    Secrets (the database URL carries a password, the master key protects every user's data key)
    are never logged or returned by the API.
    """

    model_config = SettingsConfigDict(env_prefix="EF_", extra="ignore")

    env: str = "dev"  # "dev" or "prod"
    database_url: str | None = None
    # Interactive API docs are off by default; enable them only in local development.
    enable_docs: bool = False

    # --- Identity & vault (ADR-019 to 021) ---
    # 32 random bytes, base64. REQUIRED in prod. In dev, one is generated into `dev_master_key_path` when absent.
    master_key: str | None = None
    dev_master_key_path: str = "var/dev-master.key"
    # Where the encrypted documents live: "file" (a local directory, `storage_dir`) or "db" (the database, ADR-024: use it on a
    # host whose file system is ephemeral).
    blob_backend: str = "file"
    storage_dir: str = "var/storage"
    session_ttl_hours: int = 168
    device_ttl_days: int = 90
    deletion_grace_days: int = 7
    purge_grace_days: int = 7
    max_upload_mb: int = 20
    # Comma-separated origins allowed to call the API cross-origin. Empty (default) = no CORS at all. Never "*".
    dashboard_origins: str = ""
    extension_origins: str = ""
    cookie_secure: bool | None = None  # None: secure unless env == "dev"
    mail_backend: str = "outbox"
    # "default" = Argon2id library defaults; "fast" = cheap parameters for tests ONLY.
    password_hash_profile: str = "default"

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"

    @property
    def cookies_secure(self) -> bool:
        return self.cookie_secure if self.cookie_secure is not None else self.env != "dev"

    @property
    def cors_origins(self) -> list[str]:
        raw = f"{self.dashboard_origins},{self.extension_origins}"
        return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
