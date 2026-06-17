package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.MinioProperties;
import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAsset;
import com.example.WaffleBear.workspace.asset.model.WorkspaceAssetType;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
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
class WorkspaceAssetServiceQuotaTest {

    @Mock FileUpDownloadRepository fileUpDownloadRepository;
    @Mock UserRepository userRepository;
    @Mock WorkspaceAssetRepository workspaceAssetRepository;
    @Mock UserPostRepository userPostRepository;
    @Mock MinioClient minioClient;
    @Mock MinioProperties minioProperties;
    @Mock ClusteredStompPublisher stompPublisher;
    @Mock StoragePlanService storagePlanService;

    @Test
    void saveAssetToDriveRejectsCopyWhenQuotaWouldBeExceeded() throws Exception {
        Long userIdx = 10L;
        Long workspaceIdx = 20L;
        Long assetIdx = 30L;
        Post workspace = Post.builder().idx(workspaceIdx).UUID("workspace-uuid").build();
        UserPost relation = UserPost.builder()
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();
        WorkspaceAsset asset = WorkspaceAsset.builder()
                .idx(assetIdx)
                .workspace(workspace)
                .assetType(WorkspaceAssetType.FILE)
                .originalName("demo.pdf")
                .storedFileName("demo.pdf")
                .objectFolder("file/workspace-uuid")
                .objectKey("file/workspace-uuid/demo.pdf")
                .contentType("application/pdf")
                .fileSize(2L)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, workspaceIdx))
                .thenReturn(Optional.of(relation));
        when(workspaceAssetRepository.findByIdxAndWorkspace_Idx(assetIdx, workspaceIdx))
                .thenReturn(Optional.of(asset));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE", "FREE", "FREE", 100L, 0L, 100L,
                false, false, 100L, 1
        ));
        when(fileUpDownloadRepository.sumStoredFileBytesByUser(userIdx, FileNodeType.FILE)).thenReturn(99L);

        WorkspaceAssetService service = new WorkspaceAssetService(
                fileUpDownloadRepository,
                userRepository,
                workspaceAssetRepository,
                userPostRepository,
                minioClient,
                minioProperties,
                stompPublisher,
                storagePlanService
        );

        assertThatThrownBy(() -> service.saveAssetToDrive(userIdx, workspaceIdx, assetIdx, null))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.STORAGE_QUOTA_EXCEEDED));
        verify(minioClient, never()).copyObject(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void saveAssetToDriveRejectsFreeUserWhenStoredFileCountLimitWouldBeExceeded() throws Exception {
        Long userIdx = 10L;
        Long workspaceIdx = 20L;
        Long assetIdx = 30L;
        Post workspace = Post.builder().idx(workspaceIdx).UUID("workspace-uuid").build();
        UserPost relation = UserPost.builder()
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();
        WorkspaceAsset asset = WorkspaceAsset.builder()
                .idx(assetIdx)
                .workspace(workspace)
                .assetType(WorkspaceAssetType.FILE)
                .originalName("demo.pdf")
                .storedFileName("demo.pdf")
                .objectFolder("file/workspace-uuid")
                .objectKey("file/workspace-uuid/demo.pdf")
                .contentType("application/pdf")
                .fileSize(1L)
                .build();

        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, workspaceIdx))
                .thenReturn(Optional.of(relation));
        when(workspaceAssetRepository.findByIdxAndWorkspace_Idx(assetIdx, workspaceIdx))
                .thenReturn(Optional.of(asset));
        when(storagePlanService.resolveQuota(userIdx)).thenReturn(new StoragePlanService.StorageQuota(
                "FREE", "FREE", "FREE", 100L, 0L, 100L,
                false, false, 100L, 1
        ));
        when(fileUpDownloadRepository.countStoredFilesByUser(userIdx, FileNodeType.FILE)).thenReturn(1L);

        WorkspaceAssetService service = new WorkspaceAssetService(
                fileUpDownloadRepository,
                userRepository,
                workspaceAssetRepository,
                userPostRepository,
                minioClient,
                minioProperties,
                stompPublisher,
                storagePlanService
        );

        assertThatThrownBy(() -> service.saveAssetToDrive(userIdx, workspaceIdx, assetIdx, null))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.FILE_COUNT_WRONG));
        verify(minioClient, never()).copyObject(org.mockito.ArgumentMatchers.any());
    }
}
