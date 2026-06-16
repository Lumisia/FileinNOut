package com.example.WaffleBear.chat.model.dto;

import com.example.WaffleBear.chat.model.entity.ChatMessages;
import com.example.WaffleBear.chat.model.entity.ChatRooms;
import com.example.WaffleBear.chat.model.entity.MessageType;
import com.example.WaffleBear.user.model.User;
import lombok.Builder;
import lombok.Getter;
import org.springframework.data.domain.Page;

import java.time.LocalDateTime;
import java.util.List;

public class ChatMessagesDto {
    @Getter
    public static class Send {
        private String contents;
        private String fileUrl;
        private String fileName;
        private String fileType;
        private Long fileSize;
        private Long fileId;
        private MessageType messageType;

        public ChatMessages toEntity(ChatRooms room, User sender) {
            return ChatMessages.builder()
                    .chatRooms(room)
                    .sender(sender)
                    .contents(this.contents)
                    .fileUrl(this.fileUrl)
                    .fileName(this.fileName)
                    .fileType(this.fileType)
                    .fileSize(this.fileSize)
                    .fileId(this.fileId)
                    .messageType(this.messageType != null ? this.messageType : MessageType.TEXT)
                    .createdAt(LocalDateTime.now())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class PageRes {
        private List<ListRes> messageList;
        private int totalPage;
        private long totalCount;
        private int currentPage;
        private int currentSize;

        public static PageRes from(Page<ChatMessages> result) {
            return PageRes.builder()
                    .messageList(result.get().map(ListRes::from).toList())
                    .totalPage(result.getTotalPages())
                    .totalCount(result.getTotalElements())
                    .currentPage(result.getPageable().getPageNumber())
                    .currentSize(result.getPageable().getPageSize())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class ListRes {
        private Long idx;
        private Long senderIdx;
        private String senderNickname;
        private String contents;
        private LocalDateTime createdAt;
        private int messageUnreadCount;
        private String profileImageUrl;
        private String fileUrl;
        private String fileName;
        private String fileType;
        private Long fileSize;
        private Long fileId;
        private String messageType;

        public static ListRes from(ChatMessages entity, int messageUnreadCount, String profileImageUrl) {
            return ListRes.builder()
                    .idx(entity.getIdx())
                    .senderIdx(entity.getSender().getIdx())
                    .senderNickname(entity.getSender().getName())
                    .contents(entity.getContents())
                    .createdAt(entity.getCreatedAt())
                    .messageUnreadCount(messageUnreadCount)
                    .profileImageUrl(profileImageUrl)
                    .fileUrl(entity.getFileUrl())
                    .fileName(entity.getFileName())
                    .fileType(entity.getFileType())
                    .fileSize(entity.getFileSize())
                    .fileId(entity.getFileId())
                    .messageType(entity.getMessageType() != null ? entity.getMessageType().name() : "TEXT")
                    .build();
        }

        public static ListRes from(ChatMessages entity) {
            return from(entity, 0, null);
        }
    }
}
