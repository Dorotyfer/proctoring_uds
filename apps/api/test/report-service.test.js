import assert from 'node:assert/strict';
import test from 'node:test';

import { createCsvReport } from '../src/services/report-service.js';

test('creates a bounded CSV report without sensitive fields or permanent evidence URLs', () => {
  const csv = createCsvReport([{
    alertCount: 2,
    controlLevel: 'high',
    courseId: 'course-1',
    createdAt: '2026-08-28T12:00:00.000Z',
    deviceMode: 'browser',
    id: 'session-1',
    openAlertCount: 1,
    riskCategory: 'high_risk',
    riskScore: 80,
    status: 'active',
    studentDocument: '1234567',
    studentName: 'Ana, Pérez'
  }]);

  assert.match(csv, /^id,course_id,student_name,status,device_mode,control_level,risk_category,risk_score,alert_count,open_alert_count,created_at/m);
  assert.match(csv, /session-1,course-1,"Ana, Pérez",active/);
  assert.doesNotMatch(csv, /1234567|descriptor|ciphertext|http/);
});

test('rejects more than the institutional row limit', () => {
  assert.throws(() => createCsvReport(Array.from({ length: 10001 }, () => ({ id: 'x' }))));
});
