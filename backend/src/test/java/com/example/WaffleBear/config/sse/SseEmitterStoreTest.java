package com.example.WaffleBear.config.sse;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SseEmitterStoreTest {

    @Test
    void keepsMultipleConnectionsPerUserIndependent() {
        SseEmitterStore store = new SseEmitterStore();
        SseEmitter first = new SseEmitter();
        SseEmitter second = new SseEmitter();

        store.put(1L, "conn-a", first);
        store.put(1L, "conn-b", second);

        assertThat(store.isConnected(1L)).isTrue();
        assertThat(store.connectionCount(1L)).isEqualTo(2);
        assertThat(store.get(1L)).containsExactlyInAnyOrder(first, second);
    }

    @Test
    void removingOneConnectionDoesNotAffectOthers() {
        SseEmitterStore store = new SseEmitterStore();
        SseEmitter first = new SseEmitter();
        SseEmitter second = new SseEmitter();
        store.put(1L, "conn-a", first);
        store.put(1L, "conn-b", second);

        store.remove(1L, "conn-a");

        // 다른 연결의 emitter는 그대로 남아야 한다 (이전 버그: userId 키 하나라 서로 덮어씀/지움).
        assertThat(store.connectionCount(1L)).isEqualTo(1);
        assertThat(store.get(1L)).containsExactly(second);
        assertThat(store.isConnected(1L)).isTrue();
    }

    @Test
    void removingLastConnectionMarksUserDisconnected() {
        SseEmitterStore store = new SseEmitterStore();
        store.put(1L, "conn-a", new SseEmitter());

        store.remove(1L, "conn-a");

        assertThat(store.isConnected(1L)).isFalse();
        assertThat(store.connectionCount(1L)).isZero();
        assertThat(store.get(1L)).isEmpty();
    }

    @Test
    void usersAreIsolatedFromEachOther() {
        SseEmitterStore store = new SseEmitterStore();
        SseEmitter userOne = new SseEmitter();
        SseEmitter userTwo = new SseEmitter();
        store.put(1L, "conn-a", userOne);
        store.put(2L, "conn-a", userTwo);

        store.remove(1L, "conn-a");

        assertThat(store.isConnected(1L)).isFalse();
        assertThat(store.get(2L)).containsExactly(userTwo);
    }

    @Test
    void forEachEmitterVisitsEveryConnection() {
        SseEmitterStore store = new SseEmitterStore();
        store.put(1L, "conn-a", new SseEmitter());
        store.put(1L, "conn-b", new SseEmitter());
        store.put(2L, "conn-a", new SseEmitter());

        Collection<String> visited = new ArrayList<>();
        store.forEachEmitter((userId, connectionId, emitter) -> visited.add(userId + ":" + connectionId));

        assertThat(visited).containsExactlyInAnyOrder("1:conn-a", "1:conn-b", "2:conn-a");
    }

    @Test
    void nullArgumentsAreNoOps() {
        SseEmitterStore store = new SseEmitterStore();

        store.put(null, "conn", new SseEmitter());
        store.put(1L, null, new SseEmitter());
        store.put(1L, "conn", null);
        store.remove(null, "conn");
        store.remove(1L, null);

        assertThat(store.isConnected(1L)).isFalse();
        assertThat(store.get(null)).isEqualTo(List.of());
        assertThat(store.connectionCount(null)).isZero();
    }
}
