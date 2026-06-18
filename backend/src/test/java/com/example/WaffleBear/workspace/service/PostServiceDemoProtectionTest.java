package com.example.WaffleBear.workspace.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.sse.SseService;
import com.example.WaffleBear.demo.DemoAccessPolicy;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.post.PostDto;
import com.example.WaffleBear.workspace.model.post.isShare;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PostServiceDemoProtectionTest {

    @Mock private SseService sseService;
    @Mock private EmailVerifyRepository emailVerifyRepository;
    @Mock private EmailVerifyService emailVerifyService;
    @Mock private UserRepository userRepository;
    @Mock private PostRepository postRepository;
    @Mock private UserPostRepository userPostRepository;
    @Mock private NotificationService notificationService;
    @Mock private WorkspaceAssetService workspaceAssetService;
    @Mock private PostVersionService postVersionService;
    @Mock private DemoAccessPolicy demoAccessPolicy;
    @InjectMocks private PostService service;

    private Post workspace;
    private UserPost adminMembership;
    private AuthUserDetails admin;

    @BeforeEach
    void setUp() {
        workspace = Post.builder()
                .idx(10L)
                .UUID("fileinnout-public-demo")
                .title("Demo")
                .contents("{}")
                .type(true)
                .status(isShare.Shared)
                .build();
        adminMembership = UserPost.builder()
                .workspace(workspace)
                .Level(AccessRole.ADMIN)
                .build();
        admin = AuthUserDetails.builder().idx(1L).email("demo.admin@fileinnout.com").build();

        lenient().doThrow(BaseException.from(BaseResponseStatus.DEMO_PROTECTED_ACTION))
                .when(demoAccessPolicy).assertWorkspaceMutable(workspace);
    }

    @Test
    void blocksWorkspaceDeleteBeforeDeletingAssets() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.delete(10L, 1L));

        verify(workspaceAssetService, never()).deleteAllWorkspaceAssets(any());
        verify(postRepository, never()).delete(any());
    }

    @Test
    void readRoleCannotModifyWorkspaceContent() {
        User viewer = User.builder().idx(3L).email("demo.viewer@fileinnout.com").build();
        UserPost readMembership = UserPost.builder()
                .user(viewer)
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();
        AuthUserDetails viewerDetails = AuthUserDetails.builder()
                .idx(3L)
                .email("demo.viewer@fileinnout.com")
                .build();
        when(userRepository.findByEmail("demo.viewer@fileinnout.com")).thenReturn(Optional.of(viewer));
        when(postRepository.findById(10L)).thenReturn(Optional.of(workspace));
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(3L, 10L))
                .thenReturn(Optional.of(readMembership));

        assertThatThrownBy(() -> service.save(
                new PostDto.ReqPost(10L, "changed", "changed", "request-id"),
                viewerDetails
        )).isInstanceOfSatisfying(BaseException.class, exception ->
                assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.WORKSPACE_ACCESS_DENIED));

        verify(postRepository, never()).save(any());
    }

    @Test
    void blocksLeavingDemoWorkspaceBeforeDeletingMembership() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.list_delete(10L, 1L));

        verify(userPostRepository, never()).deleteByUser_IdxAndWorkspace_Idx(any(), any());
    }

    @Test
    void blocksInviteBeforeSendingNotification() {
        when(postRepository.findByUUID("fileinnout-public-demo")).thenReturn(Optional.of(workspace));

        assertDemoRejected(() -> service.invite("fileinnout-public-demo", "person@example.com", admin));

        verify(notificationService, never()).sendWorkspaceInviteNotification(any(), any(), any());
    }

    @Test
    void blocksShareModeChangeBeforeSavingWorkspace() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.isShared(10L, 1L, new PostDto.ReqType(true, isShare.Public)));

        verify(postRepository, never()).save(any());
    }

    @Test
    void blocksSingleRoleChangeBeforeSendingSse() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.changeSingleRole(10L, admin, 2L, "WRITE"));

        verify(sseService, never()).sendRoleChanged(any(), any(), any());
    }

    @Test
    void blocksKickAndBulkRoleChanges() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.kickMember(10L, admin, 2L));
        assertDemoRejected(() -> service.saveRole(10L, admin, Map.of(2L, AccessRole.WRITE)));

        verify(userPostRepository, never()).deleteByUser_IdxAndWorkspace_Idx(any(), any());
        verify(userPostRepository, never()).findAllByWorkspaceIdAndUserIdsExceptAdmin(any(), any(), any());
    }

    @Test
    void blocksSharingWithUsersBeforeCreatingInvites() {
        when(userPostRepository.findByUser_IdxAndWorkspace_Idx(1L, 10L))
                .thenReturn(Optional.of(adminMembership));

        assertDemoRejected(() -> service.shareWithUsers(10L, 1L, List.of(2L)));

        verify(userRepository, never()).findById(any());
        verify(emailVerifyRepository, never()).save(any());
    }

    private void assertDemoRejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action)
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.DEMO_PROTECTED_ACTION));
    }
}
