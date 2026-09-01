<?php

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_proctoring',
        get_string('pluginname', 'local_proctoring')
    );

    $settings->add(new admin_setting_heading(
        'local_proctoring/generalheading',
        get_string('generalheading', 'local_proctoring'),
        get_string('generalheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/enabled',
        get_string('enabled', 'local_proctoring'),
        get_string('enabled_desc', 'local_proctoring'),
        0
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/captureinterval',
        get_string('captureinterval', 'local_proctoring'),
        get_string('captureinterval_desc', 'local_proctoring'),
        60,
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/capturewidth',
        get_string('capturewidth', 'local_proctoring'),
        get_string('capturewidth_desc', 'local_proctoring'),
        1280,
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/maximagekb',
        get_string('maximagekb', 'local_proctoring'),
        get_string('maximagekb_desc', 'local_proctoring'),
        200,
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

    $settings->add(new admin_setting_heading(
        'local_proctoring/signalsheading',
        get_string('signalsheading', 'local_proctoring'),
        get_string('signalsheading_desc', 'local_proctoring')
    ));
    foreach ([
        'detecttabswitch',
        'detectfullscreen',
        'detectclipboard',
        'detectf12',
        'detectresize',
        'detectphone',
        'detectvoice',
        'detectgaze',
        'environmentanalysis',
        'emotionanalysis',
        'predictiveanalysis',
    ] as $settingname) {
        $settings->add(new admin_setting_configcheckbox(
            'local_proctoring/' . $settingname,
            get_string($settingname, 'local_proctoring'),
            get_string($settingname . '_desc', 'local_proctoring'),
            0
        ));
    }

    $settings->add(new admin_setting_heading(
        'local_proctoring/alertsheading',
        get_string('alertsheading', 'local_proctoring'),
        get_string('alertsheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/maxwarnings',
        get_string('maxwarnings', 'local_proctoring'),
        get_string('maxwarnings_desc', 'local_proctoring'),
        3,
        PARAM_INT
    ));
    $settings->add(new admin_setting_configselect(
        'local_proctoring/warningaction',
        get_string('warningaction', 'local_proctoring'),
        get_string('warningaction_desc', 'local_proctoring'),
        'allow_with_alert',
        [
            'block' => get_string('warningaction_block', 'local_proctoring'),
            'allow_with_alert' => get_string('warningaction_alert', 'local_proctoring'),
        ]
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/notifyreviewers',
        get_string('notifyreviewers', 'local_proctoring'),
        get_string('notifyreviewers_desc', 'local_proctoring'),
        1
    ));

    $settings->add(new admin_setting_heading(
        'local_proctoring/identityheading',
        get_string('identityheading', 'local_proctoring'),
        get_string('identityheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/biometricenabled',
        get_string('biometricenabled', 'local_proctoring'),
        get_string('biometricenabled_desc', 'local_proctoring'),
        0
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/biometricthreshold',
        get_string('biometricthreshold', 'local_proctoring'),
        get_string('biometricthreshold_desc', 'local_proctoring'),
        0.5,
        PARAM_FLOAT
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/identityautoclose',
        get_string('identityautoclose', 'local_proctoring'),
        get_string('identityautoclose_desc', 'local_proctoring'),
        0
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/identityautoclosestreak',
        get_string('identityautoclosestreak', 'local_proctoring'),
        get_string('identityautoclosestreak_desc', 'local_proctoring'),
        3,
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/identityautocloseseconds',
        get_string('identityautocloseseconds', 'local_proctoring'),
        get_string('identityautocloseseconds_desc', 'local_proctoring'),
        0,
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/consentversion',
        get_string('consentversion', 'local_proctoring'),
        get_string('consentversion_desc', 'local_proctoring'),
        'proctoring-v1',
        PARAM_ALPHANUMEXT
    ));

    $settings->add(new admin_setting_heading(
        'local_proctoring/riskheading',
        get_string('riskheading', 'local_proctoring'),
        get_string('riskheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configtextarea(
        'local_proctoring/riskweights',
        get_string('riskweights', 'local_proctoring'),
        get_string('riskweights_desc', 'local_proctoring'),
        '{}',
        PARAM_RAW
    ));
    $settings->add(new admin_setting_configtextarea(
        'local_proctoring/institutionrules',
        get_string('institutionrules', 'local_proctoring'),
        get_string('institutionrules_desc', 'local_proctoring'),
        '{}',
        PARAM_RAW
    ));

    $settings->add(new admin_setting_heading(
        'local_proctoring/privacyheading',
        get_string('privacyheading', 'local_proctoring'),
        get_string('privacyheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/legalevidence',
        get_string('legalevidence', 'local_proctoring'),
        get_string('legalevidence_desc', 'local_proctoring'),
        0
    ));

    $settings->add(new admin_setting_heading(
        'local_proctoring/ltiheading',
        get_string('ltiheading', 'local_proctoring'),
        get_string('ltiheading_desc', 'local_proctoring')
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/lti_enabled',
        get_string('lti_enabled', 'local_proctoring'),
        get_string('lti_enabled_desc', 'local_proctoring'),
        1
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/lti_name',
        get_string('lti_name', 'local_proctoring'),
        get_string('lti_name_desc', 'local_proctoring'),
        'Proctoring',
        PARAM_TEXT
    ));
    $settings->add(new admin_setting_configtext(
        'local_proctoring/lti_description',
        get_string('lti_description', 'local_proctoring'),
        get_string('lti_description_desc', 'local_proctoring'),
        get_string('lti_description_default', 'local_proctoring'),
        PARAM_TEXT
    ));
    $settings->add(new admin_setting_configcheckbox(
        'local_proctoring/lti_activitychooser',
        get_string('lti_activitychooser', 'local_proctoring'),
        get_string('lti_activitychooser_desc', 'local_proctoring'),
        1
    ));

    $ADMIN->add('localplugins', $settings);
}
