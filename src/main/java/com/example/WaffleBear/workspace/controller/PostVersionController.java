package com.example.WaffleBear.workspace.controller;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.workspace.model.post.PostVersionDto;
import com.example.WaffleBear.workspace.service.PostVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/workspace")
public class PostVersionController {

    private final PostVersionService postVersionService;

    @GetMapping("/{postId}/versions")
    public ResponseEntity<?> listVersions(
            @PathVariable Long postId,
            @AuthenticationPrincipal AuthUserDetails user) {
        return ResponseEntity.ok(BaseResponse.success(
                postVersionService.listVersions(postId, user.getIdx())));
    }

    @GetMapping("/{postId}/versions/{versionNum}")
    public ResponseEntity<?> getVersion(
            @PathVariable Long postId,
            @PathVariable Integer versionNum,
            @AuthenticationPrincipal AuthUserDetails user) {
        return ResponseEntity.ok(BaseResponse.success(
                postVersionService.getVersion(postId, versionNum, user.getIdx())));
    }
}
