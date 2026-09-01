<?php

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_proctoring',
        get_string('pluginname', 'local_proctoring')
    );

    $settings->add(new admin_setting_configtext(
        'local_proctoring/captureinterval',
        get_string('captureinterval', 'local_proctoring'),
        get_string('captureinterval_desc', 'local_proctoring'),
        60,
        PARAM_INT
    ));

    $settings->add(new admin_setting_configtext(
        'local_proctoring/retentiondays',
        get_string('retentiondays', 'local_proctoring'),
        get_string('retentiondays_desc', 'local_proctoring'),
        30,
        PARAM_INT
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_proctoring/encryptionkey',
        get_string('encryptionkey', 'local_proctoring'),
        get_string('encryptionkey_desc', 'local_proctoring'),
        '',
        PARAM_RAW
    ));

    $settings->add(new admin_setting_configtext(
        'local_proctoring/biometricthreshold',
        get_string('biometricthreshold', 'local_proctoring'),
        get_string('biometricthreshold_desc', 'local_proctoring'),
        0.5,
        PARAM_FLOAT
    ));

    $ADMIN->add('localplugins', $settings);
}
