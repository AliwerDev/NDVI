"""Tests for the nitrogen advice from NDRE."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Field
from app.services.history import save_observation
from app.services.recommendations import nitrogen_advice, nitrogen_level
from tests.factories import make_result

# Defaults: low below 0.20, ok from 0.30, no advice below NDVI 0.30.
SETTINGS = Settings(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("ndre", "ndvi", "expected"),
    [
        (0.15, 0.6, "low"),
        (0.20, 0.6, "medium"),
        (0.29, 0.6, "medium"),
        (0.30, 0.6, "ok"),
        (0.10, 0.25, "unknown"),
        (None, 0.6, None),
    ],
)
def test_nitrogen_level(ndre: float | None, ndvi: float, expected: str | None) -> None:
    assert nitrogen_level(ndre, ndvi, SETTINGS) == expected


def test_advice_text_and_thresholds() -> None:
    advice = nitrogen_advice(0.15, 0.6, SETTINGS)

    assert advice is not None
    assert "azot yetishmasligi" in advice.text
    assert (advice.low_threshold, advice.ok_threshold) == (0.20, 0.30)


def test_history_endpoint_returns_indices_and_advice(db_client: TestClient, db_session: Session, field: Field) -> None:
    save_observation(db_session, field.id, make_result(10, 0.6))
    save_observation(db_session, field.id, make_result(15, 0.6, ndmi=-0.05, ndre=0.15))

    old, new = db_client.get(f"/fields/{field.id}/ndvi").json()

    assert old["ndmi_mean"] is None and old["ndre_mean"] is None
    assert old["nitrogen_advice"] is None
    assert new["ndmi_mean"] == -0.05
    assert new["ndre_min"] == pytest.approx(0.05)
    assert new["nitrogen_advice"]["level"] == "low"
