<?php

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/../../../../../lib/behat/behat_base.php');

use Behat\Behat\Context\Context;

final class local_proctoring_behat_steps extends behat_base implements Context {
    /**
     * @Given /^a native proctoring session exists for quiz attempt (\d+)$/
     */
    public function native_session_exists_for_attempt(int $attemptid): void {
        global $DB;
        if (!$DB->record_exists('local_proctoring_session', ['attemptid' => $attemptid])) {
            throw new Exception('Native proctoring session does not exist.');
        }
    }

    /**
     * @Then /^the native proctoring session should have status "([^"]*)"$/
     */
    public function native_session_should_have_status(string $status): void {
        global $DB;
        $attemptid = (int)$this->getSession()->getPage()->find('css', '[data-attemptid]')->getAttribute('data-attemptid');
        $session = $DB->get_record('local_proctoring_session', ['attemptid' => $attemptid], '*', MUST_EXIST);
        if ($session->status !== $status) {
            throw new Exception('Unexpected native proctoring session status.');
        }
    }
}
