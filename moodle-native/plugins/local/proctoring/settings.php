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

    $ADMIN->add('localplugins', $settings);
}
