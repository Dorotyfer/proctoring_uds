<?php

namespace local_proctoring\service;

defined('MOODLE_INTERNAL') || die();

final class lti_tool_service {
    private const MARKER = 'local_proctoring_internal_v1';
    private $db;

    public function __construct($db = null) {
        global $DB;
        $this->db = $db ?? $DB;
    }

    public function ensure_registered(): array {
        global $CFG, $SITE, $USER;
        $ltienabled = get_config('local_proctoring', 'lti_enabled');
        if ($ltienabled === false) {
            $ltienabled = true;
        }
        if (!$ltienabled || !file_exists($CFG->dirroot . '/mod/lti/locallib.php')) {
            return [
                'id' => 0,
                'name' => (string)get_config('local_proctoring', 'lti_name') ?: 'Proctoring',
                'launchurl' => $this->launch_url(),
                'visible' => false,
                'usagecount' => 0,
            ];
        }

        require_once($CFG->dirroot . '/mod/lti/lib.php');
        require_once($CFG->dirroot . '/mod/lti/locallib.php');
        $tool = $this->find_tool();
        $name = (string)get_config('local_proctoring', 'lti_name') ?: 'Proctoring';
        $description = (string)get_config('local_proctoring', 'lti_description')
            ?: get_string('lti_description_default', 'local_proctoring');
        $visible = !empty(get_config('local_proctoring', 'lti_activitychooser'))
            ? LTI_COURSEVISIBLE_ACTIVITYCHOOSER
            : LTI_COURSEVISIBLE_PRECONFIGURED;

        if (!$tool) {
            $type = (object)[
                'state' => LTI_TOOL_STATE_CONFIGURED,
                'course' => (int)$SITE->id,
            ];
            $config = (object)[
                'lti_typename' => $name,
                'lti_toolurl' => $this->launch_url(),
                'lti_description' => $description,
                'lti_ltiversion' => LTI_VERSION_1,
                'lti_coursevisible' => $visible,
                'lti_resourcekey' => 'proctoring-' . random_string(24),
                'lti_password' => random_string(48),
                'lti_proctoringmarker' => self::MARKER,
            ];
            $id = lti_add_type($type, $config);
            $tool = $this->db->get_record('lti_types', ['id' => $id], '*', MUST_EXIST);
        } else {
            $config = (object)[
                'lti_typename' => $name,
                'lti_toolurl' => $this->launch_url(),
                'lti_description' => $description,
                'lti_ltiversion' => LTI_VERSION_1,
                'lti_coursevisible' => $visible,
            ];
            $typeconfig = lti_get_type_config($tool->id);
            if (empty($typeconfig['resourcekey'])) {
                $config->lti_resourcekey = 'proctoring-' . random_string(24);
            }
            if (empty($typeconfig['password'])) {
                $config->lti_password = random_string(48);
            }
            lti_update_type($tool, $config);
            $tool = $this->db->get_record('lti_types', ['id' => $tool->id], '*', MUST_EXIST);
        }

        return $this->serialize_tool($tool);
    }

    public function status(): array {
        global $CFG;
        if (!file_exists($CFG->dirroot . '/mod/lti/locallib.php')) {
            return ['registered' => false, 'enabled' => false, 'visible' => false, 'toolid' => 0];
        }
        require_once($CFG->dirroot . '/mod/lti/locallib.php');
        $tool = $this->find_tool();
        return [
            'registered' => (bool)$tool,
            'enabled' => (bool)get_config('local_proctoring', 'lti_enabled'),
            'visible' => $tool ? (int)$tool->coursevisible === LTI_COURSEVISIBLE_ACTIVITYCHOOSER : false,
            'toolid' => $tool ? (int)$tool->id : 0,
        ];
    }

    public function disable(): void {
        global $CFG;
        if (!file_exists($CFG->dirroot . '/mod/lti/locallib.php')) {
            return;
        }
        require_once($CFG->dirroot . '/mod/lti/locallib.php');
        $tool = $this->find_tool();
        if ($tool) {
            lti_set_state_for_type($tool->id, LTI_TOOL_STATE_REJECTED);
        }
    }

    private function find_tool(): ?\stdClass {
        if (!$this->db->get_manager()->table_exists(new \xmldb_table('lti_types'))) {
            return null;
        }
        return $this->db->get_record_sql(
            'SELECT t.*
               FROM {lti_types} t
               JOIN {lti_types_config} c ON c.typeid = t.id
              WHERE c.name = :name AND c.value = :marker',
            ['name' => 'proctoringmarker', 'marker' => self::MARKER]
        ) ?: null;
    }

    private function serialize_tool(\stdClass $tool): array {
        $usagecount = $this->db->count_records('lti', ['typeid' => $tool->id]);
        return [
            'id' => (int)$tool->id,
            'name' => (string)$tool->name,
            'launchurl' => (string)$tool->baseurl,
            'visible' => (int)$tool->coursevisible === (defined('LTI_COURSEVISIBLE_ACTIVITYCHOOSER') ? LTI_COURSEVISIBLE_ACTIVITYCHOOSER : 1),
            'usagecount' => (int)$usagecount,
        ];
    }

    private function launch_url(): string {
        global $CFG;
        return rtrim($CFG->wwwroot, '/') . '/local/proctoring/lti/launch.php';
    }
}
