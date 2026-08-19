<?php

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_proctoring', get_string('pluginname', 'local_proctoring'));

    $settings->add(new admin_setting_configtext(
        'local_proctoring/apiurl',
        get_string('apiurl', 'local_proctoring'),
        get_string('apiurl_desc', 'local_proctoring'),
        '',
        PARAM_URL
    ));
    $settings->add(new admin_setting_configpasswordunmask(
        'local_proctoring/panelssosecret',
        get_string('panelssosecret', 'local_proctoring'),
        get_string('panelssosecret_desc', 'local_proctoring'),
        ''
    ));
    $settings->add(new admin_setting_configpasswordunmask(
        'local_proctoring/integrationkey',
        get_string('integrationkey', 'local_proctoring'),
        get_string('integrationkey_desc', 'local_proctoring'),
        ''
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/panelurl',
        get_string('panelurl', 'local_proctoring'),
        get_string('panelurl_desc', 'local_proctoring'),
        '',
        PARAM_URL
    ));

    $ADMIN->add('localplugins', $settings);
}
