package com.example.WaffleBear.file.upload;

import com.example.WaffleBear.administrator.StorageAnalyticsService;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.upload.dto.UploadDto;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadServiceQuotaTest {

    @Mock FileUpDownloadRepository fileUpDownloadRepository;
    @Mock MinioClient minioClient;
    @Mock MinioProperties minioProperties;
    @Mock StoragePlanService storagePlanService;
    @Mock UploadFolderService uploadFolderService;
    @Mock StorageAnalyticsService storageAnalyticsService;

    @Test
    void initRejectsFreeUserWhenStoredFileCountLimitWouldBeExceeded() throws Exception {
        Long userIdx = 10L;
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE", "FREE", "FREE", 100L, 0L, 100L,
                false, false, 100L, 1
        ));
        when(fileUpDownloadRepository.countStoredFilesByUser(userIdx, FileNodeType.FILE)).thenReturn(1L);

        UploadService service = new UploadService(
                fileUpDownloadRepository,
                minioClient,
                minioProperties,
                storagePlanService,
                uploadFolderService,
                storageAnalyticsService
        );
        UploadDto.InitReq request = UploadDto.InitReq.builder()
                .fileOriginName("new.txt")
                .fileFormat("txt")
                .fileSize(1L)
                .contentType("text/plain")
                .build();

        assertThatThrownBy(() -> service.init(userIdx, List.of(request)))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_COUNT_WRONG));
        verify(minioClient, never()).getPresignedObjectUrl(org.mockito.ArgumentMatchers.any());
    }
}
