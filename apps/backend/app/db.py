from typing import Literal

import psycopg

DatabaseState = Literal["ok", "unconfigured", "unreachable"]


def check_database(url: str | None, timeout_s: int = 2) -> DatabaseState:
    """Reports whether the database answers. Never raises and never echoes the URL."""
    if not url:
        return "unconfigured"
    try:
        with psycopg.connect(url, connect_timeout=timeout_s) as connection:
            connection.execute("SELECT 1")
    except (psycopg.Error, OSError):
        return "unreachable"
    return "ok"
