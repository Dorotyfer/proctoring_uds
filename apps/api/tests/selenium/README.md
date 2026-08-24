# Deferred Selenium verification

Run the final browser suite with Chromium's built-in fake camera:

```powershell
chromedriver --port=9515
$env:PROCTORING_SELENIUM_URL = "https://test.example.edu/proctoring"
& .venv\Scripts\python.exe -m pytest apps/api/tests/selenium -m selenium -q
```

The final fixture must launch Chromium with:

- `--use-fake-device-for-media-stream`
- `--use-fake-ui-for-media-stream`
- `--allow-file-access-from-files`

The fake camera still produces real browser video frames. Assertions must inspect
the three `640x480` JPEG multipart parts and enforce `<= 204800` bytes. API
fixtures should return `429` and offline transitions while continuing captures,
then assert only the newest pending monitoring frame is sent. The panel fixture
must assert `/me` precedes every mutation and that the same in-memory
`X-CSRF-Token` is sent for review, evidence access, reset, and logout.
