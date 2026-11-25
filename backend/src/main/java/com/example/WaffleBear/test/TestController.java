package com.example.WaffleBear.test;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    private final JdbcTemplate jdbcTemplate;

    @Value("${APP_VERSION:unknown}")
    private String appVersion;

    @Value("${POD_NAME:unknown}")
    private String podName;

    public TestController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/version")
    public Map<String, Object> version() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("service", "backend");
        response.put("version", appVersion);
        response.put("podName", podName);
        response.put("timestamp", Instant.now().toString());
        return response;
    }

    // 임시: DB 이전(옛 DB server_id=1 → 새 DB 2) 중 앱이 실제로 어느 DB에 붙었는지 폴링으로 확인한다.
    @GetMapping("/db-identity")
    public Map<String, Object> dbIdentity() {
        Map<String, Object> db = jdbcTemplate.queryForMap("SELECT @@server_id AS serverId, @@read_only AS readOnly");
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("serverId", db.get("serverId"));
        response.put("readOnly", db.get("readOnly"));
        response.put("pod", podName);
        return response;
    }
}
