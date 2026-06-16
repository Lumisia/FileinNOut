package com.example.WaffleBear.workspace.asset;

import com.example.WaffleBear.administrator.storage.DataTransferSource;
import com.example.WaffleBear.file.dto.FileCommonDto;
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
class WorkspaceAssetControllerTest {

    @Mock WorkspaceAssetService workspaceAssetService;
    @Mock TrackedDownloadService trackedDownloadService;

    @InjectMocks WorkspaceAssetController controller;

    @Test
    void downloadWorkspaceAsset_delegatesToTrackedDownloadService() {
        Long userIdx = 42L;
        Long workspaceId = 10L;
        Long assetId = 3L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket-cloud", "workspace/10/asset.png", "image/png",
                "asset.png", 4096L,
                DataTransferSource.WORKSPACE_ASSET, "workspace:10:asset:3");

        ResponseEntity<StreamingResponseBody> expected =
                ResponseEntity.ok().body(out -> out.write(new byte[]{2}));

        when(workspaceAssetService.downloadWorkspaceAsset(userIdx, workspaceId, assetId)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor)).thenReturn(expected);

        ResponseEntity<StreamingResponseBody> result =
                controller.downloadWorkspaceAsset(user, workspaceId, assetId);

        assertThat(result).isSameAs(expected);
        verify(workspaceAssetService).downloadWorkspaceAsset(userIdx, workspaceId, assetId);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
        verifyNoMoreInteractions(trackedDownloadService);
    }

    @Test
    void downloadWorkspaceAsset_extractsUserIdxFromPrincipal() {
        Long userIdx = 55L;
        Long workspaceId = 20L;
        Long assetId = 8L;
        AuthUserDetails user = AuthUserDetails.builder().idx(userIdx).build();

        FileCommonDto.FileDownloadDescriptor descriptor = new FileCommonDto.FileDownloadDescriptor(
                "bucket-cloud", "workspace/20/notes.pdf", "application/pdf",
                "notes.pdf", 1024L,
                DataTransferSource.WORKSPACE_ASSET, "workspace:20:asset:8");

        when(workspaceAssetService.downloadWorkspaceAsset(userIdx, workspaceId, assetId)).thenReturn(descriptor);
        when(trackedDownloadService.streamObject(userIdx, descriptor))
                .thenReturn(ResponseEntity.ok().body(out -> {}));

        controller.downloadWorkspaceAsset(user, workspaceId, assetId);

        verify(workspaceAssetService).downloadWorkspaceAsset(userIdx, workspaceId, assetId);
        verify(trackedDownloadService).streamObject(userIdx, descriptor);
    }
}
