<?php

require_once(__DIR__ . '/../../../config.php');

use local_proctoring\service\evidence_service;

require_login();
$sessionid = required_param('sessionid', PARAM_INT);
$evidenceid = required_param('evidenceid', PARAM_INT);
$payload = (new evidence_service())->read_authorized((int)$USER->id, $sessionid, $evidenceid);

header('Content-Type: ' . $payload['mimetype']);
header('Content-Disposition: inline; filename="' . $payload['filename'] . '"');
header('Content-Length: ' . strlen($payload['content']));
header('X-Content-Type-Options: nosniff');
echo $payload['content'];
