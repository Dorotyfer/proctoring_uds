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
$string['configurationerror'] = 'Proctoring is not configured by the site administrator.';
$string['sessioncreationfailed'] = 'The proctoring session could not be created. Please try again or contact your instructor.';
$string['privacy:metadata'] = 'The Proctoring plugin stores the external proctoring session identifier and expiry time for a quiz attempt.';
