"""FastAPI app: POST /api/compute, plus the built frontend when available.

Run:  uvicorn oximachine_api.main:app
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .model import OximachineModel
from .schemas import ComputeRequest, ComputeResponse
from .service import InputError, compute

FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", Path(__file__).parents[2] / "frontend" / "dist"))

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    model = OximachineModel()
    _ = model.explainer  # build the SHAP explainer at startup, not on the first request
    state["model"] = model
    yield
    state.clear()


app = FastAPI(title="oxiMACHINE", version="2.0.0", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model_version": state["model"].version}


# Plain `def`: featurization is CPU-bound, so FastAPI runs it in its threadpool
# instead of blocking the event loop.
@app.post("/api/compute", response_model=ComputeResponse)
def compute_endpoint(request: ComputeRequest) -> ComputeResponse:
    try:
        return compute(request.structure, request.approximate_shap, state["model"])
    except InputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
