<?php

namespace local_proctoring\tests;

use local_proctoring\domain\alert_policy;
use local_proctoring\domain\policy_validator;
use local_proctoring\domain\risk_score;
use local_proctoring\domain\session_state;

defined('MOODLE_INTERNAL') || die();

final class domain_test extends \advanced_testcase {
  public function test_session_state_allows_only_forward_transitions(): void {
    $this->assertTrue(session_state::can_transition('pending', 'active'));
    $this->assertTrue(session_state::can_transition('active', 'completed'));
    $this->assertFalse(session_state::can_transition('completed', 'active'));
    $this->assertFalse(session_state::can_transition('active', 'pending'));
  }

  public function test_policy_rejects_duplicate_signal_types(): void {
    $result = policy_validator::validate([
      'signals' => [
        ['type' => 'face_absent'],
        ['type' => 'face_absent'],
      ],
    ]);

    $this->assertFalse($result['valid']);
    $this->assertContains('duplicate_signal:face_absent', $result['errors']);
  }

  public function test_alert_policy_uses_threshold_and_window(): void {
    $policy = ['signals' => [['type' => 'face_absent', 'threshold' => 2, 'windowseconds' => 60]]];

    $this->assertFalse(alert_policy::should_alert($policy, 'face_absent', 1, 30));
    $this->assertTrue(alert_policy::should_alert($policy, 'face_absent', 2, 60));
    $this->assertFalse(alert_policy::should_alert($policy, 'face_absent', 2, 61));
  }

  public function test_risk_score_deduplicates_signals_and_caps_at_one_hundred(): void {
    $signals = [
      ['id' => 'one', 'type' => 'multiple_faces'],
      ['id' => 'one', 'type' => 'multiple_faces'],
      ['id' => 'two', 'type' => 'camera_interrupted'],
      ['id' => 'three', 'type' => 'biometric_mismatch'],
    ];

    $risk = risk_score::calculate($signals);

    $this->assertSame(95, $risk['score']);
    $this->assertSame('high_risk', $risk['category']);
  }
}
