"""Tests for scripts/imgask.py — OpenRouter vision Q&A over screenshots."""

import importlib.util
import io
import json
import os
from pathlib import Path
from unittest import mock

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "imgask.py"


def load_imgask():
    spec = importlib.util.spec_from_file_location("imgask", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_payload_shape_base64_data_uri():
    mod = load_imgask()
    payload = mod.build_payload(b"\x89PNG", "image/png", "what?", "mymodel:free")
    assert payload["model"] == "mymodel:free"
    content = payload["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "what?"}
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_default_model_is_working_vision():
    mod = load_imgask()
    assert mod.DEFAULT_MODEL == "deepseek/deepseek-v4-flash-vision-exp"


def test_missing_key_raises():
    mod = load_imgask()
    with mock.patch.dict(os.environ, {}, clear=True), pytest.raises(RuntimeError):
        mod.get_key()


def test_ask_sends_bearer_and_returns_text():
    mod = load_imgask()
    fake_resp = {"choices": [{"message": {"content": "reticle right of gear"}}]}
    fake_fp = io.BytesIO(json.dumps(fake_resp).encode())
    with (
        mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "k123"}),
        mock.patch("urllib.request.urlopen", return_value=fake_fp) as m,
    ):
        out = mod.ask(b"img", "image/png", "where?", model="m:free")
    assert out == "reticle right of gear"
    req = m.call_args[0][0]
    assert req.get_header("Authorization") == "Bearer k123"


PICKUP_SHOT = Path("/home/ros2/Pictures/Screenshots/Screenshot from 2026-09-26 19-33-33.png")


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY") or not PICKUP_SHOT.exists(),
    reason="needs OPENROUTER_API_KEY + pickup screenshot",
)
def test_live_pickup_screenshot_nonempty():
    mod = load_imgask()
    out = mod.ask_file(
        str(PICKUP_SHOT), "Where is the gripper reticle relative to the gear? One sentence."
    )
    assert isinstance(out, str) and len(out.strip()) > 0
