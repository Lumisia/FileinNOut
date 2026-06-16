pipeline {
  agent any

  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    timestamps()
  }

  triggers {
    githubPush()
  }

  environment {
    HELM_RELEASE = 'fileinnout'
    K8S_NAMESPACE = 'fileinnout'
    DOCKER_BUILDKIT = '1'
    COMPOSE_DOCKER_CLI_BUILD = '1'
  }

  stages {
    stage('Checkout main') {
      steps {
        checkout scm
        script {
          if (env.BRANCH_NAME && env.BRANCH_NAME != 'main') {
            currentBuild.result = 'NOT_BUILT'
            error("This deployment job only runs for main. Current branch: ${env.BRANCH_NAME}")
          }

          IMAGE_TAG = env.GIT_COMMIT.take(12)
          env.IMAGE_TAG = IMAGE_TAG
          currentBuild.displayName = "#${BUILD_NUMBER} ${IMAGE_TAG}"
        }
      }
    }

    stage('Docker login') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-lumisia', usernameVariable: 'DOCKERHUB_USERNAME', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            set -eu
            printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
          '''
        }
      }
    }

    stage('Build images') {
      steps {
        sh '''
          set -eu
          COMPOSE_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.yml build backend-app websocket-server frontend
        '''
      }
    }

    stage('Push images') {
      steps {
        sh '''
          set -eu
          COMPOSE_IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.yml push backend-app websocket-server frontend
        '''
      }
    }

    stage('Deploy to k3s') {
      steps {
        withCredentials([
          file(credentialsId: 'oci-k3s-kubeconfig', variable: 'KUBECONFIG_FILE'),
          file(credentialsId: 'fileinnout-values-private', variable: 'HELM_VALUES_PRIVATE')
        ]) {
          sh '''
            set -eu
            install -m 600 "$KUBECONFIG_FILE" .kubeconfig
            export KUBECONFIG="$PWD/.kubeconfig"

            helm upgrade --install "$HELM_RELEASE" ./cicd/helm \
              --namespace "$K8S_NAMESPACE" \
              --create-namespace \
              -f cicd/helm/values.yaml \
              -f cicd/helm/values-oci-k3s.yaml \
              -f "$HELM_VALUES_PRIVATE" \
              --set-string backend.image.tag="${IMAGE_TAG}" \
              --set-string frontend.image.tag="${IMAGE_TAG}" \
              --set-string websocket.image.tag="${IMAGE_TAG}" \
              --wait \
              --timeout 10m

            kubectl rollout status deployment/"$HELM_RELEASE"-wafflebear-backend -n "$K8S_NAMESPACE" --timeout=5m
            kubectl rollout status deployment/"$HELM_RELEASE"-wafflebear-frontend -n "$K8S_NAMESPACE" --timeout=5m
            kubectl rollout status deployment/"$HELM_RELEASE"-wafflebear-websocket -n "$K8S_NAMESPACE" --timeout=5m
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'rm -f .kubeconfig || true'
    }
  }
}
