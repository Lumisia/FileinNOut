package com.example.WaffleBear.config.sse;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class SseEmitterStore {
    // 사용자별 active SSE emitter를 저장합니다.
    // 한 사용자가 여러 연결(여러 탭/기기)을 열 수 있으므로 userId -> (connectionId -> emitter)
    // 2단계 맵으로 보관합니다. connectionId 단위로 정확히 추가/삭제해야 다른 연결의 emitter를
    // 실수로 지우지 않습니다.
    private final ConcurrentMap<Long, ConcurrentMap<String, SseEmitter>> emitters = new ConcurrentHashMap<>();

    public void put(Long userId, String connectionId, SseEmitter emitter) {
        if (userId == null || connectionId == null || emitter == null) return;
        emitters.computeIfAbsent(userId, key -> new ConcurrentHashMap<>()).put(connectionId, emitter);
    }

    public void remove(Long userId, String connectionId) {
        if (userId == null || connectionId == null) return;
        ConcurrentMap<String, SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters == null) return;
        userEmitters.remove(connectionId);
        // 비어 있으면 정리. 동시에 put이 끼어들 수 있으므로 "현재 비어 있는 그 맵"일 때만 제거한다.
        if (userEmitters.isEmpty()) {
            emitters.remove(userId, userEmitters);
        }
    }

    public Collection<SseEmitter> get(Long userId) {
        if (userId == null) return List.of();
        ConcurrentMap<String, SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters == null) return List.of();
        // 순회 중 변경에 안전하도록 스냅샷을 반환한다.
        return new ArrayList<>(userEmitters.values());
    }

    public boolean isConnected(Long userId) {
        if (userId == null) return false;
        ConcurrentMap<String, SseEmitter> userEmitters = emitters.get(userId);
        return userEmitters != null && !userEmitters.isEmpty();
    }

    public int connectionCount(Long userId) {
        if (userId == null) return 0;
        ConcurrentMap<String, SseEmitter> userEmitters = emitters.get(userId);
        return userEmitters == null ? 0 : userEmitters.size();
    }

    // heartbeat 등 전체 연결을 순회해야 할 때 사용한다.
    public void forEachEmitter(EmitterConsumer consumer) {
        if (consumer == null) return;
        emitters.forEach((userId, userEmitters) ->
                userEmitters.forEach((connectionId, emitter) ->
                        consumer.accept(userId, connectionId, emitter)));
    }

    @FunctionalInterface
    public interface EmitterConsumer {
        void accept(Long userId, String connectionId, SseEmitter emitter);
    }
}
