package com.example.WaffleBear.administrator;

import com.example.WaffleBear.administrator.storage.DataTransferDirection;
import com.example.WaffleBear.administrator.storage.DataTransferLedger;
import com.example.WaffleBear.administrator.storage.DataTransferLedgerRepository;
import com.example.WaffleBear.administrator.storage.DataTransferSource;
import com.example.WaffleBear.administrator.storage.DataTransferStatus;
import com.example.WaffleBear.administrator.storage.StorageAnalyticsConfigRepository;
import com.example.WaffleBear.chat.ChatMessageRepository;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.upload.UploadService;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class StorageAnalyticsServiceTransferLedgerTest {

    @Mock UserRepository userRepository;
    @Mock FileUpDownloadRepository fileUpDownloadRepository;
    @Mock WorkspaceAssetRepository workspaceAssetRepository;
    @Mock ChatMessageRepository chatMessageRepository;
    @Mock StoragePlanService storagePlanService;
    @Mock StorageAnalyticsConfigRepository storageAnalyticsConfigRepository;
    @Mock DataTransferLedgerRepository dataTransferLedgerRepository;
    @Mock ObjectProvider<UploadService> uploadServiceProvider;

    @InjectMocks StorageAnalyticsService service;

    private static final Long USER_IDX = 42L;
    private static final String OBJECT_KEY = "drive/users/42/report.pdf";
    private static final String REFERENCE_LABEL = "fileRef-99";

    @Test
    void recordEgress_zeroBytesCompleted_persistsLedger() {
        service.recordEgress(
                USER_IDX,
                DataTransferSource.DRIVE_FILE,
                DataTransferStatus.COMPLETED,
                0L,
                OBJECT_KEY,
                REFERENCE_LABEL
        );

        ArgumentCaptor<DataTransferLedger> captor = ArgumentCaptor.forClass(DataTransferLedger.class);
        verify(dataTransferLedgerRepository).save(captor.capture());

        DataTransferLedger saved = captor.getValue();
        assertThat(saved.getDirection()).isEqualTo(DataTransferDirection.EGRESS);
        assertThat(saved.getSource()).isEqualTo(DataTransferSource.DRIVE_FILE);
        assertThat(saved.getStatus()).isEqualTo(DataTransferStatus.COMPLETED);
        assertThat(saved.getBytes()).isEqualTo(0L);
        assertThat(saved.getObjectKey()).isEqualTo(OBJECT_KEY);
        assertThat(saved.getReferenceLabel()).isEqualTo(REFERENCE_LABEL);
    }

    @Test
    void recordEgress_zeroBytesForFailed_persistsLedger() {
        service.recordEgress(
                USER_IDX,
                DataTransferSource.SHARED_FILE,
                DataTransferStatus.FAILED,
                0L,
                OBJECT_KEY,
                REFERENCE_LABEL
        );

        ArgumentCaptor<DataTransferLedger> captor = ArgumentCaptor.forClass(DataTransferLedger.class);
        verify(dataTransferLedgerRepository).save(captor.capture());

        DataTransferLedger saved = captor.getValue();
        assertThat(saved.getDirection()).isEqualTo(DataTransferDirection.EGRESS);
        assertThat(saved.getSource()).isEqualTo(DataTransferSource.SHARED_FILE);
        assertThat(saved.getStatus()).isEqualTo(DataTransferStatus.FAILED);
        assertThat(saved.getBytes()).isEqualTo(0L);
        assertThat(saved.getObjectKey()).isEqualTo(OBJECT_KEY);
        assertThat(saved.getReferenceLabel()).isEqualTo(REFERENCE_LABEL);
    }

    @Test
    void recordEgress_negativeBytesNotPersisted() {
        service.recordEgress(
                USER_IDX,
                DataTransferSource.DRIVE_FILE,
                DataTransferStatus.COMPLETED,
                -1L,
                OBJECT_KEY,
                REFERENCE_LABEL
        );

        verify(dataTransferLedgerRepository, never()).save(any());
    }
}
