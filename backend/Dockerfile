# oxiMACHINE: React frontend + FastAPI backend in one image.
# Build from the repository root:
#   docker build -f backend/Dockerfile -t oximachine .
#   docker run -p 8000:8000 oximachine

FROM node:24-slim AS frontend
RUN npm install -g pnpm@11.5.3
WORKDIR /src/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/oximachine_api ./oximachine_api
RUN uv sync --frozen --no-dev
COPY --from=frontend /src/frontend/dist /app/frontend/dist

ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 8000
# One worker: the model and SHAP explainer are loaded per process.
CMD ["/app/backend/.venv/bin/uvicorn", "oximachine_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
