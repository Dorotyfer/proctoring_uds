<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class session_manager_test extends \advanced_testcase {
    public function test_rejects_unsupported_device_mode(): void {
        $client = $this->createMock(api_client::class);
        $manager = new session_manager($client);
        $attempt = (object)['id' => 1];

        $this->expectException(\coding_exception::class);
        $manager->create_for_attempt($attempt, 'desktop');
    }

    public function test_sends_panel_metadata_for_the_attempt(): void {
        global $DB;

        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['fullname' => 'Curso de prueba']);
        $student = $this->getDataGenerator()->create_user([
            'firstname' => 'Ana',
            'lastname' => 'Pérez',
            'idnumber' => '1234567'
        ]);
        $quiz = $this->getDataGenerator()->create_module('quiz', [
            'course' => $course->id,
            'name' => 'Examen final'
        ]);
        $DB->insert_record('quizaccess_proctoring', (object)[
            'quizid' => $quiz->id,
            'enabled' => 1,
            'allowedmode' => 'either',
            'failurepolicy' => 'block',
            'controllevel' => 'high'
        ]);
        $attempt = (object)[
            'id' => 123,
            'userid' => $student->id,
            'courseid' => $course->id,
            'quiz' => $quiz->id
        ];
        $client = $this->createMock(api_client::class);
        $client->expects($this->once())->method('create_session')->with($this->callback(
            function(array $payload): bool {
                $this->assertSame('Curso de prueba', $payload['courseName']);
                $this->assertSame('Examen final', $payload['quizName']);
                $this->assertSame('Ana Pérez', $payload['studentName']);
                $this->assertSame('1234567', $payload['studentDocument']);
                $this->assertSame('high', $payload['controlLevel']);
                return true;
            }
        ))->willReturn(['session' => ['id' => 'remote-session', 'status' => 'pending']]);

        (new session_manager($client))->create_for_attempt($attempt, 'browser');
    }

    public function test_sends_null_when_the_student_has_no_document(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_user(['idnumber' => '']);
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
        $attempt = (object)[
            'id' => 124,
            'userid' => $student->id,
            'courseid' => $course->id,
            'quiz' => $quiz->id
        ];
        $client = $this->createMock(api_client::class);
        $client->expects($this->once())->method('create_session')->with($this->callback(
            fn(array $payload): bool => $payload['studentDocument'] === null
        ))->willReturn(['session' => ['id' => 'remote-session-2', 'status' => 'pending']]);

        (new session_manager($client))->create_for_attempt($attempt, 'browser');
    }
}
