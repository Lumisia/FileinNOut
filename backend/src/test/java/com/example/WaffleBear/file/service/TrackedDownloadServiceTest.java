package com.example.WaffleBear.file.service;

import com.example.WaffleBear.administrator.StorageAnalyticsService;
import com.example.WaffleBear.administrator.storage.DataTransferSource;
import com.example.WaffleBear.administrator.storage.DataTransferStatus;
import com.example.WaffleBear.file.dto.FileCommonDto;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import okhttp3.Headers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrackedDownloadServiceTest {

    @Mock MinioClient minioClient;
    @Mock StorageAnalyticsService storageAnalyticsService;

    @InjectMocks TrackedDownloadService service;

    private static final Long USER_IDX = 1L;
    private static final String BUCKET = "test-bucket";
    private static final String OBJECT_KEY = "path/to/file.pdf";
    private static final String FILE_NAME = "file.pdf";
    private static final String REF_LABEL = "ref";

    private FileCommonDto.FileDownloadDescriptor descriptor(String contentType, Long size) {
        return new FileCommonDto.FileDownloadDescriptor(
                BUCKET, OBJECT_KEY, contentType, FILE_NAME, size,
                DataTransferSource.DRIVE_FILE, REF_LABEL
        );
    }

    private GetObjectResponse objectResponse(byte[] data) throws Exception {
        return new GetObjectResponse(
                Headers.of(), BUCKET, "", OBJECT_KEY, new ByteArrayInputStream(data));
    }

    @Test
    void getObject_notCalledUntilWriteTo() throws Exception {
        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[]{1, 2, 3}));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", 3L));

        verify(minioClient, never()).getObject(any());

        response.getBody().writeTo(new ByteArrayOutputStream());

        verify(minioClient).getObject(any());
    }

    @Test
    void exactBytesCopied() throws Exception {
        byte[] expected = "hello world".getBytes();
        when(minioClient.getObject(any())).thenReturn(objectResponse(expected));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/octet-stream", (long) expected.length));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        response.getBody().writeTo(out);

        assertThat(out.toByteArray()).isEqualTo(expected);
    }

    @Test
    void contentDispositionIsAttachment() {
        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", 1L));

        String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(disposition).containsIgnoringCase("attachment");
    }

    @Test
    void contentType_validMime_usedDirectly() throws Exception {
        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[]{0}));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/zip", 1L));
        response.getBody().writeTo(new ByteArrayOutputStream());

        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("application/zip");
    }

    @Test
    void contentType_nullOrBlankOrInvalid_defaultsToOctetStream() throws Exception {
        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[]{0}));

        ResponseEntity<StreamingResponseBody> nullType =
                service.streamObject(USER_IDX, descriptor(null, 1L));
        nullType.getBody().writeTo(new ByteArrayOutputStream());
        assertThat(nullType.getHeaders().getContentType().toString()).isEqualTo("application/octet-stream");

        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[]{0}));
        ResponseEntity<StreamingResponseBody> blankType =
                service.streamObject(USER_IDX, descriptor("   ", 1L));
        blankType.getBody().writeTo(new ByteArrayOutputStream());
        assertThat(blankType.getHeaders().getContentType().toString()).isEqualTo("application/octet-stream");

        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[]{0}));
        ResponseEntity<StreamingResponseBody> invalidType =
                service.streamObject(USER_IDX, descriptor("not///valid", 1L));
        invalidType.getBody().writeTo(new ByteArrayOutputStream());
        assertThat(invalidType.getHeaders().getContentType().toString()).isEqualTo("application/octet-stream");
    }

    @Test
    void completedEgress_recordedAfterSuccessfulTransfer() throws Exception {
        byte[] data = {10, 20, 30};
        when(minioClient.getObject(any())).thenReturn(objectResponse(data));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", (long) data.length));
        response.getBody().writeTo(new ByteArrayOutputStream());

        verify(storageAnalyticsService).recordEgress(
                USER_IDX, DataTransferSource.DRIVE_FILE, DataTransferStatus.COMPLETED,
                (long) data.length, OBJECT_KEY, REF_LABEL);
    }

    @Test
    void completedEgress_recordedWithZeroForEmptyObject() throws Exception {
        when(minioClient.getObject(any())).thenReturn(objectResponse(new byte[0]));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", 0L));
        response.getBody().writeTo(new ByteArrayOutputStream());

        verify(storageAnalyticsService).recordEgress(
                USER_IDX, DataTransferSource.DRIVE_FILE, DataTransferStatus.COMPLETED,
                0L, OBJECT_KEY, REF_LABEL);
    }

    @Test
    void getObjectFailure_beforeFirstByte_recordsFailedAndSurfacesIOException() throws Exception {
        when(minioClient.getObject(any())).thenThrow(new IOException("connection refused"));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", 100L));

        assertThatThrownBy(() -> response.getBody().writeTo(new ByteArrayOutputStream()))
                .isInstanceOf(IOException.class);

        verify(storageAnalyticsService).recordEgress(
                USER_IDX, DataTransferSource.DRIVE_FILE, DataTransferStatus.FAILED,
                0L, OBJECT_KEY, REF_LABEL);
    }

    @Test
    void analyticsThrowsAfterSuccessfulTransfer_writeToStillCompletes() throws Exception {
        byte[] data = "analytics-fail-test".getBytes();
        when(minioClient.getObject(any())).thenReturn(objectResponse(data));
        doThrow(new RuntimeException("analytics unavailable"))
                .when(storageAnalyticsService)
                .recordEgress(any(), any(), any(), any(Long.class), any(), any());

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/octet-stream", (long) data.length));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        response.getBody().writeTo(out);

        assertThat(out.toByteArray()).isEqualTo(data);
    }

    @Test
    void streamFailureAfterBytes_recordsPartialWithTransferredCount() throws Exception {
        int successfulBytes = 5;
        InputStream brokenStream = new InputStream() {
            boolean firstRead = true;

            @Override
            public int read() throws IOException { throw new IOException("broken pipe"); }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (firstRead) {
                    firstRead = false;
                    int copy = Math.min(successfulBytes, len);
                    for (int i = 0; i < copy; i++) b[off + i] = (byte) i;
                    return copy;
                }
                throw new IOException("broken pipe");
            }
        };
        when(minioClient.getObject(any())).thenReturn(
                new GetObjectResponse(Headers.of(), BUCKET, "", OBJECT_KEY, brokenStream));

        ResponseEntity<StreamingResponseBody> response =
                service.streamObject(USER_IDX, descriptor("application/pdf", 100L));

        assertThatThrownBy(() -> response.getBody().writeTo(new ByteArrayOutputStream()))
                .isInstanceOf(IOException.class);

        verify(storageAnalyticsService).recordEgress(
                USER_IDX, DataTransferSource.DRIVE_FILE, DataTransferStatus.PARTIAL,
                (long) successfulBytes, OBJECT_KEY, REF_LABEL);
    }
}
