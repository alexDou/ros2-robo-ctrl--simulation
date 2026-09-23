"""Backwards-compatible shim: implementation lives in `edge_bridge/` package."""

from arm_controller.edge_bridge.node import EdgeBridgeNode, main

__all__ = ["EdgeBridgeNode", "main"]
