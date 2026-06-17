package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.repository.UserRepository;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareServiceQuotaTest {

    @Mock FileUpDownloadRepository fileUpDownloadRepository;
    @Mock ShareRepository shareRepository;
    @Mock UserRepository userRepository;
    @Mock MinioClient minioClient;
    @Mock MinioProperties minioProperties;
    @Mock StoragePlanService storagePlanService;
    @Mock NotificationService notificationService;

    @Test
    void saveSharedFileToDriveRejectsCopyWhenQuotaWouldBeExceeded() throws Exception {
        Long userIdx = 10L;
        Long fileIdx = 20L;
        FileInfo original = FileInfo.builder()
                .idx(fileIdx)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("shared.pdf")
                .fileFormat("pdf")
                .fileSaveName("shared.pdf")
                .fileSavePath("owner/shared.pdf")
                .fileSize(2L)
                .lockedFile(false)
                .sharedFile(true)
                .trashed(false)
                .build();
        FileShare share = FileShare.builder()
                .file(original)
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(fileIdx, userIdx))
                .thenReturn(Optional.of(share));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE", "FREE", "FREE", 100L, 0L, 100L,
                false, false, 100L, 1
        ));
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(userIdx, FileNodeType.FILE)).thenReturn(99L);

        ShareService service = new ShareService(
                fileUpDownloadRepository,
                shareRepository,
                userRepository,
                minioClient,
                minioProperties,
                storagePlanService,
                notificationService
        );

        assertThatThrownBy(() -> service.saveSharedFileToDrive(userIdx, fileIdx, null))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.STORAGE_QUOTA_EXCEEDED));
        verify(minioClient, never()).copyObject(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void saveSharedFileToDriveRejectsFreeUserWhenStoredFileCountLimitWouldBeExceeded() throws Exception {
        Long userIdx = 10L;
        Long fileIdx = 20L;
        FileInfo original = FileInfo.builder()
                .idx(fileIdx)
                .nodeType(FileNodeType.FILE)
                .fileOriginName("shared.pdf")
                .fileFormat("pdf")
                .fileSaveName("shared.pdf")
                .fileSavePath("owner/shared.pdf")
                .fileSize(1L)
                .lockedFile(false)
                .sharedFile(true)
                .trashed(false)
                .build();
        FileShare share = FileShare.builder()
                .file(original)
                .build();

        when(shareRepository.findByFile_IdxAndRecipient_Idx(fileIdx, userIdx))
                .thenReturn(Optional.of(share));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE", "FREE", "FREE", 100L, 0L, 100L,
                false, false, 100L, 1
        ));
        when(fileUpDownloadRepository.countStoredFilesByUser(userIdx, FileNodeType.FILE)).thenReturn(1L);

        ShareService service = new ShareService(
                fileUpDownloadRepository,
                shareRepository,
                userRepository,
                minioClient,
                minioProperties,
                storagePlanService,
                notificationService
        );

        assertThatThrownBy(() -> service.saveSharedFileToDrive(userIdx, fileIdx, null))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_COUNT_WRONG));
        verify(minioClient, never()).copyObject(org.mockito.ArgumentMatchers.any());
    }
}
