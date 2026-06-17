package com.example.WaffleBear.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MinioPresignedUrlArchitectureTest {

    private static final Path REPO_ROOT = Path.of("").toAbsolutePath().getParent();

    @Test
    void presignedUrlsAreGeneratedOnlyThroughPublicEndpointService() throws Exception {
        Path presignedService = REPO_ROOT.resolve(
                "backend/src/main/java/com/example/WaffleBear/file/service/MinioPresignedUrlService.java"
        );
        assertThat(presignedService).exists();

        String serviceSource = Files.readString(presignedService);
        assertThat(serviceSource).contains("@Qualifier(\"publicMinioClient\")");
        assertThat(serviceSource).contains("getPresignedObjectUrl");

        for (String relativePath : List.of(
                "backend/src/main/java/com/example/WaffleBear/chat/ChatMessageService.java",
                "backend/src/main/java/com/example/WaffleBear/feater/FeaterService.java",
                "backend/src/main/java/com/example/WaffleBear/file/service/FileUpDownloadMinioService.java",
                "backend/src/main/java/com/example/WaffleBear/file/share/ShareService.java",
                "backend/src/main/java/com/example/WaffleBear/file/upload/UploadService.java",
                "backend/src/main/java/com/example/WaffleBear/workspace/asset/WorkspaceAssetService.java"
        )) {
            String source = Files.readString(REPO_ROOT.resolve(relativePath));
            assertThat(source)
                    .as(relativePath + " should delegate presigned URL generation")
                    .doesNotContain("minioClient.getPresignedObjectUrl");
            assertThat(source)
                    .as(relativePath + " should use MinioPresignedUrlService")
                    .contains("MinioPresignedUrlService");
        }
    }
}
