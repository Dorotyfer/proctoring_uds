<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\writer;

defined('MOODLE_INTERNAL') || die();

/** Privacy provider for attempt-linked external proctoring session metadata. */
final class provider implements \core_privacy\local\metadata\provider, \core_privacy\local\request\plugin\provider {
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('local_proctoring_attempt', [
            'quizattemptid' => 'privacy:metadata:attempt:quizattemptid',
            'sessionid' => 'privacy:metadata:attempt:sessionid',
            'expiresat' => 'privacy:metadata:attempt:expiresat',
        ], 'privacy:metadata:attempt');
        $collection->add_external_location_link('proctoringservice', [
            'moodleuserid' => 'privacy:metadata:userid',
            'moodlecourseid' => 'privacy:metadata:courseid',
            'moodlequizid' => 'privacy:metadata:quizid',
            'moodleattemptid' => 'privacy:metadata:attempt:quizattemptid',
        ], 'privacy:metadata:external');
        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contexts = new contextlist();
        $contexts->add_from_sql("SELECT ctx.id
              FROM {local_proctoring_attempt} pa
              JOIN {quiz_attempts} qa ON qa.id = pa.quizattemptid
              JOIN {quiz} q ON q.id = qa.quiz
              JOIN {course_modules} cm ON cm.instance = q.id
              JOIN {modules} m ON m.id = cm.module AND m.name = 'quiz'
              JOIN {context} ctx ON ctx.instanceid = cm.id AND ctx.contextlevel = :contextlevel
             WHERE qa.userid = :userid", ['contextlevel' => CONTEXT_MODULE, 'userid' => $userid]);
        return $contexts;
    }

    public static function export_user_data(approved_contextlist $contextlist) {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist as $context) {
            if ($context->contextlevel !== CONTEXT_MODULE) {
                continue;
            }
            $records = $DB->get_records_sql("SELECT pa.sessionid, pa.expiresat
                  FROM {local_proctoring_attempt} pa
                  JOIN {quiz_attempts} qa ON qa.id = pa.quizattemptid
                  JOIN {course_modules} cm ON cm.instance = qa.quiz
                  JOIN {modules} m ON m.id = cm.module AND m.name = 'quiz'
                 WHERE cm.id = :cmid AND qa.userid = :userid", ['cmid' => $context->instanceid, 'userid' => $userid]);
            foreach ($records as $record) {
                writer::with_context($context)->export_data(['attempts', $record->sessionid], (object)[
                    'sessionid' => $record->sessionid,
                    'expiresat' => $record->expiresat,
                ]);
            }
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;
        if ($context->contextlevel === CONTEXT_MODULE) {
            $DB->delete_records_select('local_proctoring_attempt', 'quizattemptid IN (SELECT qa.id FROM {quiz_attempts} qa JOIN {course_modules} cm ON cm.instance = qa.quiz WHERE cm.id = :cmid)', ['cmid' => $context->instanceid]);
        }
    }

    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist as $context) {
            if ($context->contextlevel === CONTEXT_MODULE) {
                $DB->delete_records_select('local_proctoring_attempt', 'quizattemptid IN (SELECT qa.id FROM {quiz_attempts} qa JOIN {course_modules} cm ON cm.instance = qa.quiz WHERE cm.id = :cmid AND qa.userid = :userid)', ['cmid' => $context->instanceid, 'userid' => $userid]);
            }
        }
    }
}
