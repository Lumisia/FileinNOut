package com.example.WaffleBear.demo;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "demo")
public class DemoProperties {

    private boolean enabled;
    private String password;
    private String workspaceUuid;
    private String workspaceTitle;
    private final Accounts accounts = new Accounts();

    public List<Account> accountList() {
        return List.of(accounts.admin, accounts.editor, accounts.viewer);
    }

    @Getter
    public static class Accounts {
        private final Account admin = new Account();
        private final Account editor = new Account();
        private final Account viewer = new Account();
    }

    @Getter
    @Setter
    public static class Account {
        private String email;
        private String name;
    }
}
