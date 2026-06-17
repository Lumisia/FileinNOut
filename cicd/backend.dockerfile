# --- 1단계: 빌드 ---
FROM eclipse-temurin:17-jdk-jammy AS builder
WORKDIR /app/backend
COPY backend/gradlew .
COPY backend/gradle gradle
COPY backend/build.gradle backend/settings.gradle ./
RUN chmod +x ./gradlew
RUN ./gradlew dependencies --no-daemon
COPY backend/src ./src
RUN ./gradlew bootJar --no-daemon -x test

# --- 2단계: 실행 ---
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/backend/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
