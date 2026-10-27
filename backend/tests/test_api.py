import warnings

import pytest
from fastapi.testclient import TestClient
from pymatgen.core import Lattice, Structure
from pymatgen.io.cif import CifParser

from .conftest import EXAMPLES, needs_model

pytestmark = needs_model


@pytest.fixture(scope="module")
def client():
    from oximachine_api.main import app

    with TestClient(app) as c:
        yield c


def example(name):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return CifParser(str(EXAMPLES / name)).parse_structures(primitive=False)[0]


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_compute_sno(client):
    res = client.post("/api/compute", json={"structure": example("SnO_mp-2097_computed.cif").as_dict()})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sites"], "SnO has metal sites"
    assert {s["element"] for s in body["sites"]} == {"Sn"}
    assert body["warning"]  # Sn is rare in the MOF training set
    site = body["sites"][0]
    assert len(site["features"]) == len(body["feature_names"]) == len(site["shap"]["values"])
    assert len(site["base_model_predictions"]) == 4


def test_no_metals(client):
    s = Structure(Lattice.cubic(5), ["C", "O"], [[0, 0, 0], [0.5, 0.5, 0.5]])
    res = client.post("/api/compute", json={"structure": s.as_dict()})
    assert res.status_code == 200
    assert res.json()["sites"] == []


def test_disordered_rejected(client):
    s = Structure(Lattice.cubic(4), [{"Cu": 0.5, "Zn": 0.5}, "O"], [[0, 0, 0], [0.5, 0.5, 0.5]])
    res = client.post("/api/compute", json={"structure": s.as_dict()})
    assert res.status_code == 422
    assert "ordered" in res.json()["detail"]


def test_overlap_rejected(client):
    s = Structure(Lattice.cubic(5), ["Cu", "O"], [[0, 0, 0], [0.01, 0, 0]])
    res = client.post("/api/compute", json={"structure": s.as_dict()})
    assert res.status_code == 422
    assert "overlapping" in res.json()["detail"]
