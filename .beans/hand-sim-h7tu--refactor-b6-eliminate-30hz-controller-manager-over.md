---
# hand-sim-h7tu
title: 'Refactor-B.6: Eliminate 30Hz controller-manager overruns at parked idle (non-RT)'
status: completed
type: bug
priority: normal
created_at: 2026-09-19T17:50:01Z
updated_at: 2026-09-19T19:39:31Z
parent: hand-sim-wt44
---

Live prove-out hand-sim-1j8b shows 68 overrun warnings at steady parked idle on 30Hz sim loop (GenericSystem, non-RT container, no FIFO RT). AC1 demands zero overruns. Investigate: update_rate vs host capacity, spawner/param load spikes, RT thread priority fallback, whether to raise loop period, pin threads, or relax AC to allow bounded overruns at idle. Evidence in hand-sim-1j8b body. Logs: /tmp/prove_ros2.log

## Resolution 2026-09-19 (5Hz sim loop): update_rate 30->5 in src sim yaml (real stays 500Hz real yaml). Evidence: 30Hz 82 overruns prove log / 14-27 probe logs; 10Hz still 2; 5Hz 0 overruns /tmp/h7tu_5hz.log (100s idle) + 1 overrun /tmp/h7tu_5hz_final.log (100s installed) + 1 overrun /tmp/h7tu_engage5hz.log ENGAGE cycle with /joint_states 5.00Hz wall+stamp. Single 238-337ms stalls = non-RT scheduler (no FIFO), not loop budget. Per user decision 19:26Z AC relaxed to bounded <=2 per 90s at 5Hz; zero-overrun reserved RT host. Launch test test_joint_states_5hz_sim_frequency GREEN (stamp 5.00 wall 5.00, Ran 3 OK /tmp/launch_test_5hz.log).

## Summary of Changes: sim update_rate 30->5 + publish 100/20->5/2 (src yaml only; real yaml stays 500Hz). Launch comments truthful. Test retarget 5Hz + ENGAGE activation. Domain regen ENGAGE/STANDBY. Evidence: cargo ok, pytest 15 ok, web 170 ok, launch_test 3 OK stamp 5.00Hz, overruns 82-><=1 bounded PASS.
