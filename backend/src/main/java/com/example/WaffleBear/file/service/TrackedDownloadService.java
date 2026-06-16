package com.example.WaffleBear.file.service;

import com.example.WaffleBear.administrator.StorageAnalyticsService;
import com.example.WaffleBear.administrator.storage.DataTransferSource;
import com.example.WaffleBear.administrator.storage.DataTransferStatus;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.dto.FileCommonDto.FileDownloadDescriptor;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Slf4j
@Service
@RequiredArgsConstructor
public class TrackedDownloadService {

    private final MinioClient minioClient;
    private final StorageAnalyticsService storageAnalyticsService;

    public ResponseEntity<StreamingResponseBody> streamObject(
            Long userIdx,
            FileDownloadDescriptor descriptor
    ) {
        if (descriptor == null
                || descriptor.bucketName() == null || descriptor.bucketName().isBlank()
                || descriptor.objectKey() == null || descriptor.objectKey().isBlank()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        String bucketName       = descriptor.bucketName();
        String objectKey        = descriptor.objectKey();
        String contentType      = resolveContentType(descriptor.contentType());
        String downloadFileName = resolveFileName(descriptor.fileName(), objectKey);

        StreamingResponseBody body = outputStream -> {
            long transferredBytes = 0L;
            DataTransferStatus transferStatus = DataTransferStatus.COMPLETED;

            try (InputStream objectStream = minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectKey)
                            .build()
            )) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = objectStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, read);
                    transferredBytes += read;
                }
                outputStream.flush();
            } catch (IOException exception) {
                transferStatus = transferredBytes > 0L ? DataTransferStatus.PARTIAL : DataTransferStatus.FAILED;
                throw exception;
            } catch (Exception exception) {
                transferStatus = transferredBytes > 0L ? DataTransferStatus.PARTIAL : DataTransferStatus.FAILED;
                throw new IOException(exception);
            } finally {
                safeRecordEgress(userIdx, descriptor.source(), transferStatus, transferredBytes, objectKey, descriptor.referenceLabel());
            }
        };

        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(downloadFileName, StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .contentType(MediaType.parseMediaType(contentType));

        if (descriptor.contentLength() != null) {
            builder = builder.contentLength(Math.max(0L, descriptor.contentLength()));
        }

        return builder.body(body);
    }

    private void safeRecordEgress(Long userIdx, DataTransferSource source, DataTransferStatus status,
                                   long bytes, String objectKey, String referenceLabel) {
        try {
            storageAnalyticsService.recordEgress(userIdx, source, status, bytes, objectKey, referenceLabel);
        } catch (RuntimeException e) {
            log.warn("egress recording failed: objectKey={} status={} bytes={}", objectKey, status, bytes, e);
        }
    }

    private String resolveContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
        try {
            MediaType.parseMediaType(contentType);
            return contentType;
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
    }

    private String resolveFileName(String fileName, String objectKey) {
        if (fileName != null && !fileName.isBlank()) {
            return fileName.trim();
        }
        int separatorIndex = objectKey.lastIndexOf('/');
        return separatorIndex >= 0 && separatorIndex < objectKey.length() - 1
                ? objectKey.substring(separatorIndex + 1)
                : objectKey;
    }
}
