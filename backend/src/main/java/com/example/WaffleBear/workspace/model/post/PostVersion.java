package com.example.WaffleBear.workspace.model.post;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "post_versions",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_post_versions_post_version", columnNames = {"post_id", "version_num"}),
        @UniqueConstraint(name = "uk_post_versions_post_idempotency", columnNames = {"post_id", "idempotency_key"})
    }
)
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PostVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id", nullable = false)
    private Post post;

    @Column(name = "version_num", nullable = false)
    private Integer versionNum;

    @Lob
    @Column(name = "content_snapshot", nullable = false, columnDefinition = "LONGTEXT")
    private String contentSnapshot;

    @Column(name = "title_snapshot", nullable = false)
    private String titleSnapshot;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "idempotency_key", nullable = false, length = 36)
    private String idempotencyKey;
}
