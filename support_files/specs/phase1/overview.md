### Environment Baseline & Empty Loop Validation

* Goal: Configure the developer runtime sandbox environment and make sure everythings ready for a development start.
* Agent Instructions: Verify all system environmental loops. Do not build UI widgets or 3D coordinate meshes yet.
* TDD Assertion Matrix:
* Test 1 (Host/VM): Validate that the native ros2 topic list returns active default middleware nodes.
* Test 2 (Rust Backend): Unit test the Actix-web server WebSocket handshake and error handling without using active Zenoh dependencies.
* Test 3 (Integration): Execute an automated Python test script that pushes a text string to Zenoh, and assert that the Actix background thread logs it.
