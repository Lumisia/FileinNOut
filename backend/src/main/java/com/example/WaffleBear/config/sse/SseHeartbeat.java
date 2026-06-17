package com.example.WaffleBear.config.sse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class SseHeartbeat {
    // SSE는 이벤트가 없으면 바이트가 흐르지 않는다. nginx/Cloudflare 같은 중간 프록시는
    // 일정 시간 데이터가 없는 연결을 idle로 보고 끊을 수 있어, 끊김 → 재연결 폭주로 이어진다.
    // 주기적으로 SSE comment(":ping")를 보내 연결을 살아 있게 유지한다.
    // comment 라인은 EventSource 클라이언트가 무시하므로 애플리케이션 이벤트에 영향이 없다.
    private static final long HEARTBEAT_INTERVAL_MS = 15_000L;

    private final SseEmitterStore emitterStore;

    @Scheduled(fixedRate = HEARTBEAT_INTERVAL_MS)
    public void sendHeartbeat() {
        emitterStore.forEachEmitter((userId, connectionId, emitter) -> {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (IOException | IllegalStateException e) {
                // 이미 끊긴 연결. store에서 제거하고 완료 처리한다.
                emitterStore.remove(userId, connectionId);
                try {
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                    // 이미 완료된 emitter면 무시
                }
            }
        });
    }
}
