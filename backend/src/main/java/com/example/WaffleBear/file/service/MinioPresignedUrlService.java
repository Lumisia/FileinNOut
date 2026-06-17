package com.example.WaffleBear.file.service;

import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class MinioPresignedUrlService {
    private final MinioClient publicMinioClient;

    public MinioPresignedUrlService(@Qualifier("publicMinioClient") MinioClient publicMinioClient) {
        this.publicMinioClient = publicMinioClient;
    }

    public String getPresignedObjectUrl(Method method, String bucket, String object, int expirySeconds) throws Exception {
        return getPresignedObjectUrl(method, bucket, object, expirySeconds, null);
    }

    public String getPresignedObjectUrl(
            Method method,
            String bucket,
            String object,
            int expirySeconds,
            Map<String, String> extraQueryParams
    ) throws Exception {
        GetPresignedObjectUrlArgs.Builder builder = GetPresignedObjectUrlArgs.builder()
                .method(method)
                .bucket(bucket)
                .object(object)
                .expiry(expirySeconds);

        if (extraQueryParams != null && !extraQueryParams.isEmpty()) {
            builder.extraQueryParams(extraQueryParams);
        }

        return publicMinioClient.getPresignedObjectUrl(builder.build());
    }
}
