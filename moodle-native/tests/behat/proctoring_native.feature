@local_proctoring @javascript
Feature: Native Moodle proctoring
  As a teacher
  I want proctoring data and review controls inside Moodle
  So that no external API is required

  Background:
    Given the following "users" exist:
      | username | firstname | lastname | email               |
      | teacher1 | Native    | Teacher  | teacher1@example.com |
      | student1 | Native    | Student  | student1@example.com |
    And the following "courses" exist:
      | fullname       | shortname |
      | Native course  | NATIVE01  |

  Scenario: Teacher opens the native correction panel
    Given I log in as "teacher1"
    When I navigate to "/local/proctoring/index.php"
    Then I should see "Revisión de proctoring"

  Scenario: Student reaches native preparation without an external redirect
    Given I log in as "student1"
    When I navigate to "/mod/quiz/accessrule/proctoring/launch.php?attemptid=1"
    Then I should see "Preparación de proctoring"
    And I should see "Preparando la sesión de proctoring"

  Scenario: Proctoring is listed as a course external tool
    Given I log in as "admin"
    And I am on the course page for "Native course"
    When I open the "Más" menu
    Then I should see "Herramientas externas LTI"
    When I follow "Herramientas externas LTI"
    Then I should see "Proctoring"
