## MODIFIED Requirements

### Requirement: Availability and Compatibility Signaling
The system SHALL expose health and protocol compatibility information so the bridge can decide normal or degraded operation mode, and MUST determine the initial availability state by executing startup handshake.

#### Scenario: Bridge startup handshake succeeds
- **WHEN** the bridge process starts and plugin handshake completes within timeout
- **THEN** bridge sets availability to `normal` and marks plugin-backed capabilities as active

#### Scenario: Bridge startup handshake fails
- **WHEN** the bridge process starts and plugin handshake does not succeed within configured retry policy
- **THEN** bridge sets availability to `degraded` or `unavailable` with machine-readable reason and exposes that state to clients

### Requirement: Deterministic Error Contract
The system SHALL return structured JSON-RPC errors with stable error codes and MUST include enough context for bridge-side fallback decisions, including startup/transport phase metadata.

#### Scenario: Plugin transport error occurs during startup
- **WHEN** handshake or transport initialization fails due to timeout, auth, or protocol mismatch
- **THEN** bridge emits structured error details including phase, correlation identifier, and fallback decision hint without crashing the server process
