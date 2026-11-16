package com.example.WaffleBear.workspace.service;

import com.example.WaffleBear.config.sse.SseService;
import com.example.WaffleBear.demo.DemoAccessPolicy;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.asset.WorkspaceAssetService;
import com.example.WaffleBear.workspace.model.post.PostDto;
import com.example.WaffleBear.workspace.model.post.isShare;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PostServiceWorkspaceListTest {

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

    @Test
    void listUsesProjectionQueryWithBoundedPageSize() {
        LocalDateTime updatedAt = LocalDateTime.of(2026, 7, 6, 10, 0);
        when(userPostRepository.findWorkspaceListByUserIdx(eq(7L), any(Pageable.class)))
                .thenReturn(List.of(projection(11L, "workspace-11", updatedAt, isShare.Private, "uuid-11", AccessRole.ADMIN)));

        List<PostDto.ResList> result = service.list(7L, -3, 500);

        assertThat(result).containsExactly(new PostDto.ResList(
                11L,
                "workspace-11",
                updatedAt,
                isShare.Private,
                "uuid-11",
                AccessRole.ADMIN
        ));

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(userPostRepository).findWorkspaceListByUserIdx(eq(7L), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isZero();
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(PostService.MAX_WORKSPACE_LIST_SIZE);
        verify(userPostRepository, never()).findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(any());
    }

    private UserPostRepository.WorkspaceListProjection projection(
            Long postIdx,
            String title,
            LocalDateTime updatedAt,
            isShare status,
            String uuid,
            AccessRole level
    ) {
        return new UserPostRepository.WorkspaceListProjection() {
            @Override
            public Long getPostIdx() {
                return postIdx;
            }

            @Override
            public String getTitle() {
                return title;
            }

            @Override
            public LocalDateTime getUpdatedAt() {
                return updatedAt;
            }

            @Override
            public isShare getStatus() {
                return status;
            }

            @Override
            public String getUuid() {
                return uuid;
            }

            @Override
            public AccessRole getLevel() {
                return level;
            }
        };
    }
}
