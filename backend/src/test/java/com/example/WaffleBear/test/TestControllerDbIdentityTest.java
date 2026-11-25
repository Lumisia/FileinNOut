package com.example.WaffleBear.test;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TestControllerDbIdentityTest {

    @Test
    void returnsServerIdAndReadOnlyOfConnectedDb() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForMap(anyString())).thenReturn(Map.of("serverId", 2L, "readOnly", 0));

        Map<String, Object> response = new TestController(jdbcTemplate).dbIdentity();

        assertThat(response).containsEntry("serverId", 2L).containsEntry("readOnly", 0).containsKey("pod");
    }
}
