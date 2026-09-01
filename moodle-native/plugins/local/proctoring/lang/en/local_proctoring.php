<?php

$string['pluginname'] = 'Proctoring';
$string['panel'] = 'Proctoring review';
$string['captureinterval'] = 'Evidence capture interval';
$string['captureinterval_desc'] = 'Default interval in seconds for permitted evidence captures.';
$string['retentiondays'] = 'Evidence retention days';
$string['retentiondays_desc'] = 'Number of days to retain proctoring evidence by default.';
$string['encryptionkey'] = 'Encryption key';
$string['encryptionkey_desc'] = 'Base64-encoded 32-byte key used to encrypt evidence and biometric descriptors.';
$string['biometricthreshold'] = 'Biometric threshold';
$string['biometricthreshold_desc'] = 'Minimum similarity from 0 to 1 required for a match.';
$string['invalidencryptionkey'] = 'The encryption key must be Base64 and represent exactly 32 bytes.';
$string['encryptionfailed'] = 'Sensitive information could not be encrypted.';
$string['decryptionfailed'] = 'Sensitive information could not be decrypted.';
$string['evidencenotfound'] = 'The evidence is not available.';
$string['evidenceaccessdenied'] = 'You are not allowed to access this evidence.';
$string['invalidcapture'] = 'The capture must be a valid JPEG.';
$string['capturetoolarge'] = 'The capture exceeds the 200 KB limit.';
$string['invalidbiometricsamples'] = 'The biometric samples are invalid.';
$string['privacy:metadata'] = 'Proctoring stores session, event, alert, biometric and evidence data for protected assessments.';
