package com.example.WaffleBear.demo;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.workspace.model.post.Post;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public class DemoAccessPolicy {

    private final DemoProperties properties;

    public DemoAccessPolicy(DemoProperties properties) {
        this.properties = properties;
    }

    public void assertWorkspaceMutable(Post workspace) {
        if (properties.isEnabled()
                && workspace != null
                && Objects.equals(properties.getWorkspaceUuid(), workspace.getUUID())) {
            reject();
        }
    }

    public void assertOrderAllowed(String email) {
        if (!properties.isEnabled() || email == null) {
            return;
        }

        boolean demoAccount = properties.accountList().stream()
                .map(DemoProperties.Account::getEmail)
                .filter(Objects::nonNull)
                .anyMatch(configuredEmail -> configuredEmail.equalsIgnoreCase(email));

        if (demoAccount) {
            reject();
        }
    }

    private void reject() {
        throw BaseException.from(BaseResponseStatus.DEMO_PROTECTED_ACTION);
    }
}
