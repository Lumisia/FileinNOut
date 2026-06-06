package com.example.WaffleBear.workspace.repository;

import com.example.WaffleBear.workspace.model.post.PostVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PostVersionRepository extends JpaRepository<PostVersion, Long> {

    List<PostVersion> findByPost_IdxOrderByVersionNumDesc(Long postId);

    Optional<PostVersion> findByPost_IdxAndVersionNum(Long postId, Integer versionNum);

    Optional<PostVersion> findByIdempotencyKey(String idempotencyKey);

    Optional<PostVersion> findByPost_IdxAndIdempotencyKey(Long postId, String idempotencyKey);

    @Query("SELECT COALESCE(MAX(v.versionNum), 0) FROM PostVersion v WHERE v.post.idx = :postId")
    Integer findMaxVersionNumByPostId(@Param("postId") Long postId);
}
