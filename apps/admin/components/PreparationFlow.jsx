'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { CameraCheck } from './CameraCheck.jsx';
import { EnrollmentCheck } from './EnrollmentCheck.jsx';
import { LivenessCheck } from './LivenessCheck.jsx';
import { analyzeFrame } from '../lib/human.js';
import { submitPreparation as submitPreparationRequest } from '../lib/session-api.js';

const cameraErrorMessage = 'Camera access is required.';

function createUuid() {
  return crypto.randomUUID();
}

export function getLivenessSteps(random = Math.random) {
  const choices = ['blink', 'turn-left', 'turn-right'];
  const steps = [];

  while (steps.length < 2) {
    const index = Math.floor(random() * choices.length);
    steps.push(choices.splice(index, 1)[0]);
  }

  return steps;
}

function getFrameError(result, video) {
  const faces = Array.isArray(result?.face) ? result.face : [];
  if (faces.length === 0) {
    return 'No face detected.';
  }
  if (faces.length > 1) {
    return 'Multiple faces detected.';
  }

  const box = faces[0]?.box;
  if (!box || box.x < 0 || box.y < 0) {
    return 'Face is outside the frame.';
  }

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  if (width && height && (box.x + box.width > width || box.y + box.height > height)) {
    return 'Face is outside the frame.';
  }

  return null;
}

export function PreparationFlow({
  apiUrl,
  sessionId,
  browserToken,
  livenessChallengeId,
  getUserMedia,
  analyze = analyzeFrame,
  submitPreparation = submitPreparationRequest,
  random,
  createCaptureId = createUuid,
  returnUrl
}) {
  const steps = useMemo(() => getLivenessSteps(random), [random]);
  const [video, setVideo] = useState(null);
  const [referenceCaptureId, setReferenceCaptureId] = useState(null);
  const [livenessCaptureId, setLivenessCaptureId] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [message, setMessage] = useState(null);
  const [submissionState, setSubmissionState] = useState('idle');
  const submissionStarted = useRef(false);

  async function requireSingleFace() {
    if (!video) {
      setMessage(cameraErrorMessage);
      return false;
    }

    try {
      const result = await analyze(video);
      const error = getFrameError(result, video);
      if (error) {
        setMessage(error);
        return false;
      }
      setMessage(null);
      return true;
    } catch {
      setMessage('Face analysis is unavailable.');
      return false;
    }
  }

  async function captureReference() {
    if (await requireSingleFace()) {
      setReferenceCaptureId(createCaptureId());
      setMessage('Reference capture created. Complete the two liveness steps.');
    }
  }

  async function completeLivenessStep() {
    if (!(await requireSingleFace())) {
      return;
    }

    const nextCompletedSteps = completedSteps + 1;
    setCompletedSteps(nextCompletedSteps);
    if (nextCompletedSteps === steps.length) {
      setLivenessCaptureId(createCaptureId());
    }
  }

  useEffect(() => {
    if (!referenceCaptureId || !livenessCaptureId || submissionStarted.current) {
      return;
    }

    let active = true;
    submissionStarted.current = true;
    setSubmissionState('submitting');
    submitPreparation({
      apiUrl,
      sessionId,
      browserToken,
      evidence: {
        referenceCaptureId,
        liveness: {
          challengeId: livenessChallengeId,
          captureId: livenessCaptureId
        }
      }
    }).then(() => {
      if (active) {
        setSubmissionState('submitted');
        setMessage('Preparation submitted for verification.');
      }
    }).catch(() => {
      if (active) {
        setSubmissionState('error');
        setMessage('Preparation submission failed.');
      }
    });

    return () => {
      active = false;
    };
  }, [apiUrl, browserToken, livenessCaptureId, livenessChallengeId, referenceCaptureId, sessionId, submitPreparation]);

  return (
    <main>
      <h1>Preparation</h1>
      <CameraCheck
        getUserMedia={getUserMedia}
        onCameraReady={({ video: cameraVideo }) => setVideo(cameraVideo)}
        onCameraError={() => setMessage(cameraErrorMessage)}
      />
      <EnrollmentCheck canAnalyze={Boolean(video)} onAnalyze={captureReference} />
      {referenceCaptureId ? (
        <LivenessCheck
          steps={steps}
          completedSteps={completedSteps}
          canComplete={submissionState === 'idle'}
          onComplete={completeLivenessStep}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {submissionState === 'submitted' && returnUrl ? (
        <p><a href={returnUrl}>Return to Moodle</a></p>
      ) : null}
    </main>
  );
}
