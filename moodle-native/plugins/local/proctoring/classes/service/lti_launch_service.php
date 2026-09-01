<?php

namespace local_proctoring\service;

defined('MOODLE_INTERNAL') || die();

final class lti_launch_service {
    public function launch(array $request): \moodle_url {
        $context = [
            'courseid' => (int)($request['custom_courseid'] ?? $request['context_id'] ?? 0),
            'userid' => (int)($request['custom_userid'] ?? $request['user_id'] ?? 0),
            'reviewer' => $this->is_reviewer_role((string)($request['roles'] ?? '')),
            'attemptid' => (int)($request['custom_attemptid'] ?? 0),
        ];
        return $this->resolve_destination($context);
    }

    public function resolve_destination(array $context): \moodle_url {
        $courseid = (int)($context['courseid'] ?? 0);
        if ($courseid < 1) {
            throw new \moodle_exception('invalidcourse', 'local_proctoring');
        }
        if (!empty($context['reviewer'])) {
            return new \moodle_url('/local/proctoring/index.php', ['courseid' => $courseid]);
        }
        $attemptid = (int)($context['attemptid'] ?? 0);
        if ($attemptid > 0) {
            return new \moodle_url('/mod/quiz/accessrule/proctoring/launch.php', ['attemptid' => $attemptid]);
        }
        throw new \required_capability_exception(
            \context_course::instance($courseid),
            'local/proctoring:viewowncoursereports',
            'nopermissions',
            'local_proctoring'
        );
    }

    private function is_reviewer_role(string $roles): bool {
        foreach (preg_split('/[,|]/', $roles) as $role) {
            if (in_array(strtolower(trim($role)), ['instructor', 'administrator', 'teacher'], true)) {
                return true;
            }
        }
        return false;
    }
}
