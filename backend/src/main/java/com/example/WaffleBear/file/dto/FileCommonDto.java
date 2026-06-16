package com.example.WaffleBear.file.dto;

import com.example.WaffleBear.administrator.storage.DataTransferSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

public class FileCommonDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FileListItemRes {
        private Long idx;
        private String fileOriginName;
        private String fileSaveName;
        private String fileSavePath;
        private String fileFormat;
        private Long fileSize;
        private String nodeType;
        private Long parentId;
        private Boolean lockedFile;
        private Boolean sharedFile;
        private Boolean trashed;
        private LocalDateTime deletedAt;
        private LocalDateTime uploadDate;
        private LocalDateTime lastModifyDate;
        private String presignedDownloadUrl;
        private String thumbnailPresignedUrl;
        private Integer presignedUrlExpiresIn;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FileActionRes {
        private Long targetIdx;
        private String action;
        private Integer affectedCount;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FileBreadcrumbRes {
        private Long idx;
        private String fileOriginName;
        private Long parentId;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FileListPageRes {
        private List<FileListItemRes> fileList;
        private List<FileBreadcrumbRes> breadcrumbs;
        private List<String> availableExtensions;
        private int totalPage;
        private long totalCount;
        private int currentPage;
        private int currentSize;
    }

    public record FileDownloadDescriptor(
            String bucketName,
            String objectKey,
            String contentType,
            String fileName,
            Long contentLength,
            DataTransferSource source,
            String referenceLabel
    ) {}

    public record FileDownloadUrlRes(
            String downloadUrl
    ) {
    }
}
