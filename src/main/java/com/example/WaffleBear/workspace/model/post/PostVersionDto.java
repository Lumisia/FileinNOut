package com.example.WaffleBear.workspace.model.post;

import java.time.LocalDateTime;

public class PostVersionDto {

    public record ListItem(
            Long id,
            Integer versionNum,
            String titleSnapshot,
            Long createdBy,
            LocalDateTime createdAt
    ) {
        public static ListItem from(PostVersion entity) {
            return new ListItem(
                    entity.getId(),
                    entity.getVersionNum(),
                    entity.getTitleSnapshot(),
                    entity.getCreatedBy(),
                    entity.getCreatedAt()
            );
        }
    }

    public record Detail(
            Long id,
            Integer versionNum,
            String titleSnapshot,
            String contentSnapshot,
            Long createdBy,
            LocalDateTime createdAt
    ) {
        public static Detail from(PostVersion entity) {
            return new Detail(
                    entity.getId(),
                    entity.getVersionNum(),
                    entity.getTitleSnapshot(),
                    entity.getContentSnapshot(),
                    entity.getCreatedBy(),
                    entity.getCreatedAt()
            );
        }
    }

    public record RollbackReq(String idempotencyKey) {}
}
