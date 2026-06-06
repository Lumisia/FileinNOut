package com.example.WaffleBear.workspace.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.workspace.model.post.*;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.PostVersionRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PostVersionService {

    private final PostVersionRepository postVersionRepository;
    private final UserPostRepository userPostRepository;
    private final PostRepository postRepository;

    @Transactional
    public PostVersionDto.Detail createSnapshot(Post post, Long createdBy, String idempotencyKey) {
        postRepository.findByIdForVersionUpdate(post.getIdx());
        return postVersionRepository.findByPost_IdxAndIdempotencyKey(post.getIdx(), idempotencyKey)
                .map(PostVersionDto.Detail::from)
                .orElseGet(() -> {
                    int nextVersion = postVersionRepository.findMaxVersionNumByPostId(post.getIdx()) + 1;
                    PostVersion version = PostVersion.builder()
                            .post(post)
                            .versionNum(nextVersion)
                            .titleSnapshot(post.getTitle())
                            .contentSnapshot(post.getContents())
                            .createdBy(createdBy)
                            .createdAt(LocalDateTime.now())
                            .idempotencyKey(idempotencyKey)
                            .build();
                    return PostVersionDto.Detail.from(postVersionRepository.save(version));
                });
    }

    @Transactional(readOnly = true)
    public List<PostVersionDto.ListItem> listVersions(Long postId, Long userIdx) {
        verifyAccess(postId, userIdx, false);
        return postVersionRepository.findByPost_IdxOrderByVersionNumDesc(postId)
                .stream().map(PostVersionDto.ListItem::from).toList();
    }

    @Transactional(readOnly = true)
    public PostVersionDto.Detail getVersion(Long postId, Integer versionNum, Long userIdx) {
        verifyAccess(postId, userIdx, false);
        PostVersion version = postVersionRepository.findByPost_IdxAndVersionNum(postId, versionNum)
                .orElseThrow(() -> new BaseException(BaseResponseStatus.WORKSPACE_NOT_FOUND));
        return PostVersionDto.Detail.from(version);
    }

    private void verifyAccess(Long postId, Long userIdx, boolean requireWrite) {
        UserPost userPost = userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, postId)
                .orElseThrow(() -> new BaseException(BaseResponseStatus.WORKSPACE_ACCESS_DENIED));
        if (requireWrite && userPost.getLevel() == AccessRole.READ) {
            throw new BaseException(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
        }
    }
}
