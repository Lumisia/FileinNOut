package com.example.WaffleBear.demo;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DemoDataBootstrapTest {

    @Mock private UserRepository userRepository;
    @Mock private PostRepository postRepository;
    @Mock private UserPostRepository userPostRepository;
    @Mock private PasswordEncoder passwordEncoder;

    private DemoProperties properties;

    @BeforeEach
    void setUp() {
        properties = new DemoProperties();
        properties.setEnabled(true);
        properties.setPassword("Demo1234!");
        properties.setWorkspaceUuid("fileinnout-public-demo");
        properties.setWorkspaceTitle("FileInNOut 공개 데모");
        configure(properties.getAccounts().getAdmin(), "demo.admin@fileinnout.com", "Demo 관리자");
        configure(properties.getAccounts().getEditor(), "demo.editor@fileinnout.com", "Demo 편집자");
        configure(properties.getAccounts().getViewer(), "demo.viewer@fileinnout.com", "Demo 뷰어");
    }

    @Test
    void disabledModeDoesNotTouchRepositories() throws Exception {
        properties.setEnabled(false);
        DemoDataBootstrap bootstrap = bootstrap();

        bootstrap.run(null);

        verify(userRepository, never()).findByEmail(any());
        verify(postRepository, never()).findByUUID(any());
    }

    @Test
    void createsThreeUsersWorkspaceAndDistinctRoles() throws Exception {
        when(userRepository.findByEmail(any())).thenReturn(Optional.empty());
        when(userRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(postRepository.findByUUID("fileinnout-public-demo")).thenReturn(Optional.empty());
        when(postRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(userPostRepository.findByUserAndWorkspace(any(), any())).thenReturn(Optional.empty());
        when(passwordEncoder.encode("Demo1234!")).thenReturn("encoded-demo-password");

        bootstrap().run(null);

        ArgumentCaptor<User> users = ArgumentCaptor.forClass(User.class);
        verify(userRepository, org.mockito.Mockito.times(3)).save(users.capture());
        assertThat(users.getAllValues())
                .extracting(User::getEmail)
                .containsExactly(
                        "demo.admin@fileinnout.com",
                        "demo.editor@fileinnout.com",
                        "demo.viewer@fileinnout.com"
                );
        assertThat(users.getAllValues()).allSatisfy(user -> {
            assertThat(user.getPassword()).isEqualTo("encoded-demo-password");
            assertThat(user.getRole()).isEqualTo("ROLE_USER");
            assertThat(user.getEnable()).isTrue();
            assertThat(user.getAccountStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        });

        ArgumentCaptor<Post> workspace = ArgumentCaptor.forClass(Post.class);
        verify(postRepository).save(workspace.capture());
        assertThat(workspace.getValue().getUUID()).isEqualTo("fileinnout-public-demo");
        assertThat(workspace.getValue().getTitle()).isEqualTo("FileInNOut 공개 데모");

        ArgumentCaptor<UserPost> memberships = ArgumentCaptor.forClass(UserPost.class);
        verify(userPostRepository, org.mockito.Mockito.times(3)).save(memberships.capture());
        assertThat(memberships.getAllValues())
                .extracting(UserPost::getLevel)
                .containsExactly(AccessRole.ADMIN, AccessRole.WRITE, AccessRole.READ);
    }

    @Test
    void repairsExistingAccountAndMembershipWithoutCreatingDuplicates() throws Exception {
        User existing = User.builder()
                .email("demo.admin@fileinnout.com")
                .name("old")
                .password("old-hash")
                .enable(false)
                .role("ROLE_ADMIN")
                .accountStatus(UserAccountStatus.SUSPENDED)
                .build();
        Post workspace = Post.builder()
                .UUID("fileinnout-public-demo")
                .title("old title")
                .contents("{}")
                .build();
        UserPost membership = UserPost.builder()
                .user(existing)
                .workspace(workspace)
                .Level(AccessRole.READ)
                .build();

        when(userRepository.findByEmail(any())).thenReturn(Optional.of(existing));
        when(userRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(postRepository.findByUUID("fileinnout-public-demo")).thenReturn(Optional.of(workspace));
        when(postRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(userPostRepository.findByUserAndWorkspace(any(), any())).thenReturn(Optional.of(membership));
        when(passwordEncoder.matches("Demo1234!", "old-hash")).thenReturn(false);
        when(passwordEncoder.encode("Demo1234!")).thenReturn("new-hash");

        bootstrap().run(null);

        assertThat(existing.getName()).isEqualTo("Demo 뷰어");
        assertThat(existing.getPassword()).isEqualTo("new-hash");
        assertThat(existing.getRole()).isEqualTo("ROLE_USER");
        assertThat(existing.getEnable()).isTrue();
        assertThat(existing.getAccountStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        assertThat(workspace.getTitle()).isEqualTo("FileInNOut 공개 데모");
        assertThat(workspace.getContents()).isEqualTo("{}");
        assertThat(membership.getLevel()).isEqualTo(AccessRole.READ);
        verify(userPostRepository, org.mockito.Mockito.times(3)).save(membership);
    }

    private DemoDataBootstrap bootstrap() {
        return new DemoDataBootstrap(
                properties,
                userRepository,
                postRepository,
                userPostRepository,
                passwordEncoder
        );
    }

    private void configure(DemoProperties.Account account, String email, String name) {
        account.setEmail(email);
        account.setName(name);
    }
}
