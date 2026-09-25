---
# hand-sim-m7sd
title: 'Unit 7: strict SRV contract, remove color/intact defaults'
status: todo
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-25T10:41:04Z
updated_at: 2026-09-25T10:41:15Z
parent: hand-sim-u2tx
---

SpawnObject.srv and GetDropSlot.srv declare string color WHITE + bool intact true defaults, reintroducing the silent WHITE fallback the wireframe forbids (REQUIRED color + REQUIRED intact, missing either fails validation). Remove defaults from both .srv files; harden workcell_node handlers to reject empty/unknown color instead of 'or DEFAULT_GEAR_COLOR' fallback; update GetDropSlot bare-query path (WHITE+sound follows active gear) so arm client sends explicit classification or documented sentinel. ROS IDL zero-inits without defaults, so handler validation is the real gate. Verify: invalid color rejected, bare query still routes, colcon build clean.
