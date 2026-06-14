package com.example.WaffleBear.file.share;

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
class ShareControllerTest {

    @Mock ShareService shareService;
    @Mock FileThumbnailQueryService fileThumbnailQueryService;
    @Mock TrackedDownloadService trackedDownloadService;

    @InjectMocks ShareController controller;

    @Test
    void downloadSharedFile_delegatesToTrackedDownloadService() {
        Long userIdx = 42L;
        Long fileIdx = 7L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket", "42/shared.pdf", "application/pdf",
                "report.pdf", 2048L,
                DataTransferSource.SHARED_FILE, "shared:7");

        ResponseEntity<StreamingResponseBody> expected =
                ResponseEntity.ok().body(out -> out.write(new byte[]{1}));

        when(shareService.downloadSharedFile(userIdx, fileIdx)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor)).thenReturn(expected);

        ResponseEntity<StreamingResponseBody> result = controller.downloadSharedFile(user, fileIdx);

        assertThat(result).isSameAs(expected);
        verify(shareService).downloadSharedFile(userIdx, fileIdx);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
        verifyNoMoreInteractions(trackedDownloadService);
    }

    @Test
    void downloadSharedFile_extractsUserIdxFromPrincipal() {
        Long userIdx = 99L;
        Long fileIdx = 1L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket", "99/doc.txt", "text/plain",
                "doc.txt", 100L,
                DataTransferSource.SHARED_FILE, "shared:1");

        when(shareService.downloadSharedFile(userIdx, fileIdx)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor))
                .thenReturn(ResponseEntity.ok().body(out -> {}));

        controller.downloadSharedFile(user, fileIdx);

        verify(shareService).downloadSharedFile(userIdx, fileIdx);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
    }
}
