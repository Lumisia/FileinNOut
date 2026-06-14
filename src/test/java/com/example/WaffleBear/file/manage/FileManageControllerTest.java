package com.example.WaffleBear.file.manage;

import com.example.WaffleBear.administrator.storage.DataTransferSource;
import com.example.WaffleBear.file.dto.FileCommonDto;
import com.example.WaffleBear.file.service.FileThumbnailQueryService;
import com.example.WaffleBear.file.service.TrackedDownloadService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileManageControllerTest {

    @Mock FileManageService fileManageService;
    @Mock FileThumbnailQueryService fileThumbnailQueryService;
    @Mock TrackedDownloadService trackedDownloadService;

    @InjectMocks FileManageController controller;

    @Test
    void downloadFile_delegatesToTrackedDownloadService() {
        Long userIdx = 42L;
        Long fileIdx = 7L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket", "42/file.pdf", "application/pdf",
                "report.pdf", 2048L, DataTransferSource.DRIVE_FILE, "ref");

        StreamingResponseBody streamBody = out -> out.write(new byte[]{1});
        ResponseEntity<StreamingResponseBody> expected = ResponseEntity.ok().body(streamBody);

        when(fileManageService.downloadFile(userIdx, fileIdx)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor)).thenReturn(expected);

        ResponseEntity<StreamingResponseBody> result = controller.downloadFile(user, fileIdx);

        assertThat(result).isSameAs(expected);
        verify(fileManageService).downloadFile(userIdx, fileIdx);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
        verifyNoMoreInteractions(trackedDownloadService);
    }

    @Test
    void downloadFile_extractsUserIdxFromPrincipal() {
        Long userIdx = 99L;
        Long fileIdx = 1L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket", "99/file.txt", "text/plain",
                "file.txt", 100L, DataTransferSource.DRIVE_FILE, "ref");

        StreamingResponseBody emptyBody = out -> {};
        when(fileManageService.downloadFile(userIdx, fileIdx)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor))
                .thenReturn(ResponseEntity.ok().body(emptyBody));

        controller.downloadFile(user, fileIdx);

        verify(fileManageService).downloadFile(userIdx, fileIdx);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
    }
}
