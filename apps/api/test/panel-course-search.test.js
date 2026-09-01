import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCourseSearchFilter } from '../src/repositories/panel-repository.js';

test('searches courses by name or Moodle course code', () => {
  assert.deepEqual(buildCourseSearchFilter('MAT-101'), {
    sql: `(courses.name LIKE ? ESCAPE '\\\\' OR sessions.moodle_course_id LIKE ? ESCAPE '\\\\')`,
    values: ['%MAT-101%', '%MAT-101%']
  });
});

test('does not add a course search clause for an empty query', () => {
  assert.deepEqual(buildCourseSearchFilter(''), { sql: '', values: [] });
});
