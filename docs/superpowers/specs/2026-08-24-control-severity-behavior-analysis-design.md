# Control severity and behavior analysis design

## Goal

Add configurable low/medium/high proctoring control levels and an explainable session behavior analysis that labels each attempt as normal, observation, medium fraud risk, or high fraud risk.

## Scope

- Store the control level in the Moodle quiz proctoring policy.
- Send the level with the server-to-server session creation request and persist it with the proctoring session.
- Classify existing session events and alerts with a deterministic score from 0 to 100.
- Show the level, score, category, reasons, and timeline summary in the administrator panel.
- Keep the result advisory: it never changes Moodle grades or automatically sanctions a student.

## Control levels

- `low`: records events and creates alerts; it never blocks an attempt because of a behavior event.
- `medium`: records events, creates alerts, and marks repeated anomalies in the risk analysis.
- `high`: applies strict preparation and monitoring rules; critical identity, liveness, or multiple-face events can mark the session as high risk and interrupt monitoring according to the existing failure policy.

The level is validated as one of `low`, `medium`, or `high`; existing quizzes default to `medium` during migration.

## Behavior scoring

The score is calculated from persisted events and alerts, not from opaque model inference:

| Signal | Points | Notes |
| --- | ---: | --- |
| biometric mismatch | 35 | critical identity signal |
| multiple faces | 30 | critical identity signal |
| liveness check failed | 30 | critical preparation signal |
| identity check failed | 30 | critical preparation signal |
| camera interrupted | 20 | one occurrence |
| face absent | 10 | per occurrence, capped at 20 |
| face out of frame | 8 | per occurrence, capped at 16 |
| page visibility changed | 8 | per occurrence, capped at 16 |
| network disconnected | 5 | per occurrence, capped at 10 |
| SEB event marked suspicious | 15 | only when event metadata says suspicious |

Repeated identical events are capped by signal to prevent a noisy client from dominating the result. The final score is capped at 100.

Categories:

- `normal`: 0–19
- `observation`: 20–39
- `medium_risk`: 40–69
- `high_risk`: 70–100

The API returns the score, category, control level, event counts, and top reasons. A reviewed or dismissed alert remains visible; review status is not silently converted into a behavior conclusion.

## Privacy and safety

- No biometric descriptors, encryption material, or camera images are returned by the analysis endpoint.
- The result is explicitly labeled as an automated recommendation for human review.
- Existing evidence retention and panel authorization rules remain unchanged.

