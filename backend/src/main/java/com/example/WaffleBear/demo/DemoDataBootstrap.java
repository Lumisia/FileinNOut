package com.example.WaffleBear.demo;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class DemoDataBootstrap implements ApplicationRunner {

    private static final String EMPTY_EDITOR_CONTENTS = "{\"time\":0,\"blocks\":[],\"version\":\"2.30.0\"}";

    private final DemoProperties properties;
    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final UserPostRepository userPostRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!properties.isEnabled()) {
            return;
        }

        Post workspace = repairWorkspace();
        for (AccountRole accountRole : accountRoles()) {
            User user = repairUser(accountRole.account());
            repairMembership(user, workspace, accountRole.role());
        }
    }

    private Post repairWorkspace() {
        Post workspace = postRepository.findByUUID(properties.getWorkspaceUuid())
                .orElseGet(() -> Post.builder()
                        .UUID(properties.getWorkspaceUuid())
                        .title(properties.getWorkspaceTitle())
                        .contents(EMPTY_EDITOR_CONTENTS)
                        .build());

        workspace.setUUID(properties.getWorkspaceUuid());
        String preservedContents = workspace.getContents() == null
                ? EMPTY_EDITOR_CONTENTS
                : workspace.getContents();
        workspace.update(properties.getWorkspaceTitle(), preservedContents);
        return postRepository.save(workspace);
    }

    private User repairUser(DemoProperties.Account account) {
        User user = userRepository.findByEmail(account.getEmail())
                .orElseGet(() -> User.builder().email(account.getEmail()).build());

        user.setEmail(account.getEmail());
        user.setName(account.getName());
        user.setEnable(true);
        user.setRole("ROLE_USER");
        user.setAccountStatus(UserAccountStatus.ACTIVE);

        if (shouldResetPassword(user.getPassword())) {
            user.setPassword(passwordEncoder.encode(properties.getPassword()));
        }

        return userRepository.save(user);
    }

    private void repairMembership(User user, Post workspace, AccessRole role) {
        UserPost membership = userPostRepository.findByUserAndWorkspace(user, workspace)
                .orElseGet(() -> UserPost.builder()
                        .user(user)
                        .workspace(workspace)
                        .build());
        membership.updateLevel(role);
        userPostRepository.save(membership);
    }

    private boolean shouldResetPassword(String storedPassword) {
        if (storedPassword == null || storedPassword.isBlank()) {
            return true;
        }

        try {
            return !passwordEncoder.matches(properties.getPassword(), storedPassword);
        } catch (IllegalArgumentException exception) {
            return true;
        }
    }

    private List<AccountRole> accountRoles() {
        return List.of(
                new AccountRole(properties.getAccounts().getAdmin(), AccessRole.ADMIN),
                new AccountRole(properties.getAccounts().getEditor(), AccessRole.WRITE),
                new AccountRole(properties.getAccounts().getViewer(), AccessRole.READ)
        );
    }

    private record AccountRole(DemoProperties.Account account, AccessRole role) {
    }
}
