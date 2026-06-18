package com.example.WaffleBear.demo;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.workspace.model.post.Post;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DemoAccessPolicyTest {

    private DemoAccessPolicy policy;

    @BeforeEach
    void setUp() {
        DemoProperties properties = new DemoProperties();
        properties.setEnabled(true);
        properties.setWorkspaceUuid("fileinnout-public-demo");
        properties.getAccounts().getAdmin().setEmail("demo.admin@fileinnout.com");
        properties.getAccounts().getEditor().setEmail("demo.editor@fileinnout.com");
        properties.getAccounts().getViewer().setEmail("demo.viewer@fileinnout.com");
        policy = new DemoAccessPolicy(properties);
    }

    @Test
    void rejectsMutationOfDemoWorkspace() {
        Post workspace = Post.builder().UUID("fileinnout-public-demo").build();

        assertThatThrownBy(() -> policy.assertWorkspaceMutable(workspace))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.DEMO_PROTECTED_ACTION));
    }

    @Test
    void allowsMutationOfNormalWorkspace() {
        Post workspace = Post.builder().UUID("another-workspace").build();

        assertThatCode(() -> policy.assertWorkspaceMutable(workspace)).doesNotThrowAnyException();
    }

    @Test
    void rejectsOrdersForEveryDemoAccountIgnoringEmailCase() {
        assertThatThrownBy(() -> policy.assertOrderAllowed("DEMO.EDITOR@FILEINNOUT.COM"))
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.DEMO_PROTECTED_ACTION));
    }

    @Test
    void allowsOrdersForNormalAccount() {
        assertThatCode(() -> policy.assertOrderAllowed("member@example.com")).doesNotThrowAnyException();
    }

    @Test
    void disabledDemoModeDoesNotBlockAnything() {
        DemoProperties properties = new DemoProperties();
        properties.setEnabled(false);
        properties.setWorkspaceUuid("fileinnout-public-demo");
        DemoAccessPolicy disabledPolicy = new DemoAccessPolicy(properties);

        assertThatCode(() -> disabledPolicy.assertWorkspaceMutable(
                Post.builder().UUID("fileinnout-public-demo").build())).doesNotThrowAnyException();
        assertThatCode(() -> disabledPolicy.assertOrderAllowed("demo.admin@fileinnout.com"))
                .doesNotThrowAnyException();
    }
}
