# AI-Assisted Answer Analysis Design

## Goal

Add explainable answer-fraud signals to proctored Moodle Quiz attempts without making automatic academic decisions. The first release covers `essay` and `shortanswer` responses, performs local similarity analysis for every submission, and can optionally call an administrator-configured OpenAI-compatible analysis endpoint.

## Scope

The feature applies only to Moodle Quiz attempts already protected by `quizaccess_proctoring`. It analyzes final submitted responses for essay and short-answer questions. Multiple choice, true/false, numerical, calculated, matching, assignments, forums, workshops, and non-Moodle assessments remain outside this release.

The feature produces review signals, not proof of misconduct. It never changes grades, blocks submission, modifies Moodle answers, or marks an alert as valid automatically.

## Approaches Considered

### Local-only heuristics

Normalized text and token shingles can identify exact and near-duplicate answers without transmitting data externally. This is private, deterministic, inexpensive, and explainable, but it cannot reliably evaluate semantic equivalence or probable AI assistance.

### External AI only

An external model can evaluate semantic patterns and return natural-language reasons, but it creates cost, availability, privacy, and false-positive risks. It also provides weak evidence when used without deterministic comparisons.

### Hybrid approach

The selected design always performs deterministic local analysis and optionally adds an AI assessment through a provider-neutral OpenAI-compatible HTTP interface. Local analysis remains available if the provider is disabled or unavailable. External transmission is disabled by default.

## Architecture

The existing `attempt_submitted` Moodle event remains the trigger. Before closing the remote proctoring session, the observer asks a focused answer extractor for final text responses. The extractor uses Moodle question-attempt APIs and never reads Moodle answer tables directly.

Moodle sends one idempotent submission payload to the existing proctoring API using `X-Moodle-Integration-Key`. The API validates that the remote session belongs to the submitted Moodle attempt, encrypts answer text with AES-256-GCM, stores normalized fingerprints, calculates local similarity within the same quiz and question, and optionally requests an AI assessment.

The panel repository exposes answer-analysis summaries only through the existing course-scoped panel authorization. Authorized reviewers can inspect the submitted text, comparison evidence, model reasons, and processing state. Review actions reuse the existing alert review workflow.

## Moodle Extraction

Create `quizaccess_proctoring\answer_extractor` with this interface:

```php
public function extract_for_attempt(\stdClass $attempt): array;
```

Each returned answer contains:

```php
[
    'questionAttemptId' => '123',
    'questionId' => '45',
    'questionType' => 'essay',
    'questionName' => 'Pregunta 2',
    'questionText' => 'Explique ...',
    'responseText' => 'Texto final del estudiante'
]
```

Only `essay` and `shortanswer` are included. HTML question and response content is converted to plain UTF-8 text with Moodle formatting utilities. Embedded files, images, feedback, correct answers, grades, and question-bank metadata are excluded. Empty responses are omitted. Each field has an explicit maximum length before transmission: 255 characters for identifiers and names, 20,000 characters for question text, and 50,000 characters for response text.

`api_client` gains:

```php
public function submit_answers(string $sessionid, array $payload): array;
```

The observer calls answer submission before session completion. If answer analysis fails, Moodle still completes the quiz and attempts to close the proctoring session. The local `local_proctoring_sessions` record gains a separate `answeranalysisstatus` field with `pending`, `complete`, `partial`, or `failed`; the existing proctoring session lifecycle status remains unchanged. Moodle logs expose neither response content nor provider details.

## API Contract

Add `AnswerSubmissionInput` to `packages/contracts`:

```js
{
  moodleAttemptId: string,
  submittedAt: ISODateString,
  answers: Array<{
    questionAttemptId: string,
    questionId: string,
    questionType: 'essay' | 'shortanswer',
    questionName: string,
    questionText: string,
    responseText: string
  }>
}
```

The internal endpoint is:

```text
PUT /v1/internal/sessions/:sessionId/answers
```

`PUT` provides idempotency. Repeating the same payload returns the stored analysis. A changed payload for the same completed submission returns `409` instead of silently replacing evidence. The endpoint returns `401` for an invalid integration key, `404` when the session and Moodle attempt do not match, `400` for invalid or oversized data, and `202` with the persisted local result when optional AI analysis is unavailable.

