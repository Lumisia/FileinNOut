package com.example.WaffleBear.config.sse;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class SseHeartbeatTest {

    // send 시 항상 실패해 끊긴 연결을 흉내 낸다.
    static class DeadEmitter extends SseEmitter {
        @Override
        public void send(SseEmitter.SseEventBuilder builder) throws IOException {
            throw new IOException("broken pipe");
        }
    }

    // send 호출 횟수를 세는 살아 있는 연결.
    static class CountingEmitter extends SseEmitter {
        final AtomicInteger sendCount = new AtomicInteger();

        @Override
        public void send(SseEmitter.SseEventBuilder builder) {
            sendCount.incrementAndGet();
        }
    }

    @Test
    void heartbeatPingsLiveConnections() {
        SseEmitterStore store = new SseEmitterStore();
        CountingEmitter live = new CountingEmitter();
        store.put(1L, "conn-a", live);

        new SseHeartbeat(store).sendHeartbeat();

        assertThat(live.sendCount.get()).isEqualTo(1);
        assertThat(store.isConnected(1L)).isTrue();
    }

    @Test
    void heartbeatRemovesDeadConnectionsButKeepsLiveOnes() {
        SseEmitterStore store = new SseEmitterStore();
        CountingEmitter live = new CountingEmitter();
        DeadEmitter dead = new DeadEmitter();
        store.put(1L, "live", live);
        store.put(1L, "dead", dead);

        new SseHeartbeat(store).sendHeartbeat();

        // 끊긴 연결은 정리되고, 살아 있는 연결은 유지된다.
        assertThat(store.connectionCount(1L)).isEqualTo(1);
        assertThat(store.get(1L)).containsExactly(live);
    }
}
