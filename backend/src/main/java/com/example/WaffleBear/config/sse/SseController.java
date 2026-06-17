package com.example.WaffleBear.config.sse;

import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;


import java.io.IOException;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/sse")
@Tag(name = "Realtime", description = "Realtime event stream APIs")
@SecurityRequirement(name = "bearerAuth")
public class SseController {
    private final SseEmitterStore emitterStore;

    @GetMapping(value = "/connect", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Connect SSE", description = "Opens a server-sent events stream for realtime updates.")
    public SseEmitter connect(
            @AuthenticationPrincipal AuthUserDetails user) {

        if (user == null) {
            // JwtFilter/인증 실패 케이스 방어 (SecurityConfig.anyRequest().authenticated로 원칙적으로 차단됨)
            return new SseEmitter(0L);
        }

        Long userIdx = user.getIdx();
        // 연결마다 고유 id를 부여해 같은 사용자의 다른 연결과 독립적으로 관리한다.
        String connectionId = UUID.randomUUID().toString();

        SseEmitter emitter = new SseEmitter(60 * 1000L * 60);
        emitterStore.put(userIdx, connectionId, emitter);

        // 연결 종료나 타임아웃 발생 시 Map에서 제거 (중요: 메모리 누수 방지)
        emitter.onCompletion(() -> emitterStore.remove(userIdx, connectionId));
        emitter.onTimeout(() -> emitterStore.remove(userIdx, connectionId));
        emitter.onError((e) -> emitterStore.remove(userIdx, connectionId));

        try {
            emitter.send(SseEmitter.event().name(
                    user.getName()+" => SSE").data("연결 성공"));
        }catch (IOException e) {
            emitterStore.remove(userIdx, connectionId);
        }
        return emitter;
    }
}