## Data Model

Migration `010_answer_analysis.sql` creates:

### `proctoring_answer_submissions`

- `id CHAR(36)` primary key.
- `session_id CHAR(36)` unique foreign key with cascade delete.
- `moodle_attempt_id VARCHAR(255)`.
- `payload_hash CHAR(64)` for idempotency.
- `submitted_at DATETIME(3)` and `created_at DATETIME(3)`.
- `analysis_status VARCHAR(20)`: `complete`, `partial`, or `failed`.

### `proctoring_answers`

- Stable UUID and foreign key to the submission.
- Moodle question-attempt ID, question ID, type, and display name.
- Encrypted question text and response text, with separate IV and authentication tag values.
- `normalized_hash CHAR(64)` for exact matching.
- `token_count`, `character_count`, and timestamps.

### `proctoring_answer_comparisons`

- Source and compared answer IDs.
- `method VARCHAR(32)`: `exact_hash`, `token_jaccard`, or `ai_semantic`.
- Score between `0` and `1`.
- Shared phrase JSON containing bounded excerpts of at most 160 characters each.
- Unique source, compared, and method tuple.

### `proctoring_answer_ai_assessments`

- Answer ID, provider name, model name, prompt version, and processing status.
- Probability between `0` and `1`, bounded reason codes, and a reviewer-facing explanation of at most 1,000 characters.
- No chain-of-thought, raw provider response, API key, or request headers are stored.

### `proctoring_answer_access_audit`

- UUID, answer ID, session ID, actor Moodle user ID, action, IP address, user agent, and timestamp.
- Foreign keys cascade with the answer and session.
- The table contains no answer excerpts or model output.

Answer ciphertext and assessments are deleted after `ANSWER_RETENTION_DAYS`, defaulting to `EVIDENCE_RETENTION_DAYS`. Comparison rows cascade with their source answers.

## Encryption

Add `ANSWER_ENCRYPTION_KEY`, a base64-encoded 32-byte key distinct from biometric and evidence keys. Startup fails if answer analysis is enabled and this key is missing or invalid. `answer-encryption-service.js` exposes small `encryptText` and `decryptText` functions using AES-256-GCM with a random 12-byte IV per field.

Normalized hashes use SHA-256 only for exact comparison and never act as a replacement for encryption. Shared phrase excerpts are considered sensitive and remain visible only through authorized panel responses.

## Local Analysis

`answer-similarity-service.js` normalizes Unicode, removes HTML, folds whitespace, and performs case-insensitive comparison while preserving the original encrypted text. It does not remove stop words because short answers may depend on them.

Answers are compared only when all of these match:

- Moodle quiz ID.
- Moodle question ID.
- Question type.
- A different Moodle user.

The service calculates:

- Exact normalized hash equality.
- Jaccard similarity over five-token shingles.
- Up to three longest shared phrases, each bounded to 160 characters.

No similarity alert is created below 40 tokens. Scores at or above `0.85` create a high-severity `answer_similarity` alert; scores from `0.70` through `0.8499` create a medium-severity alert. At most one comparison alert is created per answer, selecting the highest score. Comparison evidence includes the other attempt identifier but not the other student's full identity in list views.

## Optional AI Provider

`answer-ai-provider.js` defines:

```js
async analyzeAnswer({ questionText, responseText, comparisonSummary })
```

Configuration uses:

- `ANSWER_AI_ENABLED=false` by default.
- `ANSWER_AI_BASE_URL` for an OpenAI-compatible HTTPS endpoint.
- `ANSWER_AI_API_KEY` stored only in the server environment.
- `ANSWER_AI_MODEL`.
- `ANSWER_AI_TIMEOUT_MS`, default `10000`, maximum `30000`.

The provider receives only the question, the submitted response, and aggregate local comparison scores. Student names, documents, user IDs, course names, attempt IDs, biometrics, camera evidence, and other students' full responses are never transmitted.

The provider must return strict JSON:

```js
{
  probability: number,
  reasonCodes: Array<'formulaic_style' | 'unsupported_specificity' | 'semantic_overlap' | 'generic_response'>,
  explanation: string
}
```

