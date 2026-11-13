FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    PATH="/srv/.venv/bin:$PATH"

RUN pip install --no-cache-dir uv==0.11.16

WORKDIR /srv

# Dependencies first (cached layer), then the application.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./

# Run as an unprivileged user with no home directory. uv is only needed at build time:
# the runtime command uses the virtual environment that `uv sync` created.
RUN useradd --no-create-home --uid 10001 ef && mkdir -p /srv/var && chown -R ef /srv
USER ef

EXPOSE 8010
# Migrations run at start (idempotent), then the API. A host may impose the port (PORT); locally it stays 8010.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8010}"]
