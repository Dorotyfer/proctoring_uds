# FastAPI Server-Side Vision Design

Replace every Node.js runtime and build dependency with a Python 3.12 application that serves the API, the student flow, and the review panel. Moodle, its SSO token, MariaDB, S3/MinIO, AES-256-GCM evidence, course-scoped authorization, public URLs, sessions, alerts, and audit history remain authoritative.

FastAPI web processes handle HTTP only. Independent Python workers claim durable MariaDB jobs, decrypt temporary S3 frames in memory, run DeepFace with SFace/YuNet/FasNet and torchvision SSDLite320/MobileNetV3, then retain only interval or alert evidence. No image or embedding is written to logs, Moodle, browser storage, or MariaDB BLOB columns.

The browser becomes HTML/CSS/vanilla JavaScript served by FastAPI. It captures bounded JPEG frames, displays a server-issued center/turn/center challenge, polls analysis state, emits non-visual events, and keeps only the newest unsent monitoring frame. The panel keeps the existing SSO and server-side course filters.

Existing migrations 001-007 and their data remain usable. New migrations are additive. Legacy Human profiles are copied as revoked history while the legacy table remains intact for rollback. Python stores versioned SFace descriptors encrypted with the existing biometric key.

Initial operating values are: 200 KB JPEG maximum, 320x240 minimum, 1280x720 maximum, challenge TTL 120 seconds, monitoring every 10 seconds with jitter, SFace every 60 seconds, interval evidence every 60 seconds, lease 120 seconds, three retries, and alert confirmation in two of three frames. `block` keeps failed preparation pending; `allow_with_alert` activates it with a technical alert. No inference changes Moodle grades or attempts.

Production runs on Ubuntu without Docker or Node. systemd manages API, worker, and cleanup services. Apache continues to publish `/proctoring/` and `/proctoring-api/`; the `/_next/` mapping is removed.