The API validates and clamps this response. Probability at or above `0.85` creates a medium-severity `ai_assistance_suspected` alert. The UI labels this as an orientative AI signal, never as confirmed fraud. Provider timeout, HTTP error, invalid JSON, or disabled configuration produces `partial` analysis and does not fail Moodle submission.

## Alert and Risk Integration

Extend alert contracts with `answer_similarity` and `ai_assistance_suspected`. Answer alerts are created from synthetic answer-analysis events so the existing review, scoping, notes, and audit workflow remains unchanged.

The session risk analysis assigns capped values:

- `answer_similarity`: 25 points per signal, cap 40.
- `ai_assistance_suspected`: 15 points, cap 15.

These values contribute to review prioritization but do not change the meaning of biometric or behavior signals.

## Panel

The session-detail response adds:

```js
answerAnalysis: {
  status: 'complete' | 'partial' | 'failed',
  submittedAt: string,
  answers: Array<{
    id: string,
    questionName: string,
    questionType: 'essay' | 'shortanswer',
    questionText: string,
    responseText: string,
    localAnalysis: {
      highestSimilarity: number,
      comparedAttemptId: string | null,
      sharedPhrases: string[]
    },
    aiAssessment: null | {
      probability: number,
      reasonCodes: string[],
      explanation: string,
      model: string
    }
  }>
}
```

`PanelSessionDetail` adds a section named “Análisis de respuestas”. It shows processing state, question, submitted answer, local comparison, shared phrases, optional AI probability and reasons, and a permanent notice that the result requires human review. Comparison identities are not linked across unauthorized courses.

## Authorization and Privacy

Internal ingestion requires the existing Moodle integration key. Panel access reuses course-scoped authorization; a teacher cannot retrieve answers from another course by changing a URL or UUID. Full answer text is returned only in session detail, never in course or attempt lists.

Every panel read of answer text records an audit entry with actor, session, action, IP address, user agent, and timestamp. API responses use `Cache-Control: private, no-store`. Application logs contain IDs and processing states but never question text, answer text, ciphertext, provider payloads, or credentials.

Enabling an external provider is an administrator decision requiring an institutional privacy review. The default installation performs no external transmission.

## Error Handling

- Missing eligible responses returns a successful empty analysis.
- Duplicate identical submission returns the existing result.
- Changed duplicate submission returns `409`.
- Local analysis errors mark the submission `failed` and are retriable through the same idempotent endpoint.
- AI errors mark analysis `partial`; local results remain available.
- Moodle extraction or API errors never prevent quiz submission or grading.
- Session closure runs even when answer analysis fails.
- Database writes use a transaction so answers, local comparisons, synthetic events, and alerts cannot become partially linked.

## Testing

PHPUnit tests cover eligible question extraction, HTML-to-text conversion, exclusion of unsupported question types, empty responses, payload bounds, observer ordering, and non-blocking failures.

Contract and API tests cover validation, authentication, session-attempt binding, idempotency, conflict handling, encryption round trips, cohort scoping, exact and Jaccard similarity, thresholds, comparison caps, provider disabled/error/success behavior, alert generation, risk scores, retention, authorization, audit records, and no-store responses.

Web tests cover complete, partial, failed, and empty states; local and AI explanations; accessible probability labels; and the human-review notice.

The full API and web suites, PHP lint, Moodle PHPUnit, migration tests, production build, and `git diff --check` must pass before deployment.

## Acceptance Criteria

1. A protected Moodle Quiz submission containing essay or short-answer text reaches the matching remote session exactly once.
2. Original answer text is never stored unencrypted in the proctoring database or logs.
3. Similar answers from different students in the same quiz question generate an explainable comparison at the configured thresholds.
4. Answers from different courses, quizzes, or questions are not compared.
5. With AI disabled, the complete local flow works and no external request occurs.
6. With an OpenAI-compatible provider enabled, validated AI signals appear in the panel; provider failure leaves local analysis available.
7. Teachers can view only answers in authorized courses, and each answer-detail read is audited.
8. Every signal is explicitly labeled orientative and requires human review.
9. No code path changes Moodle grades or automatically confirms misconduct.
