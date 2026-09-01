<?php

namespace local_proctoring\privacy;

defined('MOODLE_INTERNAL') || die();

final class provider implements
  \core_privacy\local\metadata\provider,
  \core_privacy\local\request\plugin\provider,
  \core_privacy\local\request\core_userlist_provider {
  public static function get_metadata(\core_privacy\local\metadata\collection $items): \core_privacy\local\metadata\collection {
    $items->add_database_table('local_proctoring_session', [
      'userid' => 'privacy:metadata:userid', 'attemptid' => 'privacy:metadata:attemptid',
      'policysnapshot' => 'privacy:metadata:policysnapshot', 'status' => 'privacy:metadata:status',
    ], 'privacy:metadata:session');
    $items->add_database_table('local_proctoring_event', [
      'sessionid' => 'privacy:metadata:sessionid', 'type' => 'privacy:metadata:eventtype',
      'metadata' => 'privacy:metadata:eventmetadata',
    ], 'privacy:metadata:event');
    $items->add_database_table('local_proctoring_alert', [
      'sessionid' => 'privacy:metadata:sessionid', 'reviewedby' => 'privacy:metadata:reviewedby',
      'reviewnote' => 'privacy:metadata:reviewnote',
    ], 'privacy:metadata:alert');
    $items->add_database_table('local_proctoring_evidence', [
      'sessionid' => 'privacy:metadata:sessionid', 'filename' => 'privacy:metadata:filename',
      'sha256' => 'privacy:metadata:hash',
    ], 'privacy:metadata:evidence');
    $items->add_database_table('local_proctoring_biometric', [
      'userid' => 'privacy:metadata:userid', 'consentversion' => 'privacy:metadata:consentversion',
    ], 'privacy:metadata:biometric');
    $items->add_database_table('local_proctoring_biover', [
      'profileid' => 'privacy:metadata:profileid', 'descriptorciphertext' => 'privacy:metadata:encrypteddescriptor',
    ], 'privacy:metadata:biometricversion');
    $items->add_external_location_link('local_proctoring_files', 'privacy:metadata:fileapi', '');
    return $items;
  }

  public static function get_contexts_for_userid(int $userid): \core_privacy\local\request\contextlist {
    $contextlist = new \core_privacy\local\request\contextlist();
    $params = ['userid' => $userid, 'courselevel' => CONTEXT_COURSE];
    $contextlist->add_from_sql(
      "SELECT ctx.id
         FROM {context} ctx
         JOIN {local_proctoring_session} s ON s.courseid = ctx.instanceid
        WHERE ctx.contextlevel = :courselevel AND s.userid = :userid",
      $params
    );
    $contextlist->add(\context_system::instance()->id);
    return $contextlist;
  }

  public static function delete_data_for_all_users_in_course(\context $context): void {
    self::delete_course_data($context);
  }

  public static function get_users_in_context(\context $context): \core_privacy\local\request\userlist {
    global $DB;
    $userlist = new \core_privacy\local\request\userlist($context);
    if ($context->contextlevel === CONTEXT_SYSTEM) {
      $userids = $DB->get_fieldset_select('local_proctoring_biometric', 'userid', '1 = 1', []);
    } else {
      $userids = $DB->get_fieldset_select('local_proctoring_session', 'userid', 'courseid = ?', [$context->instanceid]);
    }
    $userlist->add_users($userids);
    return $userlist;
  }

  public static function delete_data_for_users(\core_privacy\local\request\approved_userlist $userlist): void {
    foreach ($userlist->get_userids() as $userid) {
      $contextlist = self::get_contexts_for_userid((int)$userid);
      self::delete_data_for_user($contextlist);
    }
  }

  public static function export_user_data(\core_privacy\local\request\approved_contextlist $contextlist): void {
    global $DB;
    foreach ($contextlist as $context) {
      $writer = \core_privacy\local\request\writer::with_context($context);
      if ($context->contextlevel === CONTEXT_SYSTEM) {
        $profile = $DB->get_record('local_proctoring_biometric', ['userid' => $contextlist->get_user()->id]);
        if ($profile) {
          $writer->export_data(['biometric_profile' => $profile]);
        }
        continue;
      }
      $sessions = $DB->get_records('local_proctoring_session', ['courseid' => $context->instanceid, 'userid' => $contextlist->get_user()->id]);
      foreach ($sessions as $session) {
        $writer->export_data(['proctoring_session' => $session]);
        $writer->export_data(['events' => $DB->get_records('local_proctoring_event', ['sessionid' => $session->id])]);
        $writer->export_data(['alerts' => $DB->get_records('local_proctoring_alert', ['sessionid' => $session->id])]);
        $writer->export_data(['evidence_metadata' => $DB->get_records('local_proctoring_evidence', ['sessionid' => $session->id])]);
      }
    }
  }

  public static function delete_data_for_user(\core_privacy\local\request\approved_contextlist $contextlist): void {
    global $DB;
    foreach ($contextlist as $context) {
      if ($context->contextlevel === CONTEXT_SYSTEM) {
        $profile = $DB->get_record('local_proctoring_biometric', ['userid' => $contextlist->get_user()->id]);
        if ($profile) {
          $DB->delete_records('local_proctoring_biover', ['profileid' => $profile->id]);
          $DB->delete_records('local_proctoring_biometric', ['id' => $profile->id]);
        }
        continue;
      }
      self::delete_course_data($context, (int)$contextlist->get_user()->id);
    }
  }

  private static function delete_course_data(\context $context, ?int $userid = null): void {
    global $DB;
    $conditions = ['courseid' => $context->instanceid];
    if ($userid !== null) {
      $conditions['userid'] = $userid;
    }
    $sessions = $DB->get_records('local_proctoring_session', $conditions);
    $files = \get_file_storage();
    foreach ($sessions as $session) {
      $evidenceids = $DB->get_fieldset_select('local_proctoring_evidence', 'id', 'sessionid = ?', [$session->id]);
      foreach ($DB->get_records('local_proctoring_evidence', ['sessionid' => $session->id]) as $evidence) {
        $file = $files->get_file(\context_system::instance()->id, 'local_proctoring', $evidence->filearea, $evidence->itemid, $evidence->filepath, $evidence->filename);
        $file?->delete();
      }
      foreach ($evidenceids as $evidenceid) {
        $DB->delete_records('local_proctoring_evaudit', ['evidenceid' => $evidenceid]);
      }
      $DB->delete_records('local_proctoring_evidence', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_biocheck', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_riskscore', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_envsignal', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_alert', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_event', ['sessionid' => $session->id]);
      $DB->delete_records('local_proctoring_session', ['id' => $session->id]);
    }
  }
}
