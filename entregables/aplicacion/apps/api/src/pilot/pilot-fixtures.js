export function createPilotFixtures(options) {
  const count = Number(options.count);
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('Pilot fixture count must be an integer between 1 and 1000');
  }

  const issuedAt = new Date(options.issuedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    throw new Error('Pilot fixture issuedAt must be a valid date');
  }

  const seed = normalizeSeed(options.seed ?? 'default');
  const expiresAt = new Date(issuedAt.getTime() + 60 * 60 * 1000).toISOString();

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(4, '0');
    const course = number % 2 === 1 ? 'a' : 'b';
    return {
      courseName: `Curso piloto ${course.toUpperCase()}`,
      deviceMode: course === 'a' ? 'browser' : 'seb',
      expiresAt,
      issuedAt: issuedAt.toISOString(),
      moodleAttemptId: `pilot-${seed}-attempt-${suffix}`,
      moodleCourseId: `pilot-course-${course}`,
      moodleQuizId: `pilot-quiz-${course}`,
      moodleUserId: `pilot-student-${suffix}`,
      quizName: `Evaluación piloto ${course.toUpperCase()}`,
      studentDocument: `PILOT-${suffix}`,
      studentName: `Estudiante piloto ${suffix}`
    };
  });
}

function normalizeSeed(seed) {
  const normalized = String(seed).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return normalized.replace(/^-|-$/g, '') || 'default';
}
