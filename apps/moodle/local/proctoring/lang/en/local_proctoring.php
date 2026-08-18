<?php
// This file is part of Moodle - http://moodle.org/.

$string['pluginname'] = 'Proctoring';
$string['apiurl'] = 'Proctoring API URL';
$string['apiurl_desc'] = 'HTTPS base URL for the proctoring API. Moodle sends session requests to this URL from the server only.';
$string['integrationkey'] = 'Integration key';
$string['integrationkey_desc'] = 'Server-to-server credential for Moodle and the proctoring API. It is never sent to a browser.';
$string['panelurl'] = 'Proctoring panel URL';
$string['panelurl_desc'] = 'Base URL of the proctoring review panel.';
$string['jwtpublickey'] = 'Panel JWT public key';
$string['jwtpublickey_desc'] = 'Public key used to validate signed panel access tokens.';
$string['panelprivatekey'] = 'Panel JWT private key';
$string['panelprivatekey_desc'] = 'PEM private key used by Moodle to issue short-lived panel JWTs. Configure its matching public key in both this setting and the proctoring panel.';
$string['configurationerror'] = 'Proctoring is not configured by the site administrator.';
$string['sessioncreationfailed'] = 'The proctoring session could not be created. Please try again or contact your instructor.';
$string['preparationmessage'] = 'Complete the required proctoring checks before opening this quiz.';
$string['preparationnotready'] = 'Proctoring preparation has not been verified yet.';
$string['panelredirecting'] = 'Opening the proctoring review panel.';
$string['openpanel'] = 'Open proctoring review panel';
$string['privacy:metadata'] = 'The Proctoring plugin stores the external proctoring session identifier and expiry time for a quiz attempt.';
$string['privacy:metadata:attempt'] = 'The external proctoring session linked to a Moodle quiz attempt.';
$string['privacy:metadata:attempt:quizattemptid'] = 'The Moodle quiz attempt identifier.';
$string['privacy:metadata:attempt:sessionid'] = 'The external proctoring session identifier.';
$string['privacy:metadata:attempt:expiresat'] = 'The expiry time supplied by the proctoring service.';
$string['privacy:metadata:external'] = 'The proctoring service receives Moodle user, course, quiz and attempt identifiers to create and operate proctoring sessions.';
$string['privacy:metadata:userid'] = 'The Moodle user identifier.';
$string['privacy:metadata:courseid'] = 'The Moodle course identifier.';
$string['privacy:metadata:quizid'] = 'The Moodle quiz identifier.';
