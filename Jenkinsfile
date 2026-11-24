pipeline {
    agent {
        docker {
            image 'mcr.microsoft.com/playwright:v1.50.0-noble'
            args '--ipc=host --user pwuser'
        }
    }

    parameters {
        choice(
            name: 'SUITE_SCOPE',
            choices: ['all', 'smoke', 'api', 'e2e'],
            description: 'Select Healthcare QA execution scope'
        )
        string(
            name: 'FACILITY_CODE',
            defaultValue: 'DN-HOSP-01',
            description: 'Target Hospital Facility Code header (X-Facility-Code)'
        )
    }

    environment {
        CI = 'true'
        TEST_ENV = 'jenkins-pipeline'
        FACILITY_CODE = "${params.FACILITY_CODE}"
    }

    options {
        timestamps()
        timeout(time: 25, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Install & TypeScript Gate') {
            steps {
                sh 'npm ci'
                sh 'npm run typecheck'
            }
        }

        stage('Execute Healthcare Test Suites') {
            steps {
                script {
                    if (params.SUITE_SCOPE == 'smoke') {
                        sh 'npm run test:smoke'
                    } else if (params.SUITE_SCOPE == 'api') {
                        sh 'npm run test:api'
                    } else if (params.SUITE_SCOPE == 'e2e') {
                        sh 'npm run test:e2e'
                    } else {
                        sh 'npm test'
                    }
                }
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'test-results/junit-results.xml'
            archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Healthcare Playwright HTML Report'
            ])
        }
    }
}
